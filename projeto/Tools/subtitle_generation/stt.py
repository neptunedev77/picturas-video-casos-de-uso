"""Faster-Whisper adapter: explicit language, multilingual models, CPU/INT8.

One SpeechRecognizer owns one lazily loaded model and reuses it across calls.
This synchronous adapter is deliberately independent of CLI, queues and files
publication: a future supervisor can execute the CLI in a dedicated process.
It is not a thread-safe/concurrent inference pool.

Blocking boundaries without a cooperative cancellation hook:
* WhisperModel construction: download/cache access and native model loading.
* model.transcribe: audio decoding, feature extraction and VAD.
* iteration of the returned generator: native CTranslate2 inference.
KeyboardInterrupt is handled only once control returns to Python. A future hard
cancel must terminate the owning process and arrange workspace cleanup outside it.
"""

import math
import re
from pathlib import Path

import config
from errors import SubtitleError
from srt import Segment


def validate_language(language):
    if not isinstance(language, str) or not re.fullmatch(r"[a-z]{2,3}", language):
        raise SubtitleError("invalid_language", "Indique um código de idioma explícito, por exemplo pt, en ou es; não use auto.")
    if language == "auto":
        raise SubtitleError("invalid_language", "A deteção automática de idioma não está disponível; indique, por exemplo, pt.")
    return language


class SpeechRecognizer:
    """Reuse this object for sequential transcriptions; construct no global model.

    Cache weights persist and are never deleted here. --offline requires the
    selected model to be present. No language detection or translation is used.
    """

    def __init__(self, model_name=config.DEFAULT_MODEL, cpu_threads=config.CPU_THREADS,
                 model_cache=None, offline=False):
        if model_name not in config.MODEL_CHOICES:
            raise SubtitleError("invalid_model", "Escolha um modelo multilingue: base ou small.")
        if isinstance(cpu_threads, bool) or not isinstance(cpu_threads, int) or cpu_threads < 1:
            raise SubtitleError("invalid_options", "O número de threads CPU deve ser um inteiro positivo.")
        self.model_name = model_name
        self.cpu_threads = cpu_threads
        self.model_cache = Path(model_cache).expanduser().resolve() if model_cache else None
        self.offline = offline
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return self._model
        try:
            import ctranslate2
            from faster_whisper import WhisperModel
        except (ImportError, OSError) as exc:
            raise SubtitleError(
                "missing_dependency", "Não foi possível carregar Faster-Whisper/CTranslate2. "
                f"Instale requirements.txt num ambiente Python compatível. Detalhe: {exc}",
            ) from exc
        if config.COMPUTE_TYPE not in ctranslate2.get_supported_compute_types(config.DEVICE):
            raise SubtitleError("unsupported_cpu", "Esta CPU/runtime não suporta inferência INT8 com CTranslate2.")
        # Blocking construction, exactly once after successful loading.
        self._model = WhisperModel(
            self.model_name, device=config.DEVICE, compute_type=config.COMPUTE_TYPE,
            cpu_threads=self.cpu_threads, num_workers=1,
            download_root=str(self.model_cache) if self.model_cache else None,
            local_files_only=self.offline,
        )
        return self._model

    def transcribe(self, audio, language, offset=0.0):
        """Return temporized text on the source timeline, consuming lazy STT."""
        language = validate_language(language)
        if (isinstance(offset, bool) or not isinstance(offset, (int, float))
                or not math.isfinite(offset) or offset < 0):
            raise SubtitleError("invalid_timestamps", "O desfasamento do áudio deve ser finito e não negativo.")
        audio_path = Path(audio).expanduser().resolve()
        try:
            model = self._load_model()
            if language not in model.supported_languages:
                raise SubtitleError("invalid_language", f"O idioma '{language}' não é suportado pelo modelo.")
            # Both the call and subsequent generator iteration may block.
            segments, _ = model.transcribe(
                str(audio_path), language=language, task="transcribe", beam_size=config.BEAM_SIZE,
                temperature=0.0, vad_filter=True, condition_on_previous_text=False,
            )
            return [Segment(s.text, s.start + offset, s.end + offset) for s in segments]
        except SubtitleError:
            raise
        except Exception as exc:
            raise SubtitleError(
                "stt_failed",
                f"O reconhecimento de fala falhou com o modelo {self.model_name} em CPU/INT8. "
                "Verifique os pesos/cache, a ligação à rede no primeiro uso e a memória disponível. "
                f"Detalhe: {exc}",
            ) from exc
