# UC-VID-002 — Video compression (first backend block)

Independent worker for a single existing project video. It does not import or change
`privacy_blur`, `silence_removal`, project pipelines or their limits/queues.

## REST API

All public paths start with `/api-gateway/projects/:user/:project/compression`.
Requests require `Authorization: Bearer <JWT>` for the project owner. Anonymous accounts
and share/owner overrides are rejected. No new upload endpoint is introduced.

| Method | Path | Response |
| --- | --- | --- |
| POST | base | `{ "imgId": "existing project video id", "quality": "high\|balanced\|small" }`; `202` with job |
| GET | base | Latest 100 jobs for this owner/project |
| GET | `/:jobId` | Status, progress, result metadata or error |
| GET | `/:jobId/result` | Completed MP4 download (supports Range); `409` before completion |

POST accepts a job, not a validated encode: the worker checks the actual media before
transcoding. Poll GET while `queued`/`processing` (for example every 2 seconds).
States: `queued`, `processing`, `completed`, `failed`. Download/dispatch happens after
the `202` response. This block does not claim the full UC's initial validation SLA.

## Processing and storage

The projects service downloads the existing S3 original into a separate job directory:
`image_data:/app/images/video_compression/<jobId>/source.mp4`. FFmpeg writes a temporary
output, validates it and renames it to `result.mp4`. The S3 original, project `imgs`,
pipeline and existing results remain unchanged. Only a completed job exposes a download.
The working copy is removed after completion/failure; results stay on the named volume.

| Quality | CRF | Preset | Audio |
| --- | --- | --- | --- |
| high | 20 | veryfast | AAC 160k |
| balanced | 25 | veryfast | AAC 128k |
| small | 30 | veryfast | AAC 96k |

MP4/H.264 input only; audio is optional. Video is encoded with libx264/yuv420p;
dimensions are preserved except for minimum even-dimension padding if necessary.
CRF does not guarantee a smaller file for an already compressed source. The real
`reductionPercent` can be negative; metadata reports the actual output size.

Worker limits (decimal units): free 500,000,000 bytes/600 seconds; premium
2,000,000,000 bytes/3600 seconds. The existing global 100 MB upload limit remains.
No resolution restriction is added. Profiles are version 1 in `config.py`.

The new durable queues/routing keys, on the existing direct exchange `picturas`, are:
`video_compression_queue` and `video_compression_results_queue`. Progress is persisted
by projects and available through REST. No WebSocket integration is added in this block.
One job is consumed at a time. Worker results use publisher confirms and manual request
acks. Redelivered requests report interruption instead of repeating an encode.

## Deliberately excluded

Frontend, quota, uploads above 100 MB, 24-hour retention policy, cancellation,
batch/pipeline processing, advanced storage/security changes and automatic retries.
Existing infrastructure security limitations remain. A projects-service crash during
source preparation can leave a queued job; reconciliation/watchdog is a later block.
Deleting a project does not yet clean up compression jobs/results. Do not interpret
this backend increment as the complete UC-VID-002 MVP.

## Verification (commands to run explicitly)

From `projeto/`, with the required runtimes available:

```text
node --test Tools/video_compression/tests/test_api.cjs
python -m unittest discover -s Tools/video_compression/tests -v
```

Python contract tests need only the standard library. Real encode tests run when
FFmpeg/ffprobe are available, otherwise they are skipped.

After authorization to build/run Docker (not required for the static/API unit checks):

```text
docker compose up -d --build projects api_gateway video_compression_tool
docker compose run --rm --no-deps video_compression_tool python -m unittest discover -s tests -v
```

The worker and projects declare only the two compression queues and bindings at runtime,
so a pre-existing RabbitMQ volume does not need to be deleted or reset.
