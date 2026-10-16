"""Análise do áudio: deteção dos troços de silêncio (passo 4 do UC-VID-001).

Só o som é lido (DQ-002), por isso a análise é rápida e não mexe na imagem.
"""
import subprocess
import time

import numpy as np

import config
import media
import segments as seg
from errors import JobError


def _audio_filter(background_music):
    if background_music:
        lo, hi = config.VOICE_BAND_HZ
        # dar prioridade às frequências da voz quando há música de fundo (A3)
        return ["-af", f"highpass=f={lo},lowpass=f={hi}"]
    return []


def read_levels(path, duration_sec, background_music, control, on_progress=None):
    """Nível (dBFS) de cada janela de 10 ms do áudio, lido em streaming do FFmpeg."""
    sr = config.ANALYSIS_SAMPLE_RATE
    win = int(round(sr * config.ANALYSIS_WINDOW_SEC))
    cmd = [
        "ffmpeg", "-nostdin", "-v", "error", "-i", path, "-vn",
        *_audio_filter(background_music),
        "-ac", "1", "-ar", str(sr), "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1",
    ]
    expected_bytes = max(1, int(duration_sec * sr * 2))
    chunk_bytes = win * 2 * 500  # 5 s de áudio por leitura

    levels = []
    leftover = np.zeros(0, dtype=np.int16)
    read_bytes = 0
    last_progress = 0.0

    proc = media.spawn(cmd, control, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    with media.Watchdog(control):
        while True:
            data = proc.stdout.read(chunk_bytes)
            if not data:
                break
            read_bytes += len(data)
            samples = np.frombuffer(data[: len(data) - (len(data) % 2)], dtype=np.int16)
            if leftover.size:
                samples = np.concatenate([leftover, samples])
            n_full = samples.size // win
            if n_full:
                block = samples[: n_full * win].astype(np.float32).reshape(n_full, win) / 32768.0
                rms = np.sqrt(np.mean(block * block, axis=1))
                levels.extend((20.0 * np.log10(rms + 1e-10)).tolist())
            leftover = samples[n_full * win:]

            control.check()
            now = time.monotonic()
            if on_progress and now - last_progress >= config.PROGRESS_MIN_INTERVAL_SEC:
                on_progress(min(99, int(read_bytes * 100 / expected_bytes)))
                last_progress = now

        stderr = proc.stderr.read().decode("utf-8", errors="ignore")
        code = proc.wait()

    control.check()
    if code != 0:
        raise JobError("unreadable_video", "Não foi possível ler o som deste vídeo.", {"ffmpeg": stderr[-500:]})
    if leftover.size:
        tail = leftover.astype(np.float32) / 32768.0
        levels.append(float(20.0 * np.log10(np.sqrt(np.mean(tail * tail)) + 1e-10)))
    return levels


def waveform(levels, points=config.WAVEFORM_POINTS, floor_db=-60.0):
    """Linha temporal do áudio: até `points` valores entre 0 e 1 (DQ-008)."""
    if not levels:
        return []
    arr = np.asarray(levels, dtype=np.float32)
    buckets = np.array_split(arr, min(points, arr.size))
    peaks = np.array([b.max() for b in buckets])
    norm = np.clip((peaks - floor_db) / -floor_db, 0.0, 1.0)
    return [round(float(v), 3) for v in norm]


def analyze(path, options, user_type, control, on_progress=None):
    opts = seg.validate_options(options)
    meta = media.probe(path)
    media.check_limits(meta, user_type)

    duration = meta["durationSec"]
    levels = read_levels(path, duration, opts["backgroundMusic"], control, on_progress)
    if not levels:
        raise JobError("unreadable_video", "Não foi possível ler o som deste vídeo.")

    found, silence_ratio, reason, suggestion = seg.detect_segments(
        levels, config.ANALYSIS_WINDOW_SEC, duration, opts
    )

    result = {
        "options": opts,
        "video": {
            "durationSec": round(duration, 3),
            "width": meta["width"],
            "height": meta["height"],
            "fps": round(meta["fps"], 3),
            "sizeBytes": meta["sizeBytes"],
        },
        "segments": seg.to_json(found),
        "savings": seg.savings(duration, found),
        "silenceRatio": round(silence_ratio, 3),
        "waveform": waveform(levels),
        "waveformWindowSec": round(duration / max(1, min(config.WAVEFORM_POINTS, len(levels))), 4),
        "noSegmentsReason": reason,
        "suggestedProfile": suggestion,
    }
    if reason == "too_silent":
        result["message"] = (
            "Quase todo o áudio foi considerado silêncio, por isso não foram propostos cortes. "
            "As opções podem não ser adequadas a este vídeo: experimente o perfil Suave."
        )
    elif reason == "none_found":
        result["message"] = (
            "Não foram encontradas pausas com as opções escolhidas. Experimente o perfil Agressivo."
        )
    return result
