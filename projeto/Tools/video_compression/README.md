# UC-VID-002 — Video compression

Independent worker for a single existing project video. It does not import or change
`privacy_blur`, `silence_removal`, project pipelines or their limits/queues.

## REST API

All public paths start with `/api-gateway/projects/:user/:project/compression`.
Requests require `Authorization: Bearer <JWT>`. Access follows the other video tools
(REQ-VID-SEC-001): the project owner, or an authenticated user with a valid share link
(`?share=<id>`; the gateway also accepts `?owner=<id>` and calls the owner's project). Creating
and cancelling need the link's `edit` permission; a `read` link can only list, view and download.
Revoked or unknown links get `410`. Job lookups filter by project. No new upload endpoint is introduced.

| Method | Path | Response |
| --- | --- | --- |
| POST | base | `{ "imgId": "existing project video id", "quality": "high\|balanced\|small" }`; `202` with job, `429 NO_QUOTA` for a free account without operations |
| GET | base | Latest 100 jobs for this project |
| GET | `/:jobId` | Status, progress, result metadata or error |
| GET | `/:jobId/result` | Completed MP4 download, streamed from the project storage; `409` before completion |
| POST | `/:jobId/cancel` | `200` cancels queued job; `202` requests processing cancellation; `409` if terminal or already being added to the project, `404` if not found |

POST accepts a job, not a validated encode: the worker checks the actual media before
transcoding. States: `queued`, `processing`, `completed`, `failed`, `cancelled` (shown as
"Em fila", "A processar", "Concluída", "Falhada", "Cancelada"). Every state change and progress
update is sent to whoever ran the job through `ws_queue` as a `compression-update` event, forwarded
by wsGateway; the browser polls every 5 seconds only as a fallback while a job is active.

## Processing and storage

The projects service downloads the existing S3 original into a separate job directory:
`image_data:/app/images/video_compression/<jobId>/source.mp4`. FFmpeg writes a temporary
output, validates it and renames it to `result.mp4`. On completion, projects uploads the result
to the project's storage as `<name>-comprimido.mp4`, adds it to the project's files (event
`IMAGE_ADDED`) and removes both private copies (REQ-VID-STORE-001): the result is deleted with the
project like any other file. While the result is being added (`finalizing`), cancellation is
refused; if it cannot be stored, the job fails with `STORE_FAILED`. The S3 original is never changed.

| Quality | CRF | Preset | Audio | Resolution |
| --- | --- | --- | --- | --- |
| high | 23 | veryfast | AAC 160k | Original |
| balanced | 28 | veryfast | AAC 128k | Original |
| small | 32 | veryfast | AAC 96k | Maximum 1280x720 landscape / 720x1280 portrait |

MP4/H.264 input only; audio is optional. Video is encoded with libx264/yuv420p.
For high/balanced, dimensions are preserved except for minimum even-dimension
padding if necessary. Small preserves orientation and aspect ratio without upscaling;
dimensions are rounded down to even values for yuv420p compatibility.
CRF does not guarantee a smaller file for an already compressed source. The real
`reductionPercent` can be negative; metadata reports the actual output size.

Worker limits (decimal units): free 500,000,000 bytes/600 seconds; premium
2,000,000,000 bytes/3600 seconds. The existing global 100 MB upload limit remains.
No input resolution restriction is added; only small limits output resolution.
Profiles are version 1 in `config.py`.

The durable queues/routing keys, on the existing direct exchange `picturas`, are
`video_compression_requests_queue` (with `x-max-priority`; premium requests are published with
priority 5, REQ-VID-QUOTA-003) and `video_compression_results_queue`. The request queue has a new
name because a durable queue's arguments cannot change in place; the old `video_compression_queue`
is no longer used. One job is consumed at a time. Worker results use publisher confirms and manual
request acks. Redelivered requests report interruption instead of repeating an encode.

## Profile limits and daily quota

A free account without operations is refused when the job is created, before anything is queued
(REQ-VID-QUOTA-001). After ffprobe and disk-capacity checks, immediately before launching FFmpeg,
the worker requests `POST /internal/video-compression/:jobId/start` from projects, authenticated by
a random per-job token supplied only over the compression queue (MongoDB stores its SHA-256 hash
with `select: false`). The internal route is not registered in the API gateway.

Projects rechecks the source and the project, loads the CURRENT profile of whoever ran the job
(the owner or a shared-link editor, RNG-05), and validates real size/duration and MP4/H.264
metadata supplied by the trusted worker. For free accounts it reserves one operation with the
existing users `GET /:user/process/1`; premium is unlimited. An atomic job claim prevents a
duplicate start from reserving twice.

The operation stays debited only if the job completes (REQ-VID-QUOTA-002, RNG-04): whenever a
job ends failed or cancelled (FFmpeg failure, invalid result, timeout, confirmed cancellation,
no capacity, storage failure), projects returns it once with `POST /:user/process/refund/1`,
guarded by an atomic `quota_refund_claimed` claim. The worker's own `launch-failed` action only
releases the reservation when FFmpeg never started; while FFmpeg runs, the recorded outcome decides.
There is no distributed transaction across users/projects; a failed refund call is logged and can
require reconciliation.

## Performance target and technical timeout (REQ-VID-COMP-035, REQ-VID-TIMEOUT-001)

The MVP performance target is total processing time <= 1.5 times the video's duration under the
reference conditions. This is a target for real measurements, not an interruption threshold.

The technical FFmpeg timeout is 3 times the probed duration + 60 seconds, the same limit as the
other video tools. It starts at FFmpeg launch, excluding queueing, download, initial probing and
quota authorization. Exceeding it raises PROCESSING_TIMEOUT, kills and waits for FFmpeg and
removes temporary output. No result is published, the original remains unchanged and the
reserved operation is returned. An accepted cancellation that wins the atomic transition makes
the job cancelled instead.

## Queued and processing cancellation (REQ-VID-CANCEL-001)

Queued cancellation is the atomic queued/unclaimed -> cancelled transition: no reservation and no
FFmpeg launch. For processing jobs, cancellation atomically sets `cancel_requested_at` and returns
202. The worker polls the authenticated internal control action approximately every second, kills
FFmpeg, removes its temporary directory and reports `cancelled`; projects then commits `cancelled`,
removes the private copies and returns the operation. Completion requires an atomic processing
update with no cancellation request; late messages never overwrite terminal jobs.

## Deliberately excluded

Uploads above 100 MB (the existing Nginx limit, below the 500 MB / 2 GB plan limits),
batch/pipeline processing and automatic retries. A projects-service crash during source
preparation can leave a queued job; reconciliation/watchdog is a later block.

## Verification (commands to run explicitly)

From `projeto/`, with the required runtimes available:

```text
node --test Tools/video_compression/tests/test_api.cjs Tools/video_compression/tests/test_quota.cjs
python -m unittest discover -s Tools/video_compression/tests -v
```

Compressor/authorization contract tests need only the standard library; worker tests
also use the image's Pika dependency. Real encode tests run when FFmpeg/ffprobe are
available, otherwise they are skipped.

After authorization to build/run Docker (not required for the static/API unit checks):

```text
docker compose up -d --build projects api_gateway video_compression_tool
docker compose run --rm --no-deps video_compression_tool python -m unittest discover -s tests -v
```

The worker and projects declare only the two compression queues and bindings at runtime
(the request queue with `x-max-priority`), so a pre-existing RabbitMQ volume does not need to be reset.
