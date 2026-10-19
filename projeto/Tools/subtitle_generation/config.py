"""Technical defaults for the UC-VID-004 CLI and worker; no plan/quota rules."""

import os
from pathlib import Path

DEFAULT_MODEL = os.getenv("SUBTITLE_MODEL", "base")
MODEL_CHOICES = ("base", "small")  # Multilingual models, never their .en variants.
DEVICE = "cpu"
COMPUTE_TYPE = os.getenv("SUBTITLE_COMPUTE_TYPE", "int8")
CPU_THREADS = int(os.getenv("SUBTITLE_CPU_THREADS", min(4, os.cpu_count() or 1)))
SAMPLE_RATE = 16000
PROBE_TIMEOUT_SEC = 30
EXTRACTION_TIMEOUT_SEC = 300
BEAM_SIZE = 5

# RabbitMQ / process supervision. No users, plans or storage-service rules.
EXCHANGE = "picturas"
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "user")
RABBITMQ_PASS = os.getenv("RABBITMQ_PASS", "password")
REQUESTS_QUEUE = os.getenv("SUBTITLE_REQUESTS_QUEUE", "subtitle_generation_queue")
RESULTS_QUEUE = os.getenv("SUBTITLE_RESULTS_QUEUE", "subtitle_results_queue")
CANCEL_ROUTING_KEY = os.getenv("SUBTITLE_CANCEL_ROUTING_KEY", "subtitle_cancel")
CANCEL_QUEUE = os.getenv("SUBTITLE_CANCEL_QUEUE", "subtitle_cancel_queue")
REQUESTS_QUEUE_ARGS = {"x-max-priority": 10}
MAX_CONCURRENT_JOBS = int(os.getenv("SUBTITLE_MAX_CONCURRENT_JOBS", "1"))
MEDIA_ROOT = os.getenv("SUBTITLE_MEDIA_ROOT", "./images")
WORK_ROOT = os.getenv("SUBTITLE_WORK_ROOT", "./subtitle_worker_state")
MODEL_CACHE = os.getenv("SUBTITLE_MODEL_CACHE", "./subtitle_model_cache")
TEMP_ROOT = os.getenv("SUBTITLE_TEMP_ROOT", str(Path(MEDIA_ROOT) / ".subtitle_tmp"))
MODEL_OFFLINE = os.getenv("SUBTITLE_MODEL_OFFLINE", "0") == "1"
JOB_TIMEOUT_SEC = float(os.getenv("SUBTITLE_JOB_TIMEOUT_SEC", "1800"))
MAX_REQUEST_BYTES = 2 * 1024 * 1024
MAX_TRANSIENT_RETRIES = 1
