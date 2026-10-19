"""UC-VID-004 stage 2: RabbitMQ transport and externally killable job processes.

JSON requests on subtitle_generation_queue (exchange picturas, direct):
  {"jobId":"uuid", "operation":"transcribe", "videoPath":"./images/video.mp4",
   "language":"pt", "model":"base"}  # model is optional
  {"jobId":"uuid", "operation":"generate_srt", "duration":12.5,
   "segments":[{"text":"Olá", "start":0, "end":1}],
   "outputPath":"./images/subtitles/output.srt"}
Use one jobId per logical job; its transcribe and generate_srt may share that ID.
All media/output paths must resolve inside SUBTITLE_MEDIA_ROOT. Output parents
must already exist. No HTTP, storage-service, quota or project integration.

Every result uses {jobId, type:"subtitle_result", operation, status, timestamp}.
Statuses: processing (+phase), transcribed (+duration,+segments), completed
(+outputPath), failed (+error:{code,message,retryable}), cancelled.
Unparseable requests have jobId:null unless AMQP correlation_id can recover it.
Publishers must use persistent messages and publisher confirms, including cancel.

Cancel: publish {"jobId":"uuid"} to picturas/subtitle_cancel. Each instance has
an exclusive broadcast queue. A durable cancel inbox also preserves commands
when no worker is online. Cancellation tombstones on the shared worker-state volume
let every instance observe cancellation, including after reconnect/restart.
All instances MUST share the same SUBTITLE_WORK_ROOT. Tombstones are retained;
job IDs must not be recycled. Terminal receipts are also retained on this volume
to replay an already finished operation if an ACK/connection is lost. They are
internal delivery state, not Project Service or storage-service results.
Retention/garbage collection belongs to a later
lifecycle integration, not an arbitrary TTL here.

SUBTITLE_WORK_ROOT holds cancelled/, receipts/, locks/ and jobs/ metadata.
SUBTITLE_MODEL_CACHE holds only model weights/cache. Both roots must be disjoint
from SUBTITLE_MEDIA_ROOT. Audio/draft temporaries use the reserved SUBTITLE_TEMP_ROOT
subdirectory of media; requests cannot access that area. No periodic cancel-file
or cancel-inbox polling: broadcast callbacks notify live instances; durable
commands are drained on connection, dispatch, terminal decision and notification.
An OS lock per job orders cancellation against terminal commit. Operation leases
prevent simultaneous duplicate execution and allow safe orphan reclamation.

All consumers use manual ACK. Confirmed terminal result -> ACK. Validation and
permanent/unexpected errors -> failed then ACK. Transient execution errors get
one confirmed retry (x-subtitle-attempt=1), then failed/ACK. Broker redeliveries
replay an existing terminal receipt or return interrupted/failed, then ACK;
they never re-execute STT. If result/retry publication
fails, NACK/requeue once when possible; a redelivered message is NACKed without
requeue on a second publication failure (logged). A closed channel leaves ACK
to the broker's redelivery path. There is no exactly-once delivery guarantee.

The parent alone owns Pika and commits final SRT publication. Each job runs this
same file with --execute-job in a new process group. Cancel/timeout/shutdown
terminate the group (Windows: taskkill /T /F; POSIX: killpg), including FFmpeg
and blocking native STT. The parent then removes its owned workspace. STT loads
once per child; reloading between jobs is the intentional cost of isolation.
SIGKILL/power loss cannot run cleanup; orphan workspaces are reclaimed on restart
or redelivery using OS-released operation leases. A shared local Docker volume
with filesystem locking semantics is required (not independent per-host disks).
"""

import datetime
import errno
import hashlib
import json
import math
import os
import re
import signal
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import uuid
from dataclasses import asdict, dataclass
from contextlib import contextmanager
from pathlib import Path

import config
import media
import srt
import stt
from errors import SubtitleError


