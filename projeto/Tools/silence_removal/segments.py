"""Lógica pura dos troços de silêncio (sem FFmpeg nem numpy, para poder ser testada isoladamente).

Um troço é um tuplo (início, fim) em segundos.
"""
import math

import config
from errors import JobError


def _num(value, name):
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise JobError("invalid_options", f"O valor de '{name}' não é um número válido.")
    if math.isnan(v) or math.isinf(v):
        raise JobError("invalid_options", f"O valor de '{name}' não é um número válido.")
    return v


def _in_range(value, rng, name, unit):
    lo, hi = rng
    if not (lo <= value <= hi):
        raise JobError(
            "invalid_options",
            f"O valor de '{name}' ({value:g} {unit}) tem de estar entre {lo:g} e {hi:g} {unit}.",
        )


def validate_options(options):
    """Valida as opções de deteção (REQ-VID-SIL-001). Valores em falta vêm do perfil indicado ou do Equilibrado."""
    options = options or {}
    profile_name = str(options.get("profile") or config.DEFAULT_PROFILE).lower()
    if profile_name not in config.PROFILES:
        raise JobError("invalid_options", f"O perfil '{profile_name}' não existe. Use Suave, Equilibrado ou Agressivo.")
    base = config.PROFILES[profile_name]

    threshold = _num(options.get("thresholdDb", base["thresholdDb"]), "sensibilidade")
    min_pause = _num(options.get("minPauseSec", base["minPauseSec"]), "duração mínima da pausa")
    margin = _num(options.get("marginMs", base["marginMs"]), "margem")

    _in_range(threshold, config.THRESHOLD_DB_RANGE, "sensibilidade", "dB")
    _in_range(min_pause, config.MIN_PAUSE_SEC_RANGE, "duração mínima da pausa", "s")
    _in_range(margin, config.MARGIN_MS_RANGE, "margem", "ms")

    return {
        "profile": profile_name,
        "thresholdDb": threshold,
        "minPauseSec": min_pause,
        "marginMs": margin,
        "backgroundMusic": bool(options.get("backgroundMusic", False)),
    }


def silent_runs(levels_db, threshold_db, window_sec, duration_sec):
    """Sequências contíguas de janelas com nível abaixo do limiar."""
    runs = []
    start = None
    for i, level in enumerate(levels_db):
        if level < threshold_db:
            if start is None:
                start = i
        elif start is not None:
            runs.append((start * window_sec, min(i * window_sec, duration_sec)))
            start = None
    if start is not None:
        runs.append((start * window_sec, duration_sec))
    return [(s, e) for (s, e) in runs if e > s]


def merge_close(segments, max_gap_sec):
    merged = []
    for s, e in sorted(segments):
        if merged and s - merged[-1][1] < max_gap_sec:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def shrink(segments, margin_sec):
    """Mantém a margem antes e depois da fala (RN8)."""
    out = []
    for s, e in segments:
        s2, e2 = s + margin_sec, e - margin_sec
        if e2 > s2:
            out.append((s2, e2))
    return out


def drop_short(segments, min_sec):
    # pequena tolerância para erros de vírgula flutuante (ex.: 0.7 - 1e-12)
    return [(s, e) for (s, e) in segments if (e - s) >= min_sec - 1e-9]


def detect_segments(levels_db, window_sec, duration_sec, options):
    """REQ-VID-SIL-007/008/015. Devolve (troços, fração de silêncio, motivo, perfil sugerido)."""
    runs = silent_runs(levels_db, options["thresholdDb"], window_sec, duration_sec)
    silent_time = sum(e - s for s, e in runs)
    silence_ratio = silent_time / duration_sec if duration_sec > 0 else 0.0

    if silence_ratio > config.MAX_SILENCE_RATIO:
        return [], silence_ratio, "too_silent", "suave"

    # 1) juntar falhas muito curtas (cliques/ruído no meio de uma pausa)
    segs = merge_close(runs, config.MERGE_GAP_SEC)
    # 2) margem antes e depois da fala
    segs = shrink(segs, options["marginMs"] / 1000.0)
    # 3) descartar o que ficou abaixo da duração mínima (a mínima conta depois da margem)
    segs = drop_short(segs, options["minPauseSec"])
    # 4) juntar troços separados por menos de 0,1 s
    segs = merge_close(segs, config.MERGE_GAP_SEC)

    if not segs:
        return [], silence_ratio, "none_found", "agressivo"
    return segs, silence_ratio, None, None


def savings(duration_sec, segments):
    """Poupança prevista (REQ-VID-SIL-010/012)."""
    removed = sum(e - s for s, e in segments)
    final = max(0.0, duration_sec - removed)
    pct = (removed / duration_sec * 100.0) if duration_sec > 0 else 0.0
    return {
        "originalSec": round(duration_sec, 3),
        "finalSec": round(final, 3),
        "removedSec": round(removed, 3),
        "removedPct": round(pct, 1),
    }


def validate_user_segments(raw, duration_sec, tolerance_sec=0.05):
    """Valida os troços confirmados pelo utilizador (REQ-VID-SIL-011/016)."""
    if not isinstance(raw, list) or not raw:
        raise JobError("invalid_segments", "Não há nenhum troço selecionado para remover.")
    segs = []
    for item in raw:
        if isinstance(item, dict):
            s, e = item.get("start"), item.get("end")
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            s, e = item
        else:
            raise JobError("invalid_segments", "Formato de troço inválido.")
        s, e = _num(s, "início do troço"), _num(e, "fim do troço")
        if s < 0 or e <= s:
            raise JobError("invalid_segments", f"O troço {s:.2f}s–{e:.2f}s é inválido.")
        if e > duration_sec + tolerance_sec:
            raise JobError(
                "invalid_segments",
                f"O troço {s:.2f}s–{e:.2f}s ultrapassa a duração do vídeo ({duration_sec:.2f}s).",
            )
        segs.append((s, min(e, duration_sec)))
    segs.sort()
    for (s1, e1), (s2, e2) in zip(segs, segs[1:]):
        if s2 < e1:
            raise JobError("invalid_segments", f"Os troços {s1:.2f}s–{e1:.2f}s e {s2:.2f}s–{e2:.2f}s sobrepõem-se.")
    return segs


def keep_intervals(duration_sec, remove, fps):
    """Intervalos a manter, alinhados à grelha de fotogramas para o som e a imagem terem
    exatamente a mesma duração em cada troço (REQ-VID-SIL-021 / RN4)."""
    frame = 1.0 / fps if fps and fps > 0 else 0.0

    def snap(t):
        return round(t / frame) * frame if frame else t

    keeps = []
    cursor = 0.0
    for s, e in remove:
        if s > cursor:
            keeps.append((cursor, s))
        cursor = max(cursor, e)
    if cursor < duration_sec:
        keeps.append((cursor, duration_sec))

    snapped = []
    for s, e in keeps:
        s2 = snap(s)
        e2 = min(snap(e), snap(duration_sec)) if frame else e
        if e2 - s2 >= max(frame, 1e-3):
            snapped.append((round(s2, 6), round(e2, 6)))
    return snapped


def to_json(segments):
    return [
        {"start": round(s, 3), "end": round(e, 3), "duration": round(e - s, 3)}
        for s, e in segments
    ]
