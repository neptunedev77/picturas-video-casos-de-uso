"""UC-VID-002 configuration, independent of other video tools."""
import os
from pathlib import Path

EXCHANGE = "picturas"
REQUESTS_QUEUE = "video_compression_queue"
RESULTS_QUEUE = "video_compression_results_queue"
ROOT = Path("/app/images/video_compression")
PROFILE_VERSION = 1
PROFILES = {
    "high": {"crf": 20, "audioBitrate": "160k", "preset": "veryfast"},
    "balanced": {"crf": 25, "audioBitrate": "128k", "preset": "veryfast"},
    "small": {"crf": 30, "audioBitrate": "96k", "preset": "veryfast"},
}
# Decimal MB/GB. The existing upload remains limited to 100 MB in this block.
PLAN_LIMITS = {
    "free": {"maxBytes": 500_000_000, "maxDurationSec": 600},
    "premium": {"maxBytes": 2_000_000_000, "maxDurationSec": 3600},
}
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "user")
RABBITMQ_PASS = os.getenv("RABBITMQ_PASS", "password")
