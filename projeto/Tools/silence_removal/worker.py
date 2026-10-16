"""Worker RabbitMQ do serviço de remoção de silêncios (UC-VID-001).

Mensagens recebidas em `silence_removal_queue` (com prioridade):
    {
      "messageId": "...", "jobId": "...",
      "procedure": "silence_analyze" | "silence_apply",
      "userId": "...", "userType": "free" | "premium",
      "parameters": {
        "inputVideoURI": "./images/users/<u>/projects/<p>/src/video.mp4",
        "outputVideoURI": "./images/.../out/video-sem-silencios.mp4",   # só no apply
        "options": {"profile": "equilibrado", "thresholdDb": -35, "minPauseSec": 0.7,
                    "marginMs": 150, "backgroundMusic": false},          # só no analyze
        "segments": [{"start": 1.2, "end": 2.5}, ...]                    # só no apply
      }
    }

Cancelamento: {"jobId": "..."} publicado na exchange `picturas` com routing key `silence_cancel`.
Resultados e progresso (status "progress") em `silence_results_queue`.
"""
import collections
import datetime
import functools
import json
import threading
import time
import traceback

import pika
from pika.exchange_type import ExchangeType

import analyzer
import config
import cutter
from errors import JobError, JobCancelled
from media import JobControl

PROCEDURES = ("silence_analyze", "silence_apply")


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class SilenceWorker:
    def __init__(self):
        self._jobs = {}                      # jobId -> JobControl
        self._jobs_lock = threading.Lock()
        # cancelamentos que chegaram antes do pedido ser entregue a esta instância
        self._early_cancels = collections.OrderedDict()
        self._counter = 0
        self._connection = None
        self._channel = None

    # --- ligação ---------------------------------------------------------------
    def _connect(self):
        params = pika.ConnectionParameters(
            host=config.RABBITMQ_HOST,
            port=config.RABBITMQ_PORT,
            credentials=pika.PlainCredentials(config.RABBITMQ_USER, config.RABBITMQ_PASS),
            heartbeat=60,
            blocked_connection_timeout=300,
        )
        self._connection = pika.BlockingConnection(params)
        ch = self._connection.channel()
        ch.exchange_declare(exchange=config.EXCHANGE, exchange_type=ExchangeType.direct, durable=True)

        ch.queue_declare(queue=config.REQUESTS_QUEUE, durable=True, arguments=config.REQUESTS_QUEUE_ARGS)
        ch.queue_bind(exchange=config.EXCHANGE, queue=config.REQUESTS_QUEUE, routing_key=config.REQUESTS_QUEUE)
        ch.queue_declare(queue=config.RESULTS_QUEUE, durable=True)
        ch.queue_bind(exchange=config.EXCHANGE, queue=config.RESULTS_QUEUE, routing_key=config.RESULTS_QUEUE)

        cancel_q = ch.queue_declare(queue="", exclusive=True, auto_delete=True).method.queue
        ch.queue_bind(exchange=config.EXCHANGE, queue=cancel_q, routing_key=config.CANCEL_ROUTING_KEY)

        # até MAX_CONCURRENT_JOBS pedidos em paralelo; os restantes ficam na fila (REQ-VID-SIL-030)
        ch.basic_qos(prefetch_count=config.MAX_CONCURRENT_JOBS)
        ch.basic_consume(queue=config.REQUESTS_QUEUE, on_message_callback=self._on_request, auto_ack=False)
        ch.basic_consume(queue=cancel_q, on_message_callback=self._on_cancel, auto_ack=True)
        self._channel = ch

    def run(self):
        while True:
            try:
                self._connect()
                print(f"[INIT] À espera de pedidos em '{config.REQUESTS_QUEUE}' "
                      f"(até {config.MAX_CONCURRENT_JOBS} em simultâneo)", flush=True)
                self._channel.start_consuming()
            except pika.exceptions.AMQPConnectionError as e:
                print(f"[WARN] Ligação ao RabbitMQ perdida ({e!r}); nova tentativa em 5 s", flush=True)
                time.sleep(5)
            except KeyboardInterrupt:
                break

    # --- publicação (sempre feita na thread da ligação) -------------------------
    def _threadsafe(self, fn):
        conn = self._connection
        if conn and conn.is_open:
            conn.add_callback_threadsafe(fn)

    def _publish(self, routing_key, body):
        payload = json.dumps(body)

        def _do():
            self._channel.basic_publish(
                exchange=config.EXCHANGE,
                routing_key=routing_key,
                body=payload,
                properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
            )
        self._threadsafe(_do)

    def _ack(self, delivery_tag):
        self._threadsafe(functools.partial(self._channel.basic_ack, delivery_tag))

    def _progress(self, job, status, progress):
        # O progresso vai para o serviço de projetos, que o guarda (para repor o estado quando a
        # ligação em tempo real volta, REQ-VID-SIL-019) e o reencaminha para o browser.
        self._publish(config.RESULTS_QUEUE, {
            "messageId": f"silence-progress-{job['jobId']}",
            "jobId": job["jobId"],
            "procedure": job["procedure"],
            "timestamp": _now(),
            "status": "progress",
            "phaseStatus": status,
            "progress": progress,
        })

    def _result(self, job, status, started, output=None, error=None):
        self._counter += 1
        msg = {
            "messageId": f"silence-result-{self._counter}-{job['jobId']}",
            "correlationId": job.get("messageId"),
            "jobId": job["jobId"],
            "procedure": job["procedure"],
            "timestamp": _now(),
            "status": status,
            "metadata": {
                "processingTime": round((time.monotonic() - started) * 1000),
                "microservice": config.MICROSERVICE_NAME,
            },
        }
        if output is not None:
            msg["output"] = output
        if error is not None:
            msg["error"] = error
        self._publish(config.RESULTS_QUEUE, msg)

    # --- callbacks ---------------------------------------------------------------
    def _on_cancel(self, ch, method, properties, body):
        try:
            job_id = json.loads(body.decode()).get("jobId")
        except (ValueError, AttributeError):
            return
        if not job_id:
            return
        with self._jobs_lock:
            control = self._jobs.get(job_id)
            if control is None:
                self._early_cancels[job_id] = time.monotonic()
                while len(self._early_cancels) > 1000:
                    self._early_cancels.popitem(last=False)
        if control is not None:
            print(f"[CANCEL] job={job_id}", flush=True)
            control.cancel()

    def _on_request(self, ch, method, properties, body):
        try:
            msg = json.loads(body.decode())
            params = msg.get("parameters") or {}
            job = {
                "messageId": msg.get("messageId"),
                "jobId": str(msg.get("jobId") or msg.get("messageId") or ""),
                "procedure": msg.get("procedure"),
                "userId": msg.get("userId"),
                "userType": msg.get("userType") or "free",
                "params": params,
            }
        except (ValueError, AttributeError) as e:
            print(f"[ERROR] Mensagem inválida descartada: {e!r}", flush=True)
            ch.basic_ack(method.delivery_tag)
            return

        if not job["jobId"] or job["procedure"] not in PROCEDURES:
            print(f"[ERROR] Pedido inválido: jobId={job['jobId']!r} procedure={job['procedure']!r}", flush=True)
            if job["jobId"]:
                self._result(job, "error", time.monotonic(), error={
                    "code": 2400, "kind": "invalid_request",
                    "message": f"Procedimento desconhecido: {job['procedure']}",
                })
            ch.basic_ack(method.delivery_tag)
            return

        # DQ-004: no MVP não há repetição automática. Uma mensagem reentregue significa que o serviço
        # morreu a meio desse pedido; responde-se com erro em vez de o voltar a processar.
        if method.redelivered:
            print(f"[ERROR] job={job['jobId']} interrompido por reinício do serviço; não é repetido", flush=True)
            self._result(job, "error", time.monotonic(), error={
                "code": 2406, "kind": "processing_failed",
                "message": "O processamento foi interrompido porque o serviço reiniciou. O vídeo original não "
                           "foi alterado e nada foi descontado; tente novamente.",
            })
            ch.basic_ack(method.delivery_tag)
            return

        timeout = config.ANALYSIS_TIMEOUT_SEC if job["procedure"] == "silence_analyze" else None
        control = JobControl(timeout)
        with self._jobs_lock:
            self._jobs[job["jobId"]] = control
            if self._early_cancels.pop(job["jobId"], None) is not None:
                control.cancel()

        threading.Thread(
            target=self._run_job, args=(job, control, method.delivery_tag), daemon=True
        ).start()

    # --- execução ----------------------------------------------------------------
    def _run_job(self, job, control, delivery_tag):
        started = time.monotonic()
        is_analyze = job["procedure"] == "silence_analyze"
        running_status = "analyzing" if is_analyze else "processing"
        params = job["params"]
        print(f"[START] job={job['jobId']} {job['procedure']} input={params.get('inputVideoURI')} "
              f"user={job['userType']}", flush=True)

        def on_progress(pct):
            self._progress(job, running_status, pct)

        try:
            control.check()
            self._progress(job, running_status, 0)
            if is_analyze:
                output = analyzer.analyze(
                    params.get("inputVideoURI"), params.get("options"), job["userType"], control, on_progress
                )
                summary = f"troços={len(output['segments'])} poupança={output['savings']['removedSec']}s"
            else:
                output = cutter.apply_cuts(
                    params.get("inputVideoURI"), params.get("outputVideoURI"), params.get("segments"),
                    job["userType"], control, on_progress,
                )
                summary = (f"duração {output['savings']['originalSec']}s -> {output['result']['durationSec']}s "
                           f"desfasamento={output['result']['avDiffMs']}ms")
            self._result(job, "success", started, output=output)
            print(f"[SUCCESS] job={job['jobId']} {summary} "
                  f"tempo={(time.monotonic() - started):.1f}s", flush=True)

        except JobError as e:
            if isinstance(e, JobCancelled) or control.cancel_event.is_set():
                # cancelado (o serviço de projetos pode já ter apagado o ficheiro de entrada,
                # por isso qualquer erro depois do cancelamento conta como cancelamento)
                print(f"[CANCELLED] job={job['jobId']}", flush=True)
                self._result(job, "cancelled", started, error={
                    "code": 2409, "kind": "cancelled", "message": "O pedido foi cancelado pelo utilizador."})
            else:
                print(f"[ERROR] job={job['jobId']} {e.kind}: {e.message} {e.details or ''}", flush=True)
                self._result(job, "error", started, error={
                    "code": e.code, "kind": e.kind, "message": e.message,
                    "details": {k: v for k, v in e.details.items() if k != "ffmpeg"},
                })
        except Exception as e:  # noqa: BLE001 - nunca deixar um pedido sem resposta
            traceback.print_exc()
            self._result(job, "error", started, error={
                "code": 2406, "kind": "processing_failed",
                "message": "Ocorreu um erro inesperado no processamento. O vídeo original não foi alterado; "
                           "tente novamente.",
                "details": {"exception": repr(e)[:300]},
            })
        finally:
            with self._jobs_lock:
                self._jobs.pop(job["jobId"], None)
            self._ack(delivery_tag)


if __name__ == "__main__":
    print("[INIT] A iniciar o serviço de remoção de silêncios...", flush=True)
    SilenceWorker().run()
