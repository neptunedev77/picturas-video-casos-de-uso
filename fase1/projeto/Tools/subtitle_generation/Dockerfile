FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
ENV SUBTITLE_MEDIA_ROOT=/app/images \
    SUBTITLE_TEMP_ROOT=/app/images/.subtitle_tmp \
    SUBTITLE_MODEL_CACHE=/var/cache/subtitle-models \
    SUBTITLE_WORK_ROOT=/var/lib/subtitle-worker

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY subtitle_generation/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY subtitle_generation/config.py subtitle_generation/errors.py \
     subtitle_generation/media.py subtitle_generation/stt.py \
     subtitle_generation/srt.py subtitle_generation/worker.py ./

# Weights are downloaded on first use into the dedicated model-cache volume.
# Rebuilds do not download a model; SUBTITLE_MODEL_OFFLINE=1 requires a warm cache.
CMD ["python", "-u", "worker.py"]
