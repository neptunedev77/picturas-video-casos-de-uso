# AGENTS.md

Guidance for AI coding agents (and humans) working on this repository. `README.md` is the
user-facing documentation; this file is the short version an agent needs before changing code.

## What the app is

PictuRAS is a web editor for images and videos, built as Docker Compose microservices. Users
create **projects**, add media (images and videos), build an ordered **pipeline** of effects,
and apply it to every media item of the project in one batch. The pipeline belongs to the project, not to each item.

Profiles: **anonymous** (images only, limited), **free** (`FREE_DAILY_OP` = 5 operations per day)
and **premium** (unlimited). `subscriptions` means paid plans/billing, not event subscriptions.

## Architecture

All traffic enters through nginx at `https://localhost:8080`:

| Path            | Target                                                       |
| --------------- | ------------------------------------------------------------ |
| `/`             | `frontend/`: Next.js 15 + React 19 + TypeScript (bun)        |
| `/api-gateway/` | `apiGateway/`: Express; checks the JWT and forwards requests |
| `/socket.io`    | `wsGateway/`: Socket.IO; pushes `ws_queue` events to the UI  |
| `/s3/`          | SeaweedFS (S3-compatible object storage)                     |

Behind the gateway:

- `users/`: accounts, login (JWT), profiles and the daily operations quota (MongoDB).
- `projects/`: orchestrator. Owns projects, media, pipelines and processing (MongoDB).
- `subscriptions/`: plans and mock payments (MongoDB).
- `imageStorageService/`: S3 façade with the stages `src`, `out`, `preview`, `preview_cache`.
- `Tools/<tool>/`: one Python microservice per effect, consuming `<tool>_queue` on the
  `picturas` direct exchange (RabbitMQ) and reading/writing the shared `image_data` volume.
  - Image tools (PIL): `binarization`, `border`, `brightness`, `contrast`, `cut`, `resize`,
    `rotate`, `saturation`; `watermark` runs from a pre-built public image.
  - AI tools: `bg_remove_ai`, `cut_ai`, `expand_ai` (uses `generative-mock/`), `obj_ai`,
    `people_ai`, `text_ai`, `upgrade_ai`.
  - `Tools/utils/`: shared RabbitMQ, image I/O and message helpers.
  - `Tools/video/` (`video_tool`): the single video worker, see below.
- `rabbitMQ/definitions.json`: queues, exchange and bindings.
- `docker-compose.yaml`: the single source of truth for services and configuration.

### Processing flow

- **Images**: `projects` sends one message per (image, tool) step and advances the chain when
  the tool replies on `project_queue`. Progress goes to the browser through `ws_queue`.
- **Videos**: `projects` sends **one** message per video carrying the whole pipeline to
  `video_queue`. The worker probes with ffprobe, decodes once, applies the frame effects
  (`Tools/video/effects.py`, same PIL operations as the image tools), and encodes once to
  MP4/H.264 + AAC, keeping the audio. It reports progress as `video-progress` events on
  `ws_queue`, acks only at the end and leaves no partial output on failure. Preview mode
  renders only the first `VIDEO_PREVIEW_SECONDS` (3 s).
- **Message reliability** (phase 2): every worker, image tools and video, consumes through
  `Tools/utils/reliable_consumer.py` (manual ack after the reply is confirmed by the broker,
  heartbeats while a job runs, reconnection, SIGTERM: stop taking jobs, wait up to
  `WORKER_SHUTDOWN_GRACE_S` (8 s) for the current one, otherwise requeue it). `projects` keeps
  one connection, publishes persistent confirmed messages and acks only after its handler
  (`projects/utils/rabbit_mq.js`). Work queues are quorum queues limited to 5 deliveries by the
  `work-queues-dead-letter` policy, then dead-lettered to `picturas.dlq`, which `projects`
  reports to the user (`utils/dead_letter.js`). A watchdog (`utils/watchdog.js`) fails a step
  with no answer in time (image 30 s, video max(120 s, duration), `WATCHDOG_*` env vars). Both
  refund the reserved operations once (`utils/refund.js`). Replies are handled idempotently
  (`utils/idempotency.js`), because redeliveries happen.

### Media types

- Images are uploaded to `POST /:user/:project/img`, videos to `POST /:user/:project/video`;
  each endpoint rejects the other kind. Videos are stored with `media_type: "video"`.
- Video validation (container, codec, duration, size, resolution) and the orchestrator's video
  logic live in `projects/utils/video.js`. Limits are env vars of `projects`
  (`VIDEO_FREE_*`, `VIDEO_PREMIUM_*`): free 60 s / 100 MB, premium 600 s / 1 GB.
