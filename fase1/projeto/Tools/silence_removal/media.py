"""Acesso ao FFmpeg/ffprobe: leitura de metadados e execução cancelável com tempo máximo."""
import json
import os
import subprocess
import threading
import time

import config
import errors
from errors import JobError, JobCancelled


class JobControl:
    """Estado partilhado de um pedido: cancelamento, tempo máximo e processo FFmpeg em curso."""

    def __init__(self, timeout_sec=None):
        self.cancel_event = threading.Event()
        self.deadline = time.monotonic() + timeout_sec if timeout_sec else None
        self.phase = "analyze"
        self._proc = None
        self._lock = threading.Lock()

    def set_timeout(self, timeout_sec, phase):
        self.deadline = time.monotonic() + timeout_sec
        self.phase = phase

    def cancel(self):
        self.cancel_event.set()
        self._kill()

    def attach(self, proc):
        with self._lock:
            self._proc = proc

    def detach(self):
        with self._lock:
            self._proc = None

    def _kill(self):
        with self._lock:
            if self._proc and self._proc.poll() is None:
                self._proc.kill()

    def check(self):
        """Lança exceção se o pedido foi cancelado ou excedeu o tempo máximo."""
        if self.cancel_event.is_set():
            self._kill()
            raise JobCancelled()
        if self.deadline and time.monotonic() > self.deadline:
            self._kill()
            raise errors.timeout(self.phase)


def probe(path):
    """Metadados do vídeo através do ffprobe."""
    if not path or not os.path.isfile(path):
        raise errors.unreadable_video()
    cmd = [
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    except subprocess.TimeoutExpired:
        raise errors.unreadable_video()
    if res.returncode != 0:
        raise errors.unreadable_video()
    try:
        data = json.loads(res.stdout.decode("utf-8", errors="ignore"))
    except ValueError:
        raise errors.unreadable_video()

    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    fmt = data.get("format", {})
    if video is None:
        raise errors.unreadable_video()

    def _f(v, default=0.0):
        try:
            return float(v)
        except (TypeError, ValueError):
            return default

    def _rate(r):
        try:
            n, d = str(r).split("/")
            return float(n) / float(d) if float(d) else 0.0
        except (ValueError, ZeroDivisionError):
            return _f(r)

    fps = _rate(video.get("avg_frame_rate")) or _rate(video.get("r_frame_rate")) or 25.0
    duration = _f(fmt.get("duration")) or _f(video.get("duration"))
    if duration <= 0:
        raise errors.unreadable_video()

    return {
        "durationSec": duration,
        "sizeBytes": int(_f(fmt.get("size"), os.path.getsize(path))),
        "formatName": fmt.get("format_name", ""),
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "fps": fps,
        "videoCodec": (video.get("codec_name") or "").lower(),
        "videoDurationSec": _f(video.get("duration"), duration),
        "videoFrames": int(_f(video.get("nb_frames"))),
        "baseFps": _rate(video.get("r_frame_rate")),
        "hasAudio": audio is not None,
        "audioCodec": (audio.get("codec_name") or "").lower() if audio else None,
        "audioDurationSec": _f(audio.get("duration"), duration) if audio else None,
        "sampleRate": int(_f(audio.get("sample_rate"))) if audio else None,
    }


def check_limits(meta, user_type):
    """RN2 / RN9 (validação de defesa; o serviço de projetos valida antes de pôr na fila)."""
    if meta["videoCodec"] not in config.ACCEPTED_VIDEO_CODECS or (
        meta["hasAudio"] and meta["audioCodec"] not in config.ACCEPTED_AUDIO_CODECS
    ):
        raise JobError(
            "unreadable_video",
            f"Formato não suportado (vídeo {meta['videoCodec'] or '?'}, áudio {meta['audioCodec'] or '?'}). "
            "São aceites vídeos MP4 com vídeo H.264 e áudio AAC.",
        )
    if not meta["hasAudio"]:
        raise errors.no_audio()

    plan = "premium" if user_type == "premium" else "free"
    lim = config.PLAN_LIMITS[plan]
    plan_name = "Premium" if plan == "premium" else "Gratuito"
    if meta["durationSec"] > lim["maxDurationSec"] + 0.5:
        raise JobError(
            "limit_exceeded",
            f"O vídeo tem {meta['durationSec']:.0f} s e o plano {plan_name} permite até "
            f"{lim['maxDurationSec'] // 60} minutos. Use um vídeo mais curto"
            + (" ou passe para o plano Premium." if plan == "free" else "."),
            {"limit": "duration", "value": meta["durationSec"], "max": lim["maxDurationSec"]},
        )
    # aceita vídeo na vertical: compara o lado maior com o lado maior do limite
    long_side, short_side = max(meta["width"], meta["height"]), min(meta["width"], meta["height"])
    if long_side > lim["maxWidth"] or short_side > lim["maxHeight"]:
        raise JobError(
            "limit_exceeded",
            f"A resolução do vídeo ({meta['width']}x{meta['height']}) excede o máximo do plano {plan_name} "
            f"({lim['maxWidth']}x{lim['maxHeight']}).",
            {"limit": "resolution", "value": f"{meta['width']}x{meta['height']}"},
        )
    if meta["sizeBytes"] > lim["maxBytes"]:
        raise JobError(
            "limit_exceeded",
            f"O ficheiro tem {meta['sizeBytes'] / 1024 / 1024:.0f} MB e o plano {plan_name} permite até "
            f"{lim['maxBytes'] // 1024 // 1024} MB.",
            {"limit": "size", "value": meta["sizeBytes"], "max": lim["maxBytes"]},
        )


def spawn(cmd, control, **kwargs):
    proc = subprocess.Popen(cmd, **kwargs)
    control.attach(proc)
    return proc


class Watchdog:
    """Mata o processo FFmpeg assim que o pedido é cancelado ou excede o tempo máximo,
    mesmo que a leitura da sua saída esteja bloqueada."""

    def __init__(self, control):
        self._control = control
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.wait(0.25):
            c = self._control
            if c.cancel_event.is_set() or (c.deadline and time.monotonic() > c.deadline):
                c._kill()

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join(timeout=1)
        self._control.detach()
        return False
