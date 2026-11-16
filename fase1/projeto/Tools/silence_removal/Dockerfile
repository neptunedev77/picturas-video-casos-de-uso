FROM python:3.11-slim

WORKDIR /app

# FFmpeg fica isolado dentro do contentor (REQ-VID-SIL-039)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY silence_removal/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY ./silence_removal .

CMD ["python", "-u", "worker.py"]
