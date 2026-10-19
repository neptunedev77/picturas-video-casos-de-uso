"""Pure segment validation and UTF-8 SRT output, without STT dependencies."""

import math
import os
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from errors import SubtitleError


@dataclass(frozen=True)
class Segment:
    text: str
    start: float
    end: float


def _milliseconds(seconds):
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)):
        raise SubtitleError("invalid_timestamps", "Os timestamps devem ser números finitos em segundos.")
    if not math.isfinite(seconds) or seconds < 0:
        raise SubtitleError("invalid_timestamps", "Os timestamps devem ser finitos e não negativos.")
    return int((Decimal(str(seconds)) * 1000).to_integral_value(rounding=ROUND_HALF_UP))


def format_timestamp(seconds):
    milliseconds = _milliseconds(seconds)
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{millis:03d}"


def validate_segments(segments, duration):
    """Reject invalid, unordered or overlapping cues; ignore empty text.

    Validate both original seconds and millisecond-rounded SRT timestamps.
    Do not silently reorder, clamp or invent timing information.
    """
    duration_ms = _milliseconds(duration)
    if duration_ms <= 0:
        raise SubtitleError("invalid_timestamps", "A duração do vídeo deve ser positiva.")
    result = []
    previous_end = 0.0
    previous_end_ms = 0
    for number, segment in enumerate(segments, 1):
        if not isinstance(segment, Segment) or not isinstance(segment.text, str):
            raise SubtitleError("invalid_segments", f"O segmento {number} não contém texto e tempos válidos.")
        text = " ".join(segment.text.split())
        if not text:
            continue
        start_ms = _milliseconds(segment.start)
        end_ms = _milliseconds(segment.end)
        if segment.start >= segment.end or start_ms >= end_ms:
            raise SubtitleError("invalid_timestamps", f"O segmento {number} deve ter início anterior ao fim, também em milissegundos.")
        if segment.end > duration or end_ms > duration_ms:
            raise SubtitleError("invalid_timestamps", f"O segmento {number} ultrapassa a duração do vídeo ({duration:g} s).")
        if segment.start < previous_end or start_ms < previous_end_ms:
            raise SubtitleError("invalid_timestamps", f"O segmento {number} está fora de ordem ou sobrepõe-se ao anterior.")
        result.append(Segment(text, segment.start, segment.end))
        previous_end, previous_end_ms = segment.end, end_ms
    if not result:
        raise SubtitleError("no_speech", "Não foram reconhecidos segmentos de fala com texto. Não foi criado um SRT.")
    return result


def render_srt(segments, duration):
    cues = validate_segments(segments, duration)
    return "\n\n".join(
        f"{number}\n{format_timestamp(cue.start)} --> {format_timestamp(cue.end)}\n{cue.text}"
        for number, cue in enumerate(cues, 1)
    ) + "\n\n"


def validate_output(output, source=None):
    """Reject overwrite, source aliases and non-SRT destinations before STT."""
    destination = Path(output).expanduser()
    if destination.is_symlink():
        raise SubtitleError("invalid_output", "A saída não pode ser uma ligação simbólica.")
    destination = destination.resolve()
    if source is not None:
        original = Path(source).expanduser().resolve()
        if destination == original or (destination.exists() and original.exists()
                                       and os.path.samefile(destination, original)):
            raise SubtitleError("invalid_output", "A saída não pode substituir o vídeo original.")
    if destination.suffix.lower() != ".srt":
        raise SubtitleError("invalid_output", "O ficheiro de saída deve ter a extensão .srt.")
    if destination.exists():
        raise SubtitleError("output_exists", f"A saída já existe; escolha outro nome: {destination}")
    if not destination.parent.is_dir():
        raise SubtitleError("invalid_output", f"A pasta de saída não existe: {destination.parent}")
    return destination


@contextmanager
def _publication_lock(destination):
    """Serialize cooperating CLI writers; never remove a pre-existing lock.

    A forced process termination can leave this sidecar behind. Do not reclaim
    it automatically: another process may still own it.
    """
    lock = destination.with_name(f".{destination.name}.lock")
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise SubtitleError(
            "output_busy", f"A publicação da saída está bloqueada: {lock}. "
            "Se uma execução anterior terminou à força, confirme que já não está ativa antes de remover o lock.",
        ) from exc
    try:
        os.close(descriptor)
        yield
    finally:
        lock.unlink(missing_ok=True)


def write_srt(output, segments, duration, source=None):
    """Publish UTF-8 SRT with a same-directory temporary file and os.replace.

    Reject existing destinations and serialize this CLI's publishers with an
    exclusive sidecar lock. Recheck the destination immediately before replace.
    os.replace itself has no portable no-clobber flag: unrelated applications
    ignoring the lock must not concurrently write the same output pathname.
    Only temporary/lock files created by this call are cleaned up.
    """
    content = render_srt(segments, duration)
    destination = validate_output(output, source)
    temporary = None
    try:
        with _publication_lock(destination):
            validate_output(destination, source)
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", newline="\n", prefix=".subtitle-",
                suffix=".tmp", dir=destination.parent, delete=False,
            ) as stream:
                temporary = Path(stream.name)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            # Close the temporary before replacing: required on Windows.
            validate_output(destination, source)
            os.replace(temporary, destination)
    except OSError as exc:
        raise SubtitleError("output_failed", f"Não foi possível guardar o SRT: {exc}") from exc
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return destination