def _json_read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _json_write(path, value):
    """Only for worker-owned state, never a user-provided media file."""
    path = Path(path)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=".state-", delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(value, stream, ensure_ascii=False, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _job_id(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", value) is not None


def _safe_path(value, root):
    if not isinstance(value, str) or not value.strip() or "\x00" in value:
        raise SubtitleError("invalid_request", "O caminho deve ser uma string não vazia.")
    lexical = Path(value).expanduser()
    if ".." in lexical.parts:
        raise SubtitleError("invalid_request", "Componentes '..' não são permitidos.")
    absolute = lexical.absolute()
    # Reject links even when they currently point inside the root. resolve() also
    # checks the real destination, including existing ancestors of new outputs.
    if any(part.is_symlink() or (hasattr(part, "is_junction") and part.is_junction())
           for part in (absolute, *absolute.parents)):
        raise SubtitleError("invalid_request", "Symlinks/junctions não são permitidos nos caminhos.")
    path = absolute.resolve()
    root = Path(root).expanduser().resolve()
    if not path.is_relative_to(root):
        raise SubtitleError("invalid_request", "O caminho está fora da raiz permitida.")
    return path


def _inside(value):
    path = _safe_path(value, config.MEDIA_ROOT)
    if path.is_relative_to(Path(config.TEMP_ROOT).expanduser().resolve()):
        raise SubtitleError("invalid_request", "A área temporária do worker está reservada.")
    return path


def _media_workspace(directory):
    path = _safe_path(str(Path(config.TEMP_ROOT).expanduser().absolute() / directory.name), config.MEDIA_ROOT)
    if path.parent != Path(config.TEMP_ROOT).expanduser().resolve() or not path.name.startswith("job-"):
        raise SubtitleError("invalid_request", "Workspace temporário inválido.")
    return path


def _acquire_lock(path, blocking=True):
    """OS advisory lock: released on crash, never unlink the shared lock inode."""
    stream = Path(path).open("a+b")
    try:
        if os.name == "nt":
            import msvcrt
            if stream.seek(0, os.SEEK_END) == 0:
                stream.write(b"\0")
                stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK if blocking else msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        return stream
    except OSError as exc:
        stream.close()
        if blocking or exc.errno not in {errno.EACCES, errno.EAGAIN}:
            raise
        return None


def _release_lock(stream):
    if stream is None:
        return
    try:
        if os.name == "nt":
            import msvcrt
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
    finally:
        stream.close()


def _segments(value, duration):
    if not isinstance(value, list):
        raise SubtitleError("invalid_request", "segments deve ser uma lista de {text,start,end}.")
    if any(not isinstance(item, dict) or set(item) != {"text", "start", "end"} for item in value):
        raise SubtitleError("invalid_request", "Cada segmento deve conter apenas text, start e end.")
    return srt.validate_segments([srt.Segment(**item) for item in value], duration)


def validate_request(message):
    if not isinstance(message, dict) or not _job_id(message.get("jobId")):
        raise SubtitleError("invalid_request", "É obrigatório um jobId válido (1 a 128 caracteres).")
    operation = message.get("operation")
    if operation == "transcribe":
        required = {"jobId", "operation", "videoPath", "language"}
        allowed = required | {"model"}
        if not required <= set(message) or not set(message) <= allowed:
            raise SubtitleError("invalid_request", "transcribe exige jobId, operation, videoPath e language; model é opcional.")
        _inside(message["videoPath"])
        stt.validate_language(message["language"])
        if message.get("model", config.DEFAULT_MODEL) not in config.MODEL_CHOICES:
            raise SubtitleError("invalid_request", "O modelo deve ser base ou small (multilingue).")
    elif operation == "generate_srt":
        if set(message) != {"jobId", "operation", "duration", "segments", "outputPath"}:
            raise SubtitleError("invalid_request", "generate_srt exige jobId, operation, duration, segments e outputPath.")
        _segments(message["segments"], message["duration"])
        if _inside(message["outputPath"]).suffix.lower() != ".srt":
            raise SubtitleError("invalid_request", "outputPath deve ter a extensão .srt.")
    else:
        raise SubtitleError("invalid_request", "operation deve ser transcribe ou generate_srt.")
    return message


def _error(exc):
    kind = exc.kind if isinstance(exc, SubtitleError) else "internal_error"
    return {"code": kind.upper(), "message": str(exc) if isinstance(exc, SubtitleError)
            else "Erro inesperado no processamento de legendas.",
            "retryable": kind in {"media_timeout", "output_busy", "stt_failed", "job_timeout"}}


def _event(job_id, operation, status, **fields):
    return {"jobId": job_id, "type": "subtitle_result", "operation": operation,
            "status": status, "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(), **fields}


def execute_job(directory):
    """Child entry point: no RabbitMQ connection and no final output publication."""
    directory = _safe_path(str(directory), Path(config.WORK_ROOT) / "jobs")
    if directory.parent != (Path(config.WORK_ROOT).expanduser().resolve() / "jobs") or not directory.name.startswith("job-"):
        raise SubtitleError("invalid_request", "Workspace interno inválido.")
    temporary = _media_workspace(directory)
    def phase(name):
        _json_write(directory / "phase.json", {"phase": name})
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    try:
        request = validate_request(_json_read(directory / "request.json"))
        if request["operation"] == "transcribe":
            phase("validating")
            info = media.probe(_inside(request["videoPath"]))
            phase("extracting_audio")
            with media.extracted_audio(info, temp_root=temporary) as audio:
                phase("transcribing")
                recognizer = stt.SpeechRecognizer(
                    model_name=request.get("model", config.DEFAULT_MODEL),
                    model_cache=config.MODEL_CACHE, offline=config.MODEL_OFFLINE,
                )
                cues = srt.validate_segments(
                    recognizer.transcribe(audio, request["language"], offset=info.audio_offset), info.duration,
                )
            result = {"status": "transcribed", "duration": info.duration,
                      "segments": [asdict(cue) for cue in cues]}
        else:
            phase("generating_srt")
            cues = _segments(request["segments"], request["duration"])
            srt.write_srt(temporary / "draft.srt", cues, request["duration"])
            result = {"status": "completed"}
        _json_write(directory / "result.json", result)
        return 0
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        if not isinstance(exc, SubtitleError):
            traceback.print_exc()
        _json_write(directory / "result.json", {"status": "failed", "error": _error(exc)})
        return 1


@dataclass
class ActiveJob:
    request: dict
    method: object
    properties: object
    attempt: int
    workspace: object
    process: subprocess.Popen
    started: float
    lease: object
    phase: str = "starting"
    cancelled: bool = False
    owned_output: tuple | None = None
    committed: bool = False


def stop_process(process):
    """Terminate only this child's process tree, never another worker's jobs."""
    if os.name == "nt":
        if process.poll() is None:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=10, check=False)
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    if os.name != "nt":
        # The leader may have exited while a native/FFmpeg descendant survived.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


class SubtitleWorker:
    def __init__(self):
        self.root = Path(config.WORK_ROOT).expanduser().resolve()
        media_root = Path(config.MEDIA_ROOT).expanduser().resolve()
        model_root = Path(config.MODEL_CACHE).expanduser().resolve()
        roots = [self.root, media_root, model_root]
        if any(a.is_relative_to(b) or b.is_relative_to(a)
               for index, a in enumerate(roots) for b in roots[index + 1:]):
            raise SubtitleError("invalid_config", "Media, cache do modelo e estado exigem raízes separadas.")
        self.temporary = _safe_path(str(Path(config.TEMP_ROOT).expanduser().absolute()), media_root)
        if self.temporary == media_root:
            raise SubtitleError("invalid_config", "SUBTITLE_TEMP_ROOT deve ser uma subpasta reservada de media.")
        self.temporary.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.cancellations = self.root / "cancelled"
        self.cancellations.mkdir(parents=True, exist_ok=True)
        (self.root / "jobs").mkdir(exist_ok=True)
        (self.root / "receipts").mkdir(exist_ok=True)
        (self.root / "locks").mkdir(exist_ok=True)
        self.active = {}
        self.connection = None
        self.channel = None
        self.stopping = False

    def _lock_path(self, job_id, operation=None):
        key = f"job:{job_id}" if operation is None else f"operation:{job_id}:{operation}"
        return self.root / "locks" / (hashlib.sha256(key.encode()).hexdigest() + ".lock")

    @contextmanager
    def _guard(self, job_id):
        # Serializes cancel markers and terminal commits across all instances.
        lock = _acquire_lock(self._lock_path(job_id))
        try:
            yield
        finally:
            _release_lock(lock)

    def _cleanup_workspace(self, directory):
        temporary = _media_workspace(directory)
        if temporary.exists():
            shutil.rmtree(temporary)

    def _reclaim_orphans(self, job_id=None):
        # No PID checks: containers have separate PID namespaces. A lease is
        # held for the entire operation and released by the OS after a crash.
        for directory in (self.root / "jobs").glob("job-*"):
            request_file = directory / "request.json"
            if not request_file.is_file():
                continue  # A different worker may still be creating it.
            request = _json_read(request_file)
            if job_id is not None and request["jobId"] != job_id:
                continue
            lease = _acquire_lock(self._lock_path(request["jobId"], request["operation"]), blocking=False)
            if lease is not None:
                try:
                    self._cleanup_workspace(directory)
                    shutil.rmtree(directory)
                finally:
                    _release_lock(lease)

    def _cancel_path(self, job_id):
        return self.cancellations / (hashlib.sha256(job_id.encode()).hexdigest() + ".json")

    def _is_cancelled(self, job_id):
        return self._cancel_path(job_id).exists()

    def _receipt_path(self, job_id, operation):
        key = hashlib.sha256(f"{job_id}:{operation}".encode()).hexdigest()
        return self.root / "receipts" / f"{key}.json"

    def _fingerprint(self, request):
        return hashlib.sha256(json.dumps(request, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

    def _receipt(self, request):
        path = self._receipt_path(request["jobId"], request["operation"])
        if not path.exists():
            return None
        stored = _json_read(path)
        if stored["fingerprint"] != self._fingerprint(request):
            raise SubtitleError("invalid_request", "O mesmo jobId/operation não pode ser reutilizado com parâmetros diferentes.")
        return stored["event"]

    def _record(self, request, event):
        _json_write(self._receipt_path(request["jobId"], request["operation"]),
                    {"fingerprint": self._fingerprint(request), "event": event})

    def _publish(self, event):
        import pika
        self.channel.basic_publish(
            config.EXCHANGE, config.RESULTS_QUEUE,
            json.dumps(event, ensure_ascii=False, allow_nan=False).encode("utf-8"),
            properties=pika.BasicProperties(delivery_mode=2, content_type="application/json",
                                            correlation_id=event["jobId"]), mandatory=True,
        )

    def _publication_failed(self, method, event):
        print(f"[MQ] publicação falhou jobId={event['jobId']} status={event['status']}; "
              f"redelivered={method.redelivered} requeue={not method.redelivered}", flush=True)
        if self.channel.is_open:
            self.channel.basic_nack(method.delivery_tag, requeue=not method.redelivered)

    def _respond(self, method, event):
        try:
            self._publish(event)
        except Exception:
            self._publication_failed(method, event)
            raise
        self.channel.basic_ack(method.delivery_tag)

    def _decode(self, body):
        if len(body) > config.MAX_REQUEST_BYTES:
            raise SubtitleError("invalid_request", "Mensagem excede o limite técnico de 2 MiB.")
        try:
            value = json.loads(body, parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
        except (UnicodeError, ValueError) as exc:
            raise SubtitleError("invalid_request", "A mensagem deve ser JSON UTF-8 válido, sem NaN/Infinity.") from exc
        return value

    def _on_cancel(self, channel, method, properties, body):
        message = None
        try:
            message = self._decode(body)
            if not isinstance(message, dict) or set(message) != {"jobId"} or not _job_id(message["jobId"]):
                raise SubtitleError("invalid_request", "Cancelamento exige apenas um jobId válido.")
            job_id = message["jobId"]
            with self._guard(job_id):
                completed = self._receipt_path(job_id, "generate_srt")
                if not (completed.exists() and _json_read(completed)["event"]["status"] == "completed"):
                    marker = self._cancel_path(job_id)
                    if not marker.exists():
                        _json_write(marker, {"jobId": job_id})
                    for state in self.active.values():
                        if state.request["jobId"] == job_id:
                            state.cancelled = True
            channel.basic_ack(method.delivery_tag)
        except Exception as exc:
            if message is not None and isinstance(message, dict) and set(message) == {"jobId"} and _job_id(message["jobId"]):
                # Never ACK a valid command if persistence/locking failed.
                # Closing/reconnecting the channel returns it to RabbitMQ.
                raise
            job_id = message.get("jobId") if isinstance(message, dict) and _job_id(message.get("jobId")) else None
            self._respond(method, _event(job_id, "cancel", "failed", error=_error(exc)))

    def _on_broadcast_cancel(self, channel, method, properties, body):
        self._on_cancel(channel, method, properties, body)
        self._drain_cancellations()

    def _drain_cancellations(self):
        # Drain durable commands before starting work, including after downtime.
        while True:
            method, properties, body = self.channel.basic_get(config.CANCEL_QUEUE, auto_ack=False)
            if method is None:
                return
            self._on_cancel(self.channel, method, properties, body)

    def _on_request(self, channel, method, properties, body):
        request = None
        try:
            request = self._decode(body)
            validate_request(request)
            if properties.correlation_id is not None and properties.correlation_id != request["jobId"]:
                raise SubtitleError("invalid_request", "AMQP correlation_id deve corresponder a jobId.")
            headers = properties.headers or {}
            attempt = headers.get("x-subtitle-attempt", 0)
            if type(attempt) is not int or not 0 <= attempt <= config.MAX_TRANSIENT_RETRIES:
                raise SubtitleError("invalid_request", "Contador de tentativas inválido.")
        except Exception as exc:
            if not isinstance(exc, SubtitleError):
                exc = SubtitleError("invalid_request", "Cabeçalhos ou tipos de campos inválidos.")
            job_id = request.get("jobId") if isinstance(request, dict) and _job_id(request.get("jobId")) else None
            if job_id is None and _job_id(properties.correlation_id):
                job_id = properties.correlation_id
            operation = request.get("operation") if isinstance(request, dict) and isinstance(request.get("operation"), str) else None
            self._respond(method, _event(job_id, operation, "failed", error=_error(exc)))
            return

        self._drain_cancellations()
        job_id = request["jobId"]
        if method.redelivered:
            self._reclaim_orphans(job_id)
        lease = None
        try:
            with self._guard(job_id):
                receipt = self._receipt(request)
                # A completed SRT wins over a late cancel; a cancellation may
                # supersede a transcribed receipt before generate_srt starts.
                if self._is_cancelled(job_id):
                    receipt = _event(job_id, request["operation"], "cancelled")
                    self._record(request, receipt)
                elif receipt is None and method.redelivered:
                    receipt = _event(job_id, request["operation"], "failed", error={
                        "code": "INTERRUPTED", "message": "Entrega interrompida; não é repetida automaticamente.", "retryable": False})
                    self._record(request, receipt)
                if receipt is None:
                    if request["operation"] == "generate_srt":
                        srt.validate_output(_inside(request["outputPath"]))
                    lease = _acquire_lock(self._lock_path(job_id, request["operation"]), blocking=False)
        except SubtitleError as exc:
            self._respond(method, _event(job_id, request["operation"], "failed", error=_error(exc)))
            return
        if receipt is not None:
            self._respond(method, receipt)
            return
        if lease is None:
            self._respond(method, _event(job_id, request["operation"], "processing", phase="already_running"))
            return
        workspace = tempfile.TemporaryDirectory(prefix="job-", dir=self.root / "jobs")
        process = None
        try:
            directory = Path(workspace.name)
            _json_write(directory / "request.json", request)
            _media_workspace(directory).mkdir(mode=0o700)
            self._publish(_event(job_id, request["operation"], "processing", phase="starting", attempt=attempt))
            with (directory / "child.log").open("wb") as log:
                process = subprocess.Popen(
                    [sys.executable, "-B", "-u", str(Path(__file__).resolve()), "--execute-job", str(directory)],
                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=log,
                    start_new_session=os.name != "nt",
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
                )
            self.active[method.delivery_tag] = ActiveJob(request, method, properties, attempt, workspace,
                                                       process, time.monotonic(), lease)
        except Exception as exc:
            if process is not None:
                stop_process(process)
            self._cleanup_workspace(Path(workspace.name))
            workspace.cleanup()
            _release_lock(lease)
            self._respond(method, _event(job_id, request["operation"], "failed", error=_error(exc)))

    def _remove_owned_output(self, state):
        if state.owned_output:
            path, digest = state.owned_output
            if path.is_file() and hashlib.sha256(path.read_bytes()).digest() == digest:
                path.unlink()
            state.owned_output = None

    def _deliver_result(self, state, event, retry=False):
        import pika
        job_id = state.request["jobId"]
        if retry:
            self.channel.basic_publish(
                config.EXCHANGE, config.REQUESTS_QUEUE, json.dumps(state.request).encode("utf-8"),
                properties=pika.BasicProperties(delivery_mode=2, content_type="application/json",
                    correlation_id=job_id, priority=min(state.properties.priority or 0, 10),
                    headers={"x-subtitle-attempt": state.attempt + 1}), mandatory=True,
            )
            self.channel.basic_ack(state.method.delivery_tag)
        else:
            self._respond(state.method, event)

    def _finish(self, tag, state, result):
        job_id = state.request["jobId"]
        try:
            self._drain_cancellations()
            with self._guard(job_id):
                receipt = self._receipt(state.request)
                if state.cancelled or self._is_cancelled(job_id):
                    result = {"status": "cancelled"}
                    receipt = None
                if receipt is None:
                    try:
                        if result["status"] == "completed":
                            request = state.request
                            output = srt.write_srt(_inside(request["outputPath"]),
                                _segments(request["segments"], request["duration"]), request["duration"])
                            state.owned_output = (output, hashlib.sha256(output.read_bytes()).digest())
                            result = {"status": "completed", "outputPath": str(output)}
                    except SubtitleError as exc:
                        result = {"status": "failed", "error": _error(exc)}
                    event = _event(job_id, state.request["operation"], **result)
                    retry = (result["status"] == "failed" and result["error"]["retryable"]
                             and state.attempt < config.MAX_TRANSIENT_RETRIES)
                    if not retry:
                        self._record(state.request, event)
                        state.committed = True
                else:
                    event, retry = receipt, False
                    state.committed = True
            # Release the operation lease before publishing a retry: another
            # instance may receive it immediately after publisher confirmation.
            if retry:
                self._cleanup_workspace(Path(state.workspace.name))
                state.workspace.cleanup()
                _release_lock(state.lease)
                state.lease = None
            self._deliver_result(state, event, retry)
        except Exception:
            if not state.committed:
                self._remove_owned_output(state)
            # _respond already NACKed on publication failure; reconnect rather
            # than issuing an ACK/NACK twice for the same delivery tag.
            raise
        finally:
            self._cleanup_workspace(Path(state.workspace.name))
            state.workspace.cleanup()
            _release_lock(state.lease)
            self.active.pop(tag, None)

    def _poll(self):
        for tag, state in list(self.active.items()):
            directory = Path(state.workspace.name)
            if state.cancelled:
                stop_process(state.process)
                self._finish(tag, state, {"status": "cancelled"})
                continue
            if time.monotonic() - state.started > config.JOB_TIMEOUT_SEC:
                stop_process(state.process)
                self._finish(tag, state, {"status": "failed", "error": _error(
                    SubtitleError("job_timeout", "O processamento excedeu o tempo máximo configurado."))})
                continue
            phase_file = directory / "phase.json"
            if phase_file.exists():
                phase = _json_read(phase_file)["phase"]
                if phase != state.phase:
                    state.phase = phase
                    self._publish(_event(state.request["jobId"], state.request["operation"], "processing", phase=phase))
            if state.process.poll() is not None:
                result_file = directory / "result.json"
                if result_file.exists():
                    result = _json_read(result_file)
                else:
                    result = {"status": "failed", "error": {"code": "CHILD_EXITED",
                        "message": "O processo de legendas terminou sem resposta válida.", "retryable": False}}
                self._finish(tag, state, result)

    def _connect(self):
        import pika
        self.connection = pika.BlockingConnection(pika.ConnectionParameters(
            host=config.RABBITMQ_HOST, port=config.RABBITMQ_PORT,
            credentials=pika.PlainCredentials(config.RABBITMQ_USER, config.RABBITMQ_PASS),
            heartbeat=60, blocked_connection_timeout=10, socket_timeout=10,
        ))
        channel = self.connection.channel()
        self.channel = channel
        channel.exchange_declare(config.EXCHANGE, exchange_type="direct", durable=True)
        for queue, arguments in [(config.REQUESTS_QUEUE, config.REQUESTS_QUEUE_ARGS),
                                 (config.RESULTS_QUEUE, {}), (config.CANCEL_QUEUE, {})]:
            channel.queue_declare(queue=queue, durable=True, arguments=arguments)
            channel.queue_bind(queue=queue, exchange=config.EXCHANGE,
                               routing_key=config.CANCEL_ROUTING_KEY if queue == config.CANCEL_QUEUE else queue)
        channel.confirm_delivery()
        channel.basic_qos(prefetch_count=config.MAX_CONCURRENT_JOBS)
        broadcast = channel.queue_declare(queue="", exclusive=True, auto_delete=True).method.queue
        channel.queue_bind(queue=broadcast, exchange=config.EXCHANGE, routing_key=config.CANCEL_ROUTING_KEY)
        # Durable inbox is drained with basic_get so prefetch cannot hide a
        # queued cancel in a pending callback when a request is about to start.
        channel.basic_consume(broadcast, self._on_broadcast_cancel, auto_ack=False)
        self._drain_cancellations()
        self._reclaim_orphans()
        channel.basic_consume(config.REQUESTS_QUEUE, self._on_request, auto_ack=False)

    def shutdown(self):
        for state in list(self.active.values()):
            stop_process(state.process)
            if not state.committed:
                self._remove_owned_output(state)
            self._cleanup_workspace(Path(state.workspace.name))
            state.workspace.cleanup()
            _release_lock(state.lease)
        self.active.clear()
        if self.connection and self.connection.is_open:
            self.connection.close()

    def run(self):
        try:
            while not self.stopping:
                try:
                    self._connect()
                    print(f"[READY] {config.REQUESTS_QUEUE}; concurrency={config.MAX_CONCURRENT_JOBS}", flush=True)
                    while not self.stopping:
                        self.connection.process_data_events(time_limit=0.1)
                        self._poll()
                except KeyboardInterrupt:
                    self.stopping = True
                except Exception:
                    traceback.print_exc()
                finally:
                    self.shutdown()
                if not self.stopping:
                    time.sleep(5)
        finally:
            self.shutdown()


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--execute-job":
        return execute_job(sys.argv[2])
    if len(sys.argv) != 1:
        print("Uso: python worker.py (configuração por ambiente)", file=sys.stderr)
        return 2
    if (config.DEFAULT_MODEL not in config.MODEL_CHOICES or config.DEVICE != "cpu"
            or config.COMPUTE_TYPE != "int8" or config.MAX_CONCURRENT_JOBS < 1
            or config.CPU_THREADS < 1 or not math.isfinite(config.JOB_TIMEOUT_SEC)
            or config.JOB_TIMEOUT_SEC <= 0):
        print("Configuração inválida: CPU/INT8, modelo base/small, concorrência/timeout positivos.", file=sys.stderr)
        return 2
    worker = SubtitleWorker()
    def stop(signum, frame):
        worker.stopping = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    worker.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
