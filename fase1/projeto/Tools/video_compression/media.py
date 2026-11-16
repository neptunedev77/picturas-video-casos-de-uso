"""Minimal MP4/H.264 validation for UC-VID-002 (audio is optional)."""
import json
import math
from pathlib import Path
import subprocess

from config import PLAN_LIMITS


class CompressionError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def probe(filename):
    try:
        response = subprocess.run(
            ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(filename)],
            capture_output=True, timeout=30, check=True,
        )
        data = json.loads(response.stdout)
        fmt = data.get("format", {})
        video = next(s for s in data.get("streams", []) if s.get("codec_type") == "video")
        # ffprobe shares a demuxer for MOV/MP4: inspect the ISO BMFF brand as well.
        brand = fmt.get("tags", {}).get("major_brand", "").strip().lower()
        formats = fmt.get("format_name", "").split(",")
        mp4_brand = brand.startswith(("iso", "mp4", "avc")) or brand in {
            "dash", "m4v", "msnv", "cmfc", "cmfs", "f4v",
        }
        if "mp4" not in formats or not mp4_brand:
            raise CompressionError("UNSUPPORTED_VIDEO", "Only MP4/H.264 is supported.")
        if video.get("codec_name") != "h264":
            raise CompressionError("UNSUPPORTED_VIDEO", "Only MP4/H.264 is supported.")
        duration = float(fmt.get("duration") or video.get("duration") or 0)
        width, height = int(video["width"]), int(video["height"])
        if not math.isfinite(duration) or duration <= 0 or width <= 0 or height <= 0:
            raise ValueError("Invalid video metadata")
        return {
            "format": "mp4", "videoCodec": "h264",
            "durationSec": duration, "sizeBytes": Path(filename).stat().st_size,
            "width": width, "height": height,
            "hasAudio": any(s.get("codec_type") == "audio" for s in data.get("streams", [])),
        }
    except CompressionError:
        raise
    except (OSError, ValueError, KeyError, StopIteration, subprocess.SubprocessError) as e:
        raise CompressionError("INVALID_VIDEO", "Unable to read a valid MP4/H.264 video.") from e


def check_limits(meta, user_type):
    if user_type not in PLAN_LIMITS:
        raise CompressionError("REGISTERED_ONLY", "A registered account is required.")
    limit = PLAN_LIMITS[user_type]
    if (not isinstance(meta.get("sizeBytes"), int) or meta["sizeBytes"] <= 0 or
            not isinstance(meta.get("durationSec"), (int, float)) or
            not math.isfinite(meta["durationSec"]) or meta["durationSec"] <= 0):
        raise CompressionError("INVALID_VIDEO", "Invalid video size or duration.")
    if meta["sizeBytes"] > limit["maxBytes"]:
        raise CompressionError("SIZE_LIMIT", "Video exceeds the size limit for this account.")
    if meta["durationSec"] > limit["maxDurationSec"]:
        raise CompressionError("DURATION_LIMIT", "Video exceeds the duration limit for this account.")
