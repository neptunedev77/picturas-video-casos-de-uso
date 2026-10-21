"""Single-pass compression; never writes to the input or publishes a partial file."""
import os
from pathlib import Path
import queue
import shutil
import subprocess
import tempfile
import threading
import time

from config import PROFILES
from media import CompressionError, check_limits, probe


def build_command(source, output, quality):
    if quality not in PROFILES:
        raise CompressionError("INVALID_QUALITY", "Quality must be high, balanced or small.")
    profile = PROFILES[quality]
    video_filter = "pad=ceil(iw/2)*2:ceil(ih/2)*2"
    if "maxLongEdge" in profile:
        long_edge, short_edge = profile["maxLongEdge"], profile["maxShortEdge"]
        # Bound each orientation without upscaling; round down to even dimensions.
        video_filter = (
            f"scale=w='min(iw,if(gte(iw,ih),{long_edge},{short_edge}))':"
            f"h='min(ih,if(gte(iw,ih),{short_edge},{long_edge}))':"
            "force_original_aspect_ratio=decrease:force_divisible_by=2"
        )
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-i", str(source),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", video_filter,
        "-c:v", "libx264", "-preset", profile["preset"], "-crf", str(profile["crf"]),
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", profile["audioBitrate"],
        "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", str(output),
    ]


def processing_timeout(duration_seconds):
    return max(60, 2 * duration_seconds)


def compress(source, output, quality, user_type, progress=lambda value: None, tick=lambda: None,
             before_start=None, launch_failed=None, check_cancel=lambda: None, launched=lambda: None):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output or (output.exists() and source.exists() and os.path.samefile(source, output)):
        raise CompressionError("INVALID_PATH", "Input and output must be different files.")
    if output.exists():
        raise CompressionError("RESULT_EXISTS", "The result already exists; it will not be overwritten.")
    # Validate quality before launching either media executable.
    build_command(source, output, quality)
    meta = probe(source)
    if before_start is None:
        check_limits(meta, user_type)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Conservative admission check; ENOSPC is still handled by the worker.
    if shutil.disk_usage(output.parent).free < max(meta["sizeBytes"] * 2, 64 * 1024 * 1024):
        raise CompressionError("NO_CAPACITY", "Not enough disk space to compress this video.")
    work = Path(tempfile.mkdtemp(prefix="encode-", dir=output.parent))
    partial = work / "partial.mp4"
    proc = None
    reader = None
    timeout_seconds = processing_timeout(meta["durationSec"])
    percent = 0
    lines = queue.Queue()
    authorized = False
    try:
        # A file drains stderr continuously and avoids deadlocking FFmpeg's pipes.
        with tempfile.TemporaryFile() as errors:
            if before_start is not None:
                # Actual ffprobe metadata + current server-side profile/quota, not the queued snapshot.
                account = before_start(meta)
                authorized = True
                check_limits(meta, account["userType"])
            check_cancel()
            try:
                # Exclude probing, admission and quota authorization from FFmpeg time.
                started = time.monotonic()
                proc = subprocess.Popen(build_command(source, partial, quality), stdout=subprocess.PIPE, stderr=errors)
            except OSError as e:
                raise CompressionError("LAUNCH_FAILED", "FFmpeg could not be launched; no video was processed.") from e
            # From here on no exception, including a lost control response, refunds quota.
            last_update = started

            def check_timeout():
                if time.monotonic() - started > timeout_seconds:
                    raise CompressionError("PROCESSING_TIMEOUT", "Compression exceeded its processing time limit.")

            launched()
            progress(0)

            def read_progress():
                for line in proc.stdout:
                    lines.put(line.decode("utf-8", errors="replace").strip())

            reader = threading.Thread(target=read_progress, daemon=True)
            reader.start()
            last_control = time.monotonic()
            while proc.poll() is None:
                check_timeout()
                tick()  # Service AMQP heartbeats without sharing Pika across threads.
                if time.monotonic() - last_control >= 1:
                    check_cancel()
                    last_control = time.monotonic()
                while True:
                    try:
                        line = lines.get_nowait()
                    except queue.Empty:
                        break
                    if line.startswith("out_time_us="):
                        try:
                            seconds = int(line.split("=", 1)[1]) / 1_000_000
                            percent = max(percent, min(98, int(seconds / meta["durationSec"] * 98)))
                        except ValueError:
                            pass
                now = time.monotonic()
                if now - last_update >= 2:
                    progress(percent)
                    last_update = now
                check_timeout()
                time.sleep(0.1)
            # A process that exits between polls must not escape the deadline check.
            check_timeout()
            reader.join(timeout=2)
            check_cancel()
            if proc.returncode != 0:
                errors.seek(0)
                detail = errors.read()[-1500:].decode("utf-8", errors="replace")
                print(f"[COMPRESSION][FFMPEG] {detail}", flush=True)
                raise CompressionError("PROCESSING_FAILED", "FFmpeg could not compress this video.")
        progress(99)
        result = probe(partial)
        if abs(result["durationSec"] - meta["durationSec"]) > max(1, meta["durationSec"] * 0.01):
            raise CompressionError("INVALID_RESULT", "The output video has an invalid duration.")
        if not result["sizeBytes"]:
            raise CompressionError("INVALID_RESULT", "The output video is empty.")
        check_cancel()
        # Same filesystem: readers never see the in-progress encode.
        partial.rename(output)
        return {
            "sizeBytes": result["sizeBytes"], "originalSizeBytes": meta["sizeBytes"],
            "durationSec": result["durationSec"], "width": result["width"], "height": result["height"],
            "reductionPercent": round((1 - result["sizeBytes"] / meta["sizeBytes"]) * 100, 2),
        }
    except Exception:
        # Compensation is possible only when this invocation never launched FFmpeg.
        if proc is None and authorized and launch_failed is not None:
            try:
                launch_failed()
            except Exception as refund_error:
                print(f"[COMPRESSION][REFUND] {refund_error}", flush=True)
        raise
    finally:
        if proc is not None:
            if proc.poll() is None:
                proc.kill()
            proc.wait()
            if reader is not None:
                reader.join(timeout=2)
            if proc.stdout is not None:
                proc.stdout.close()
        shutil.rmtree(work, ignore_errors=True)
