"""Technical defaults for the isolated UC-VID-004 CLI; no plan/quota rules."""

import os

DEFAULT_MODEL = "base"
MODEL_CHOICES = ("base", "small")  # Multilingual models, never their .en variants.
DEVICE = "cpu"
COMPUTE_TYPE = "int8"
CPU_THREADS = min(4, os.cpu_count() or 1)
SAMPLE_RATE = 16000
PROBE_TIMEOUT_SEC = 30
EXTRACTION_TIMEOUT_SEC = 300
BEAM_SIZE = 5
