"""UC-VID-004, stage 1: local MP4 -> explicit-language STT -> UTF-8 SRT.

Requires Python 3.11+, requirements.txt and FFmpeg/ffprobe on PATH.
Install in a virtual environment: python -m pip install -r requirements.txt
Usage: python cli.py --input "video com fala.mp4" --language pt --output "legendas.srt"
Compare: add --model small (default: multilingual base). No GPU is used.
Run --help for executable paths, CPU threads and model cache/offline options.
Existing output files are refused; CLI publishers coordinate through a sidecar
lock. Other applications must not concurrently write the same destination.
The output directory must exist.
Run this CLI as a child process for a future external supervisor. Model loading,
VAD/decoding and native CTranslate2 inference are blocking; Ctrl+C can be delayed
until native code returns. Forced termination cannot guarantee temporary cleanup.
Exit codes: 0 success; 1 processing/validation error; 2 CLI syntax; 130 Ctrl+C.
"""

import argparse
import math
import sys
import time

import config
import media
import srt
import stt
from errors import SubtitleError


def _positive_int(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("deve ser um inteiro positivo")
    return number


def _positive_seconds(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("deve ser um número finito positivo")
    return number


def parser():
    result = argparse.ArgumentParser(
        description="Gera legendas SRT a partir de um MP4 local, em CPU/INT8, sem alterar o vídeo.",
        epilog="Exemplo: python cli.py --input \"video com fala.mp4\" --language pt --output legendas.srt\n"
               "O modelo é descarregado no primeiro uso. Silêncio sem fala não produz SRT.\n"
               "A saída deve ser nova e a pasta deve existir. Ctrl+C solicita interrupção; código nativo pode demorar a devolver controlo.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    result.add_argument("--input", required=True, help="Caminho do vídeo MP4 local.")
    result.add_argument("--language", required=True, help="Código explícito do idioma falado (pt, en, es, ...); sem deteção automática.")
    result.add_argument("--output", required=True, help="Novo ficheiro .srt UTF-8; não sobrescreve ficheiros existentes.")
    result.add_argument("--model", choices=config.MODEL_CHOICES, default=config.DEFAULT_MODEL,
                        help="Modelo multilingue (predefinido: base).")
    result.add_argument("--cpu-threads", type=_positive_int, default=config.CPU_THREADS,
                        help=f"Threads de inferência CPU (predefinido: {config.CPU_THREADS}).")
    result.add_argument("--model-cache", help="Pasta persistente dos pesos do modelo; por omissão usa a cache da biblioteca.")
    result.add_argument("--offline", action="store_true", help="Usa apenas pesos já existentes na cache.")
    result.add_argument("--temp-dir", help="Pasta existente para os temporários desta execução; nunca é apagada pela CLI.")
    result.add_argument("--ffmpeg", default="ffmpeg", help="Executável FFmpeg (nome no PATH ou caminho completo).")
    result.add_argument("--ffprobe", default="ffprobe", help="Executável ffprobe (nome no PATH ou caminho completo).")
    result.add_argument("--media-timeout", type=_positive_seconds, default=config.EXTRACTION_TIMEOUT_SEC,
                        help="Tempo máximo da extração de áudio, em segundos (predefinido: 300); não limita STT.")
    return result


def main(argv=None):
    args = parser().parse_args(argv)
    started = time.monotonic()
    try:
        stt.validate_language(args.language)
        output = srt.validate_output(args.output, args.input)
        info = media.probe(args.input, args.ffprobe)
        print(f"Vídeo validado: {info.duration:.3f} s; faixa de áudio {info.audio_index}.", file=sys.stderr)
        recognizer = stt.SpeechRecognizer(
            model_name=args.model, cpu_threads=args.cpu_threads,
            model_cache=args.model_cache, offline=args.offline,
        )
        with media.extracted_audio(info, args.ffmpeg, args.media_timeout, args.temp_dir) as audio:
            print(f"Reconhecimento: modelo {args.model}, idioma {args.language}, CPU/INT8.", file=sys.stderr)
            segments = recognizer.transcribe(audio, args.language, offset=info.audio_offset)
            cues = srt.validate_segments(srt.fit_to_duration(segments, info.duration), info.duration)
        # WAV has been removed before publishing a final output.
        destination = srt.write_srt(output, cues, info.duration, source=info.path)
        print(f"SRT criado: {destination}\nSegmentos: {len(cues)}; tempo total: {time.monotonic() - started:.2f} s.")
        return 0
    except SubtitleError as exc:
        print(f"Erro [{exc.kind}]: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"Erro de acesso a ficheiros: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Operação interrompida; temporários desta execução limpos.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
