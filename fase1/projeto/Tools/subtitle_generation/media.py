"""Read-only probing and temporary audio extraction with FFmpeg/ffprobe.

Commands use argument lists (no shell), absolute paths and bounded execution.
TemporaryDirectory owns the decoded WAV, including on failure or Ctrl+C.
"""

import json
import math
import subprocess
import tempfile
import wave
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

import config
from errors import SubtitleError


@dataclass(frozen=True)
class MediaInfo:
    path: Path
    duration: float
    audio_index: int
    audio_offset: float  # First audio sample relative to the container timeline.


def _number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _run(command, timeout):
    """Blocking child execution; subprocess.run kills/waits on timeout or error.

    No shell interpolation. Normal KeyboardInterrupt unwinds this call, then
    the owning TemporaryDirectory. There is no distributed cancellation here.
    """
    try:
        result = subprocess.run(
            command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=timeout, check=False,
        )
    except FileNotFoundError as exc:
        raise SubtitleError(
            "missing_executable",
            f"Executável não encontrado: {command[0]}. Instale FFmpeg/ffprobe "
            "e configure o PATH ou as opções --ffmpeg/--ffprobe.",
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise SubtitleError("media_timeout", f"{command[0]} excedeu o tempo máximo de {timeout:g} s.") from exc
    except OSError as exc:
        raise SubtitleError("media_failed", f"Não foi possível executar {command[0]}: {exc}") from exc
    if result.returncode:
        details = result.stderr.decode("utf-8", errors="replace").strip()[-600:]
        raise SubtitleError("media_failed", f"{command[0]} não conseguiu ler/descodificar o vídeo: {details}")
    return result.stdout


def probe(video, ffprobe="ffprobe") -> MediaInfo:
    """Validate a local MP4 and select the first decodable-looking audio stream.

    Metadata alone cannot prove decodability; extracted_audio verifies the WAV.
    No H.264/AAC, resolution, duration or account limits are imposed here.
    """
    source = Path(video).expanduser().resolve()
    if not source.is_file() or source.stat().st_size == 0:
        raise SubtitleError("invalid_input", f"Vídeo inexistente, vazio ou não regular: {source}")
    if source.suffix.lower() != ".mp4":
        raise SubtitleError("unsupported_container", "A entrada deve ser um ficheiro MP4 (.mp4).")
    raw = _run([
        str(ffprobe), "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(source),
    ], config.PROBE_TIMEOUT_SEC)
    try:
        data = json.loads(raw)
        container = data["format"]
        streams = data["streams"]
        if not isinstance(container, dict) or not isinstance(streams, list):
            raise ValueError("invalid metadata")
        if any(not isinstance(stream, dict) for stream in streams):
            raise ValueError("invalid stream")
    except (ValueError, KeyError, TypeError) as exc:
        raise SubtitleError("invalid_metadata", "ffprobe devolveu metadados inválidos.") from exc
    if "mp4" not in str(container.get("format_name", "")).split(","):
        raise SubtitleError("unsupported_container", "O conteúdo do ficheiro não é um contentor MP4 suportado.")
    videos = [s for s in streams if s.get("codec_type") == "video"
              and not s.get("disposition", {}).get("attached_pic")]
    duration = _number(container.get("duration"))
    if not videos or not duration or duration <= 0:
        raise SubtitleError("invalid_video", "O MP4 não possui vídeo com duração válida.")
    if not any((_number(s.get("width")) or 0) > 0 and
               (_number(s.get("height")) or 0) > 0 for s in videos):
        raise SubtitleError("invalid_video", "A faixa de vídeo possui dimensões inválidas.")
    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
    if not audio_streams:
        raise SubtitleError("no_audio", "O vídeo não contém uma faixa de áudio.")
    usable = [s for s in audio_streams if s.get("codec_name") not in (None, "", "unknown")
              and (_number(s.get("channels")) or 0) > 0
              and (_number(s.get("sample_rate")) or 0) > 0]
    if not usable:
        raise SubtitleError("unusable_audio", "O vídeo não contém uma faixa de áudio utilizável.")
    audio = usable[0]
    try:
        index = int(audio["index"])
        if index < 0:
            raise ValueError("negative index")
    except (KeyError, ValueError, TypeError) as exc:
        raise SubtitleError("invalid_metadata", "Índice da faixa de áudio inválido.") from exc
    origin = _number(container.get("start_time"))
    if origin is None:
        origin = _number(videos[0].get("start_time")) or 0.0
    audio_start = _number(audio.get("start_time"))
    offset = (audio_start if audio_start is not None else origin) - origin
    if offset < -0.001 or offset >= duration:
        raise SubtitleError("invalid_metadata", "O início da faixa de áudio está fora da duração do vídeo.")
    return MediaInfo(source, duration, index, max(0.0, offset))


@contextmanager
def extracted_audio(info: MediaInfo, ffmpeg="ffmpeg", timeout=config.EXTRACTION_TIMEOUT_SEC,
                    temp_root=None):
    """Yield owned mono PCM WAV; remove only our directory, never user inputs.

    temp_root optionally lets a future process supervisor own the workspace.
    Normal success, exceptions and KeyboardInterrupt all unwind this context.
    Forced OS termination cannot execute Python cleanup handlers.
    """
    parent = Path(temp_root).expanduser().resolve() if temp_root is not None else None
    with tempfile.TemporaryDirectory(prefix="picturas-subtitles-", dir=parent) as directory:
        audio = Path(directory) / "audio.wav"
        _run([
            str(ffmpeg), "-nostdin", "-hide_banner", "-v", "error", "-xerror",
            "-i", str(info.path), "-map", f"0:{info.audio_index}", "-vn",
            "-ac", "1", "-ar", str(config.SAMPLE_RATE), "-c:a", "pcm_s16le",
            "-f", "wav", "-y", str(audio),
        ], timeout)
        try:
            with wave.open(str(audio), "rb") as wav:
                valid = (wav.getnframes() > 0 and wav.getnchannels() == 1
                         and wav.getsampwidth() == 2 and wav.getframerate() == config.SAMPLE_RATE)
        except (OSError, EOFError, wave.Error) as exc:
            raise SubtitleError("unusable_audio", "Não foi possível extrair áudio PCM válido do vídeo.") from exc
        if not valid:
            raise SubtitleError("unusable_audio", "A faixa de áudio descodificada está vazia ou é inválida.")
        yield audio
