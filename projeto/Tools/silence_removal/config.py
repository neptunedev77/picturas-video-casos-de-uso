"""Configuração do serviço de remoção de silêncios (UC-VID-001)."""
import os

# --- RabbitMQ ---------------------------------------------------------------
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", 5672))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "user")
RABBITMQ_PASS = os.getenv("RABBITMQ_PASS", "password")

EXCHANGE = "picturas"
# Fila de pedidos (análise e aplicação). Tem prioridade: premium = 5, free = 0 (REQ-VID-SIL-018)
REQUESTS_QUEUE = "silence_removal_queue"
REQUESTS_QUEUE_ARGS = {"x-max-priority": 10}
# Resultados das análises/aplicações, consumidos pelo serviço de projetos
RESULTS_QUEUE = "silence_results_queue"
# Pedidos de cancelamento: cada instância do serviço recebe uma cópia
CANCEL_ROUTING_KEY = "silence_cancel"

# Pedidos processados em simultâneo por instância (REQ-VID-SIL-030 / DQ-003)
MAX_CONCURRENT_JOBS = int(os.getenv("SILENCE_MAX_CONCURRENT_JOBS", 2))

MICROSERVICE_NAME = "picturas-silence-removal-tool-ms"

# --- Opções de deteção (REQ-VID-SIL-001 / 002) --------------------------------
THRESHOLD_DB_RANGE = (-60.0, -20.0)
MIN_PAUSE_SEC_RANGE = (0.3, 5.0)
MARGIN_MS_RANGE = (0.0, 1000.0)

PROFILES = {
    "suave": {"thresholdDb": -40.0, "minPauseSec": 1.0, "marginMs": 250.0},
    "equilibrado": {"thresholdDb": -35.0, "minPauseSec": 0.7, "marginMs": 150.0},
    "agressivo": {"thresholdDb": -30.0, "minPauseSec": 0.4, "marginMs": 80.0},
}
DEFAULT_PROFILE = "equilibrado"

# Troços separados por menos do que isto são juntos (REQ-VID-SIL-008)
MERGE_GAP_SEC = 0.1
# Acima desta fração de silêncio não se propõem cortes (REQ-VID-SIL-015)
MAX_SILENCE_RATIO = 0.95

# --- Análise de áudio ---------------------------------------------------------
ANALYSIS_SAMPLE_RATE = 16000
ANALYSIS_WINDOW_SEC = 0.01          # resolução de 10 ms (erro nos limites <= 100 ms, REQ-033)
WAVEFORM_POINTS = 2000              # pontos da linha temporal enviados ao browser (DQ-008)
# Banda da voz usada quando o utilizador indica música de fundo (A3)
VOICE_BAND_HZ = (200, 3400)

# --- Aplicação dos cortes -----------------------------------------------------
FADE_SEC = 0.01                     # suavização em cada junção (REQ-VID-SIL-021)
MAX_AV_DESYNC_SEC = 0.040           # REQ-VID-SIL-023 / A10
MAX_DURATION_ERROR_SEC = 0.5        # REQ-VID-SIL-023
X264_PRESET = os.getenv("SILENCE_X264_PRESET", "veryfast")
X264_CRF = os.getenv("SILENCE_X264_CRF", "20")

# --- Limites por plano (RN2, RN9) ---------------------------------------------
PLAN_LIMITS = {
    "free": {"maxDurationSec": 120, "maxWidth": 1920, "maxHeight": 1080, "maxBytes": 200 * 1024 * 1024},
    "premium": {"maxDurationSec": 1800, "maxWidth": 3840, "maxHeight": 2160, "maxBytes": 2 * 1024 * 1024 * 1024},
}
ACCEPTED_VIDEO_CODECS = {"h264"}
ACCEPTED_AUDIO_CODECS = {"aac"}

# --- Tempos máximos (REQ-VID-SIL-031) -----------------------------------------
ANALYSIS_TIMEOUT_SEC = 5 * 60
def apply_timeout_sec(duration_sec):
    return 3 * duration_sec + 60

# Cadência mínima do progresso (REQ-VID-SIL-034: pelo menos a cada 5 s)
PROGRESS_MIN_INTERVAL_SEC = 2.0
