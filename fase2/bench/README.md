# bench — measurement instruments of phase 2

Only external observation (public API, Socket.IO, RabbitMQ management API, Docker), so the
same instruments serve the baseline and the final measurement unchanged.

| Path | What it does |
|---|---|
| `env-snapshot.sh` | Commit, kernel, CPU, memory, power profile, Docker versions, containers |
| `data/generated/` | Fixed, versioned inputs (60 s speech clip, 10 s video, 10 PNGs); `data/make-data.sh` checks them against `generated.sha256` and documents how they were made |
| `sampler/sampler.py` | RabbitMQ queues (1 s) and `docker stats` (~2 s) into `queues.csv` / `docker.csv` |
| `loadgen/client.py` | Minimal client of the public API |
| `loadgen/scenarios.py` | S1–S3, F1–F6 and the solo references (REF-*) |
| `loadgen/run.py` | Runs one repetition of one scenario (load + fault injection + sampler) |
| `run-measurements.sh` | The whole campaign, N repetitions, resumable (skips finished runs) |
| `analyze/analyze.py` | E-1…E-5 and R-1…R-5 → `results/<phase>/summary.md` |

## Reproduce

```bash
cd fase2/bench
uv venv .venv && uv pip install --python .venv/bin/python requests "python-socketio[client]==5.11.4" websocket-client
./data/make-data.sh                       # checks the versioned inputs (never regenerate them)
./run-measurements.sh baseline 5          # or: ./run-measurements.sh baseline 1 S1 F5
```

Each run writes `results/<phase>/<scenario>/repN/` with `jobs.csv` (one row per job: submit,
first event, end, status), `events.jsonl`, `chaos.csv`, `queues.csv`, `docker.csv`,
`compose.log` and `meta.json`.

### Final measurement (with the autoscaler)

```bash
AUTOSCALER=scale ./run-measurements.sh final 5
```

With `AUTOSCALER=scale` the script (1) starts `fase2/autoscaler` in mode `scale` for the
whole campaign and stops it at the end, (2) saves every autoscaler decision in
`results/<phase>/autoscaler.jsonl` (errors in `autoscaler.err`) and its configuration in the
`env-*.txt` snapshot, and (3) before every run waits until the video pools are back at rest
(1 normal consumer, 0 heavy) so every repetition starts from the same state. It also does not
start again a video replica that exited cleanly, because that is a scale-in in progress.
Without `AUTOSCALER` the method is exactly the baseline one.

### Changes to the method after the baseline (all applied to the baseline data too)

- `analyze.py` computes E-3 (scale-out time) and E-4 (scale-in time, first replica removed and
  back to the starting replicas) per video queue from `queues.csv`; on the baseline they are
  n/a because the number of consumers never changes.
- `analyze.py` adds R-4 for F6 as the plan defines it: frozen image jobs reported within the
  watchdog deadline + 10 s (30 s deadline + 10 s check interval + 10 s = 50 s). The old
  "≤ 10 s" line is kept.
- `REF-f4mix`, the reference of F4, is now in the default scenario list (in the baseline it
  was run on its own).
- Re-running `analyze.py` on `results/baseline` leaves every previous value unchanged.

Job status: `done` (one result per input), `error_reported` (a `process-error` reached the
client), `hung` (neither before the timeout: 600 s for S*, 150 s for F* (over 7x the longest solo job)), `rejected` /
`submit_failed` (the submit itself failed).

Notes:
- The tool containers use `restart: on-failure`, so after `docker kill` Docker restarts them
  by itself; the explicit `start` in F1/F2/F4 is then a no-op.
- Faults target every container of a service by name (`^picturas-video`,
  `^picturas-contrast_tool-N`, ...), i.e. all replicas. In the baseline each service has one
  container, so this is the same fault as killing that container.
- `run-measurements.sh` starts every exited `picturas-*` container before each run.

## Rules for the refactoring (so the final measurement stays comparable)

- Do not change `bench/` between the `baseline` and `final` tags. If an instrument really has
  to change, the whole baseline must be measured again with it.
- Scale-in must **remove** replicas (e.g. `docker compose up --scale` or `container.remove()`),
  not leave them stopped: stopped containers are started again before each run.
- Every replica's name must start with `picturas-<service>` (the Compose default), so the
  sampler counts its memory and the faults reach it. A heavy video pool must start with
  `picturas-video`.
- Dead-letter queues must have `dlq`, `dead` or `parking` in their name: before each run the
  script waits for every other queue to be empty.
- Keep the public API and the Socket.IO events (`process-update`, `process-error`,
  `video-progress`) as they are: the load generator relies on them and on `GET .../process/url`.
- To check a change without overwriting the baseline, use another phase name:
  `./run-measurements.sh dev 1 S1 F1` → `results/dev/` (do not commit `results/dev/`).
