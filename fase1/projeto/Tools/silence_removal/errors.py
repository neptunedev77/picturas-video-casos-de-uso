"""Erros do serviço, com código e mensagem em português (causa + ação, REQ-VID-SIL-034)."""

CODES = {
    "invalid_request": 2400,
    "invalid_options": 2401,
    "unreadable_video": 2402,
    "no_audio": 2403,
    "limit_exceeded": 2404,
    "invalid_segments": 2405,
    "processing_failed": 2406,
    "timeout": 2407,
    "desync": 2408,
    "cancelled": 2409,
}


class JobError(Exception):
    def __init__(self, kind, message, details=None):
        super().__init__(message)
        self.kind = kind
        self.code = CODES[kind]
        self.message = message
        self.details = details or {}


class JobCancelled(JobError):
    def __init__(self):
        super().__init__("cancelled", "O pedido foi cancelado pelo utilizador.")


def unreadable_video():
    return JobError(
        "unreadable_video",
        "Não foi possível ler este vídeo. Verifique se o ficheiro não está corrompido "
        "e se é um MP4 com vídeo H.264 e áudio AAC.",
    )


def no_audio():
    return JobError(
        "no_audio",
        "Este vídeo não tem som, por isso não é possível detetar silêncios. "
        "Escolha um vídeo com faixa de áudio.",
    )


def timeout(phase):
    what = "A análise" if phase == "analyze" else "O processamento"
    return JobError(
        "timeout",
        f"{what} demorou mais do que o tempo máximo permitido e foi interrompid{'a' if phase == 'analyze' else 'o'}. "
        "Tente novamente mais tarde ou use um vídeo mais curto.",
    )


def desync(diff_sec):
    return JobError(
        "desync",
        "O novo vídeo ficou com o som desfasado da imagem e não foi disponibilizado. "
        "A operação foi devolvida; tente aplicar os cortes novamente.",
        {"avDiffMs": round(diff_sec * 1000, 1)},
    )
