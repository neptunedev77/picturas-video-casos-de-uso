FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY video_bg_remove/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY ./utils/requirements.txt utils/requirements.txt
RUN pip install --no-cache-dir -r utils/requirements.txt

# REQ-VID-BG-026: the segmentation model ships in the image (no download when the service starts).
RUN python -c "from rembg import new_session; new_session('u2netp')"

COPY ./video_bg_remove .
COPY ./utils utils

CMD ["python", "-u", "video_bg_remove.py"]