- `trim` (`start`/`end` in seconds) and `speed` (`factor` 0.25–5) are video-only and apply to
  one video (`params.imgId`); every other effect applies to all media. Images skip video-only
  tools. Each effect on a video counts as one operation.
- `subtitles` is video-only and project-wide (no `imgId`): Faster-Whisper CPU/int8
  detects the spoken language and burns captions into the MP4. No audio/speech is a no-op.
  It runs as an ordered stage inside the existing video worker; contiguous ordinary
  effects still share one decode/encode pass. Models persist in `whisper_models`.
- `extract_frames` is video-only and project-wide, terminal and unique. It reuses the
  video worker: count (1–100) or interval, PNG/JPEG, max100 images per video. Full output
  is a frame manifest; preview is a contact sheet across the edited timeline. The
  orchestrator saves each frame as a separate image Result with the source `img_id`
  and unique result ID/name. Register all batch Process records before dispatch.
- In projects with videos the frontend hides image-only tools (AI, watermark) and PDF export.

## Running and testing

```bash
docker compose up -d --build                 # first build: 15-30 min, ~15 GB disk, 8+ GB RAM
docker compose up -d --build <service>       # rebuild one service after a change
docker compose restart nginx                 # after rebuilding the frontend (avoids 502)
docker compose logs -f <service>
docker compose down [-v]                     # stop (-v also wipes all data)
```

Replacing an older (e.g. Phase 1) checkout: it shares the Compose project name `picturas` and
its volumes, whose S3 layout (one bucket per user) is incompatible. Run
`docker compose down -v --remove-orphans` once before the first `up`.

A stack created before the quorum queues keeps classic queues in the `rabbitmq_data` volume and
RabbitMQ refuses them (`PRECONDITION_FAILED`). Recreate only that volume, once, as the README
explains ("One-time migration of existing RabbitMQ data"); never `down -v` for this.

Video worker tests run on the host (needs ffmpeg/ffprobe on the PATH, no Docker):

```bash
cd Tools/video && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q tests
```

- Open `https://localhost:8080` (https, port 8080) and accept the self-signed certificate.
- `users`, `subscriptions` and `apiGateway` bind-mount their source and reload with nodemon.
  The frontend is a production build and Python tools have no bind mount: rebuild them.
- RabbitMQ management: `http://localhost:15672` (`user` / `password`).
- Sample videos for manual tests: `samples/video/` (see its README).

## Conventions

- Code, comments, identifiers and user-facing messages in English.
- Extend the existing design instead of rewriting it; change base behaviour only when needed.
- Small commits with descriptive subjects (under 72 characters).
- Keep each file's existing line endings: some files are stored with CRLF. Do not reformat
  unrelated code.
- Never commit secrets, `.env`, `node_modules/`, generated media or `backups/`.
- To add a tool: create `Tools/<tool>/` from a simple tool (e.g. `border`), register its queue in
  `rabbitMQ/definitions.json` as a **quorum** queue and add it to the regex of the
  `work-queues-dead-letter` policy (otherwise it has no delivery limit and no DLQ), consume it
  with `ReliableConsumer`, add the service to `docker-compose.yaml`
  (`depends_on: rabbitmq: service_healthy`, `image_data` volume), then expose it in `projects`
  and in the frontend toolbar.

## Known pitfalls

- `JWT_SECRET_KEY` must be the same in `users`, `api_gateway` and `ws_gateway`.
- Keep `NEXT_PUBLIC_API_BASE_URL` relative (`/api-gateway/`) and do not remap port 8080.
- Internal service-to-service TLS certificates are expired and not validated
  (`rejectUnauthorized: false`); several secrets are committed. Known issues, not patterns.
- RabbitMQ consumers must survive broker restarts.
- `watermark_tool_ms` is a prebuilt external image: it still uses the old auto-ack consumer and
  its `watermark_queue` (like `ws_queue`) stays classic, outside the dead-letter policy. A lost
  watermark job is only caught by the watchdog.
- The watchdog measures time since dispatch, so time waiting in a long `video_queue` counts
  towards the deadline. Stopping a worker gives its current job only 8 s before it is requeued
  and redone from the start: remove idle video replicas when scaling in.
- The users service answers errors with a non-standard 701 status (including "daily limit
  reached"); `projects` maps that case to 403 before replying.
- Image/video handling is branched in the orchestrator, PIL effects are duplicated in
  `Tools/video/effects.py`, and there is a single `video_tool` with no replicas.
