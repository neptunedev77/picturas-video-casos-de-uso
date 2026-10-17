# UC-VID-002 — Video compression

Independent worker for a single existing project video. It does not import or change
`privacy_blur`, `silence_removal`, project pipelines or their limits/queues.

## REST API

All public paths start with `/api-gateway/projects/:user/:project/compression`.
Requests require `Authorization: Bearer <JWT>` for the project owner. The service checks
that the project actually belongs to the authenticated URL user on all five public routes.
Anonymous creation and share/owner overrides are rejected. Job lookups additionally
filter by project and owner. No new upload endpoint is introduced.

| Method | Path | Response |
| --- | --- | --- |
| POST | base | `{ "imgId": "existing project video id", "quality": "high\|balanced\|small" }`; `202` with job |
| GET | base | Latest 100 jobs for this owner/project |
| GET | `/:jobId` | Status, progress, result metadata or error |
| GET | `/:jobId/result` | Completed MP4 download (supports Range); `409` before completion |
| POST | `/:jobId/cancel` | Cancel queued job; `409` if already started/terminal, `404` if not found |

POST accepts a job, not a validated encode: the worker checks the actual media before
transcoding. Poll GET while `queued`/`processing` (for example every 2 seconds).
States: `queued`, `processing`, `completed`, `failed`, `cancelled`. Download/dispatch happens after
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

## Profile limits and daily quota (block 3)

After ffprobe and disk-capacity checks, immediately before launching FFmpeg, the worker
requests `POST /internal/video-compression/:jobId/start` from projects. It authenticates
using a random per-job token supplied only over the compression queue; MongoDB stores
its SHA-256 hash with `select: false`. Public REST responses never contain this token.
The internal route is not registered in the API gateway.

Projects rechecks the source/project owner, loads the account's CURRENT profile, and
validates real size/duration and MP4/H.264 metadata supplied by the trusted worker.
Thus a profile change while queued is respected. Creating a queued job does not debit
an operation. Invalid media, exceeded limits and insufficient disk capacity never debit.

For free accounts, projects calls the existing users `GET /:user/process/1` exactly once
per claimed job; that existing endpoint checks and debits the shared daily operation
counter. No new quota counter or changes to users/blur/silence quota code are introduced.
No remaining operations means `failed` with `NO_QUOTA`; FFmpeg is not launched. Premium
is unlimited and bypasses the debit. An atomic job claim prevents duplicate start
requests from charging the same compression again. A failed job requires a new job to retry.

If Popen itself fails, the worker uses the internal `launch-failed` action to request the
existing users `POST /:user/process/refund/1`; a separate atomic claim prevents duplicate
refunds. A lost start response also attempts this release without retrying the debit.
Failures AFTER FFmpeg has started remain charged, matching REQ-VID-COMP-025 (an initiated
operation), rather than importing the silences-specific refund policy.

This intentionally retains the existing quota service's read/update and current-day
refund semantics. It does not provide a distributed transaction across users/projects;
service failures during debit/refund can require reconciliation. Duplicate compression
starts are guarded, but the general quota service is not refactored for cross-tool races.

## Queued cancellation (REQ-VID-COMP-014)

The owner can cancel only a queued job. Cancellation and start both use an atomic
findOneAndUpdate on the same job, requiring status queued and start_claimed not true.
The start claim now sets processing in that same update, before attempting the quota
debit. If cancellation wins, start authorization fails and FFmpeg cannot be launched
or quota debited. If start wins, cancellation returns 409 without deleting active files.

Private source/output copies are removed on a best-effort basis. If preparation is
still downloading, its post-download check removes the copy and skips publication.
A request already in RabbitMQ may still be delivered; it cannot authorize a cancelled
job. Late worker messages never replace cancelled status. The frontend shows Cancelar
only while queued, then Cancelado; it resyncs via REST if start won the race.
There is no cancellation during FFmpeg and no changes to other tools or shared storage.

## Deliberately excluded

Uploads above 100 MB, 24-hour retention policy, cancellation during FFmpeg,
batch/pipeline processing, advanced storage/security changes and automatic retries.
Existing infrastructure security limitations remain. A projects-service crash during
source preparation can leave a queued job; reconciliation/watchdog is a later block.
Deleting a project does not yet clean up compression jobs/results. Do not interpret
this backend increment as the complete UC-VID-002 MVP.

## Verification (commands to run explicitly)

From `projeto/`, with the required runtimes available:

```text
node --test Tools/video_compression/tests/test_api.cjs Tools/video_compression/tests/test_quota.cjs
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
