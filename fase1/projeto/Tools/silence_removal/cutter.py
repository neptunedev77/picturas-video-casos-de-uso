"""Aplicação dos cortes e verificação do resultado (passos 9 e 10 do UC-VID-001)."""
import os
import subprocess
import tempfile
import time

import config
import errors
import media
import segments as seg
from errors import JobError


def build_filter(keeps, fps):
    """Filtro FFmpeg que corta som e imagem nos mesmos tempos (RN4) e suaviza o som
    em cada junção para não se ouvirem estalidos (REQ-VID-SIL-021)."""
    parts = []
    last = len(keeps) - 1
    # os limites estão na grelha de fotogramas; recuar meio fotograma no corte da imagem evita
    # que erros de vírgula flutuante deixem cair (ou dupliquem) o fotograma da fronteira
    half = 0.5 / fps if fps and fps > 0 else 0.0
    for i, (a, b) in enumerate(keeps):
        va, vb = max(0.0, a - half), b - half
        length = b - a
        fades = []
        fade = min(config.FADE_SEC, length / 4)
        if i > 0:
            fades.append(f"afade=t=in:st=0:d={fade:.4f}")
        if i < last:
            fades.append(f"afade=t=out:st={max(0.0, length - fade):.6f}:d={fade:.4f}")
        afilters = ",".join(["asetpts=PTS-STARTPTS", *fades])
        parts.append(f"[0:v:0]trim=start={va:.6f}:end={vb:.6f},setpts=PTS-STARTPTS[v{i}]")
        parts.append(f"[0:a:0]atrim=start={a:.6f}:end={b:.6f},{afilters}[a{i}]")
    inputs = "".join(f"[v{i}][a{i}]" for i in range(len(keeps)))
    parts.append(f"{inputs}concat=n={len(keeps)}:v=1:a=1[outv][outa]")
    return ";\n".join(parts)


def verify(path, expected_sec):
    """REQ-VID-SIL-023: som e imagem com durações a <= 40 ms e duração final a <= 0,5 s da prevista."""
    meta = media.probe(path)
    if not meta["hasAudio"]:
        raise errors.desync(expected_sec)
    # Depois do concat, o MP4 regista a duração da imagem até ao *início* do último fotograma
    # (falta 1 fotograma); soma-se a duração desse fotograma para obter o fim real da imagem.
    # (avg_frame_rate é calculado a partir dessa duração errada, por isso usa-se r_frame_rate.)
    video_sec = meta["videoDurationSec"]
    if meta["videoFrames"] and meta["baseFps"]:
        video_sec = max(video_sec, meta["videoFrames"] / meta["baseFps"])
    av_diff = abs(video_sec - meta["audioDurationSec"])
    if av_diff > config.MAX_AV_DESYNC_SEC:
        raise errors.desync(av_diff)
    if abs(meta["durationSec"] - expected_sec) > config.MAX_DURATION_ERROR_SEC:
        raise JobError(
            "processing_failed",
            "O novo vídeo não tem a duração prevista e não foi disponibilizado. "
            "A operação foi devolvida; tente aplicar os cortes novamente.",
            {"expectedSec": round(expected_sec, 3), "actualSec": round(meta["durationSec"], 3)},
        )
    return meta, av_diff


def _safe_remove(path):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


def apply_cuts(input_path, output_path, raw_segments, user_type, control, on_progress=None):
    if not output_path:
        raise JobError("invalid_request", "Falta o caminho do vídeo de saída.")
    if os.path.abspath(input_path) == os.path.abspath(output_path):
        # RN5 / REQ-VID-SIL-040: o original nunca é alterado
        raise JobError("invalid_request", "O vídeo de saída não pode substituir o vídeo original.")

    meta = media.probe(input_path)
    media.check_limits(meta, user_type)
    duration = meta["durationSec"]
    control.set_timeout(config.apply_timeout_sec(duration), "apply")

    remove = seg.validate_user_segments(raw_segments, duration)
    keeps = seg.keep_intervals(duration, remove, meta["fps"])
    if not keeps:
        raise JobError("invalid_segments", "Os troços selecionados cobrem o vídeo inteiro; não sobraria nada.")
    expected = sum(b - a for a, b in keeps)

    out_dir = os.path.dirname(os.path.abspath(output_path))
    os.makedirs(out_dir, exist_ok=True)
    # ficheiros temporários na mesma pasta, para a troca final ser atómica (A6, REQ-VID-SIL-024)
    fd, tmp_out = tempfile.mkstemp(prefix=".silence-", suffix=".mp4", dir=out_dir)
    os.close(fd)
    fd, script = tempfile.mkstemp(prefix=".silence-", suffix=".txt", dir=out_dir)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(build_filter(keeps, meta["fps"]))

    cmd = [
        "ffmpeg", "-nostdin", "-y", "-v", "error",
        "-i", input_path,
        "-filter_complex_script", script,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-preset", config.X264_PRESET, "-crf", str(config.X264_CRF),
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart",
        "-progress", "pipe:1", "-nostats",
        tmp_out,
    ]

    try:
        proc = media.spawn(cmd, control, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        last_progress = 0.0
        with media.Watchdog(control):
            for raw in proc.stdout:
                line = raw.decode("utf-8", errors="ignore").strip()
                if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
                    try:
                        done_sec = int(line.split("=", 1)[1]) / 1_000_000
                    except ValueError:
                        continue
                    now = time.monotonic()
                    if on_progress and now - last_progress >= config.PROGRESS_MIN_INTERVAL_SEC:
                        on_progress(min(95, int(done_sec * 95 / max(expected, 0.001))))
                        last_progress = now
            stderr = proc.stderr.read().decode("utf-8", errors="ignore")
            code = proc.wait()

        control.check()
        if code != 0:
            raise JobError(
                "processing_failed",
                "Ocorreu um erro ao gerar o novo vídeo. O vídeo original não foi alterado e a operação "
                "foi devolvida; tente novamente.",
                {"ffmpeg": stderr[-500:]},
            )

        out_meta, av_diff = verify(tmp_out, expected)
        os.replace(tmp_out, output_path)
        if on_progress:
            on_progress(100)

        return {
            "outputVideoURI": output_path,
            "removedSegments": seg.to_json(remove),
            "savings": seg.savings(duration, remove),
            "result": {
                "durationSec": round(out_meta["durationSec"], 3),
                "expectedSec": round(expected, 3),
                "avDiffMs": round(av_diff * 1000, 1),
                "width": out_meta["width"],
                "height": out_meta["height"],
                "sizeBytes": out_meta["sizeBytes"],
            },
        }
    finally:
        _safe_remove(tmp_out)
        _safe_remove(script)
