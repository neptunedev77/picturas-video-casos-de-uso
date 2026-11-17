#!/usr/bin/env bash
# Generates the fixed benchmark inputs from versioned samples and fixed ffmpeg parameters.
# Output: bench/data/generated/ (deterministic; regenerate instead of committing).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SAMPLES="$HERE/../../picturas-27/samples/video"
OUT="$HERE/generated"
mkdir -p "$OUT"
FF="ffmpeg -hide_banner -loglevel error -y"

# 60 s clip with real speech (from 0:30 of the Mandela sample), H.264 720p
$FF -ss 30 -t 60 -i "$SAMPLES/speech_mandela_177s_1080p.webm" \
    -vf scale=1280:720 -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k \
    "$OUT/speech_60s_720p.mp4"

# 10 s video for short edits (copy of the versioned sample)
cp "$SAMPLES/sample_10s_720p.mp4" "$OUT/short_10s_720p.mp4"

# 1280x720 synthetic images, fixed sources
for i in $(seq 1 10); do
  $FF -f lavfi -i "testsrc2=size=1280x720:rate=1" -vf "hue=h=$((i*36))" -frames:v 1 "$OUT/img_$(printf %02d "$i").png"
done
sha256sum "$OUT"/* > "$HERE/generated.sha256"
ls -la "$OUT"
