# Video autoscaler — observation mode

This block reads RabbitMQ and Docker, evaluates a policy and prints one JSON object per
observation. It implements no container creation, start, stop, removal or scaling action.
Only `observe` mode is accepted. The runtime's Docker commands are `ps` and `inspect`;
RabbitMQ access uses HTTP GET.

Run from the repository root with Python 3.11+ and Docker CLI access. No Python packages
need to be installed. Use the credentials of the existing broker through environment
variables; credentials are not stored in `config.json` or printed in reports.

```powershell
$env:RABBIT_USER = 'user'
$env:RABBIT_PASS = '<password from the local Compose configuration>'
python -B -m fase2.autoscaler.autoscaler --once
python -B -m fase2.autoscaler.autoscaler
```

On a POSIX shell, export `RABBIT_USER` and `RABBIT_PASS` before the same commands.
Alternatively, run `python -B fase2/autoscaler/autoscaler.py --once`.
Stop the observation loop with Ctrl+C. `--once` returns 0 for a valid observation and 1
for a degraded one; invalid configuration/arguments return 2. `--config PATH` selects
another configuration file, without modifying Compose or the application.

## Initial policy

| Setting | Value |
|---|---|
| Normal service / queue | `video_tool` / `video_queue`, min 1, max 2 |
| Heavy service / queue | `video_heavy_tool` / `video_heavy_queue`, min 0, max 2 |
| Global occupied replica budget | 3 |
| Observation interval | 1 s, including collection time when reads complete in time |
| Scale-out intention | +1 per pool/decision; cooldown 5 s |
| Scale-in intention | -1 after 60 s of observed empty ready **and** unacked counts |
| Scale-in cooldown | 30 s per pool; at most one reduction per observation |

Backlog requires more capacity when `ready > 0` and `ready + unacked > running replicas`.
Missing normal capacity takes priority over optional heavy capacity. All proposals respect
the pool maxima, the global budget and unfilled pool minima. A starting, stopping or
paused replica still occupies budget. A scale-in proposal does not free real budget.

The policy waits while a pool is transitioning or consumers do not match its running
replicas. Capacity changes, work and degraded observations restart the idle window.
There is no per-container idle selection in this block.

Cooldowns are tracked for **intentions** in memory. Each new observation reconciles against
real containers; unexecuted proposals never become virtual replicas. Restarting the observer
resets cooldowns and the idle window. Actual actuation and its acknowledgements belong to
later blocks.

## Observation and failures

`config.json` selects the Compose project, RabbitMQ API/vhost, timeouts and policy.
Containers are selected by exact Compose project/service labels; Compose one-off test
containers are excluded. Created/restarting containers and running containers with a starting
health check count as `starting`. Exited/dead containers are reported as `stopped` and do
not occupy replica budget.

Docker does not always expose SIGTERM shutdown as a distinct `stopping` state. A container
still reported as running remains counted until Docker reports it stopped. Reported
`stopping`/`removing` states are counted too; no predicted removal releases budget.

Missing queues, missing/invalid metrics, failed reads and incomplete Docker snapshots make
the whole observation degraded. Capacity is held and the idle window is cleared. Last known
Docker counts may be reported with errors, but cannot authorize decisions. Without a prior
valid Docker observation, capacity is `null`, never a fabricated zero. Preexisting capacity
above a limit is reported as degraded and held; it is not silently clamped in the report.

Reports include real counts, metrics, proposed desired counts, reasons, budget, errors and
`actions_executed: 0`. State and logs stay in memory/stdout; benchmark instruments, inputs
and golden outputs are unchanged.

## Unit tests

```console
python -B -m unittest discover -s fase2/autoscaler/tests -v
```

The tests use injected readers and a deterministic clock. They do not contact the stack
or create containers.
