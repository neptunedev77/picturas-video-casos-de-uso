# Video autoscaler — observation and guarded scaling

This block reads RabbitMQ and Docker, evaluates a policy and prints one JSON object per
observation. `observe` is still the default and performs no mutations. Explicit
`--mode scale-out` enables additions only. Explicit `--mode scale` enables additions and
safe removal of idle replicas. `actuator.py` shares locking/journaling between the modes;
`scale_in.py` implements the ID-specific stop/confirm/remove state machine.
The observation runtime still allows only Docker `ps` and `inspect`; RabbitMQ access
uses HTTP GET. The actuator additionally reads the Docker context/daemon identity and
resolved Compose configuration. It may issue a guarded Compose scale-out request, or,
only in `scale` mode, SIGTERM and non-forced removal of one identified idle replica.

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
Scale-in selects one real container ID only after the entire pool is observed idle.

In observation mode, cooldowns are tracked for **intentions** in memory. Each new observation reconciles against
real containers; unexecuted proposals never become virtual replicas. Restarting the observer
resets those intention cooldowns and the idle window. Active mode also persists actual
attempt cooldowns, so restarting an actuator does not bypass them.

## Observation and failures

`config.json` selects the Compose project, RabbitMQ API/vhost, timeouts and policy.
Containers are selected by exact Compose project/service labels; Compose one-off test
containers are excluded. Created/restarting containers and running containers with a starting
health check count as `starting`. Exited/dead containers are reported as `stopped` and do
not occupy observed replica budget. During a pending scale-in, their slot is
retained separately until the selected container's removal is confirmed.

Docker does not always expose SIGTERM shutdown as a distinct `stopping` state. A container
still reported as running remains counted until Docker reports it stopped. Reported
`stopping`/`removing` states are counted too; no predicted removal releases budget.

Missing queues, missing/invalid metrics, failed reads and incomplete Docker snapshots make
the whole observation degraded. Capacity is held and the idle window is cleared. Last known
Docker counts may be reported with errors, but cannot authorize decisions. Without a prior
valid Docker observation, capacity is `null`, never a fabricated zero. Preexisting capacity
above a limit is reported as degraded and held; it is not silently clamped in the report.

Observation reports include real counts, metrics, proposed desired counts, reasons, budget,
errors and `actions_executed: 0`. Observation state/logs stay in memory/stdout;
benchmark instruments, inputs and golden outputs are unchanged in all modes.

## Enable scale-out explicitly

From the repository root, with the existing stack running and credentials set:

```console
python -B -m fase2.autoscaler.autoscaler --mode observe --once
python -B -m fase2.autoscaler.autoscaler --mode scale-out --once
python -B -m fase2.autoscaler.autoscaler --mode scale-out
```

Stop the active process with Ctrl+C, then run without `--mode`, or with `--mode observe`,
to return to read-only observation. This does not stop/remove existing workers. The JSON
configuration must keep `"mode": "observe"`: a config file alone cannot enable mutations.
`apply` remains invalid. `--mode scale-out` never executes scale-in, including the
reconciliation of a removal initiated earlier in `scale` mode.

`compose_file` is resolved relative to the selected configuration file, not the current
working directory. The supplied file selects `../picturas-27/docker-compose.yaml`.
`actuation_timeout_s` (30 s) bounds each Compose call; `readiness_timeout_s` (60 s) marks
overdue startup as uncertain. Neither timeout frees a pending reservation.

### Safety boundary and startup confirmation

- Approved services and safety ceilings are enforced again by the actuator: normal minimum
  >=1, pool maxima <=2, global maximum <=3. The unchanged defaults are normal 1–2 and heavy
  0–2. Stricter limits and policy periods remain configurable in `config.json`.
- A lock covers observation, reobservation, reservation, Compose and reconciliation. At most
  one pool gains one replica per step. Only a fresh `scale_out` decision can invoke Compose.
- The Docker context is pinned and the daemon ID is checked. The Compose project, file and
  directory are explicit; only `video_tool` or `video_heavy_tool` can be targeted.
- Resolved Compose must preserve image, queue, CPU/RAM limits, network, volumes and broker
  dependency. Existing containers must have matching Compose file/directory labels.
- All existing video containers must be running and stable before an addition. Stopped
  containers block actuation too: otherwise Compose could restart/remove an unexpected
  container while reconciling its absolute target. Fix such deployment state separately.
- Scale-out uses only `compose up -d --no-deps --no-recreate --no-build --pull never
  --scale SERVICE=N SERVICE`. Dependencies, other services, builds, pulls, removals and
  explicit scale-in are outside the scale-out path. Existing IDs must remain present.
  The subprocess environment explicitly disables `COMPOSE_REMOVE_ORPHANS`, including
  when the parent shell or an environment file enables automatic orphan removal.
- A successful command is **not** readiness. Confirmation requires exactly one additional
  container ID in the requested pool, its running state, and the expected +1 consumers on
  that pool's RabbitMQ queue. This consumer check is aggregate, not a per-connection identity
  check. Pending startup is revisited by the normal observation loop, without another create.
- A reservation not represented by an occupied Docker container counts as one slot.
  A visible starting/running/paused container already occupies its slot and is not counted
  twice. No observation error authorizes capacity or releases a reservation.

Active reports add `actions_attempted`, `actuation` and `occupied_with_reservations`.
`actions_executed` counts mutating Docker calls returning zero in that step, **not**
ready replicas. A completed scale-in may have two calls: stop and rm.
Check `actuation.ready` and `actuation.container_id`. Pending valid observations can exit
`--once` with code 0 without readiness; blocked/uncertain/failed steps exit with code 1.
Further invocations resume reconciliation from the journal.

## Enable scale-in explicitly (Block 7)

```console
python -B -m fase2.autoscaler.autoscaler --mode scale
```

This is the only mode that may stop/remove a replica. It can also scale out. The policy
still uses the configured idle window (default 60 s with both ready and unacked at zero)
and scale-in cooldown (default 30 s). These values are not tuned in this block.

One operation is selected per step. A valid scale-out intention takes priority over
scale-in; the controller never adds and removes capacity in the same step. Pending
operations block new operations in both pools, including across actuator restarts.

For each scale-in:

1. Under the same project/daemon lock, read the resolved Compose configuration and obtain
   another valid observation. Require stable workers, matching consumers, the full idle
   window and a target no lower than the configured minimum.
2. Select one deterministic full container ID from the idle pool. Persist that ID, all
   original IDs, the target and the stop grace before sending a signal.
3. Execute `docker --context CONTEXT stop --signal SIGTERM --timeout SECONDS ID`. The timeout
   comes from the selected service's explicit `stop_grace_period` (currently 45 s), rounded
   up to integer seconds; the CLI timeout covers that grace as well. The existing worker
   still cancels its consumer and has its internal 8 s to finish/requeue. No ack, heartbeat,
   requeue, watchdog, refund or worker logic is changed. Docker's stop command may escalate
   after its configured grace; the actuator adds no separate force/kill command.
4. Reobserve. A zero stop result alone is insufficient. Require that the same ID is
   actually stopped (`exited`/`dead`, not running/paused/restarting), survivors are unchanged
   and stable, and RabbitMQ reflects the disconnected consumer.
5. Obtain another observation immediately before `docker --context CONTEXT rm ID`.
   No force, volume, network, name-based or Compose scale-down operation is used.
6. Confirm the selected ID is absent, the exact survivors remain and their consumer count
   agrees. Only then release the retained budget slot. Start the real scale-in cooldown
   at completion and start a new idle window if the queue is still empty.

Stop/remove errors and timeouts remain journaled. A stopped-but-not-removed replica still
reserves its slot; unknown Docker state reports an unknown usable total, not fabricated
capacity. Reconciliation after a restart can finish a stop that completed late, or confirm
a removal whose result was lost. A request with uncertain outcome is not blindly repeated:

- Stop retries address the same persisted ID only, and require a fresh full idle window,
  zero ready/unacked, matching consumers, stable replicas and unchanged survivors/minima.
  Both the configured scale-in cooldown and the previous Docker stop grace plus read
  timeout must have elapsed. This recovers a crash after reservation but before SIGTERM.
- Removal retries address the same confirmed stopped ID, with the configured scale-in
  cooldown and another valid observation immediately before rm. They never force removal
  or select a replacement ID. This recovers a crash before rm or a transient rm failure.
- Attempt times are persisted before each request. At most one stop and one rm request
  are made per step, even if a slow call outlasts its cooldown. Reservations are retained
  until actual removal is confirmed; elapsed time alone never frees capacity.

Work arriving between observation and SIGTERM is handled by the existing ReliableConsumer.
No queue lock or new worker protocol is introduced. New ready/unacked messages always block
a new SIGTERM (including stop retries), but do not block cleanup of an already stopped,
disconnected container: rm cannot remove live capacity from that ID. The controller does
not ack, purge or modify queued messages. Completing that cleanup unlocks the existing
scale-out path, including heavy 1 -> 0 -> 1 when new work arrives during/after shutdown.
Scale-out can run in a later step, respecting its existing cooldown and budget.

Invalid metrics, changed survivor IDs, corrupt journals, or a target unexpectedly restarted
after removal was authorized keep the operation blocked. These conditions need valid
observations or explicit operator reconciliation; no journal is discarded to bypass them.

### Disable scale-in

Stop the `--mode scale` process with Ctrl+C, then start either:

```console
python -B -m fase2.autoscaler.autoscaler --mode scale-out
python -B -m fase2.autoscaler.autoscaler --mode observe
```

The first permits additions only; the second performs no mutations. Neither resumes stop/rm
for an existing pending scale-in. Resume with `--mode scale` to finish its reconciliation.
Changing modes does not undo SIGTERM or a Docker request already sent, and never discards
the journal. Do not run multiple controllers with separate state directories.

### Persistent state and uncertain operations

An atomic, fsynced JSON journal records the reservation **before** Docker is invoked. Its
key combines the daemon ID and Compose project. Defaults:

- Windows: `%LOCALAPPDATA%/picturas-autoscaler/`;
- POSIX: `~/.local/state/picturas-autoscaler/`.

Optional `state_dir` selects a directory relative to the configuration file. All actuators
for the same daemon/project **must share the same directory and OS lock namespace**. OS
locks are released on process death; lock files are kept to avoid inode races. No database,
media volume or model volume is used. `observe` does not create this directory.

A timeout, nonzero Compose result, missing container, exited new container, or absent
consumer keeps the operation pending/uncertain and blocks further mutations in both pools.
Only a missing-executable launch error releases the reservation immediately; other
OS/I/O errors keep it uncertain because the CLI may already have sent the request.
Cooldown still applies. Once valid observations establish the exact new running capacity
and consumer count, reconciliation can finish even after a CLI timeout or process restart.

An unobserved scale-out intentionally stays blocked rather than blindly creating more
capacity after a TTL. Scale-in resumes only the same ID with the guards above. For
unreconcilable deployment state, stop all actuators, inspect both pools and the journal IDs,
confirm no old Compose process/request can still create capacity, and reconcile the
deployment before an operator archives/resets the journal. Do not delete it merely because
a timeout elapsed. Corrupt journals and backwards wall clocks also block mutations.

This is a single-host controller. Locks cannot coordinate separate hosts, OS users with
different state directories, or manual/external scale commands. Use one designated
controller/shared state location and prohibit concurrent deployment changes while active.
Docker limits are preserved but do not prove the host has spare RAM/CPU. Whisper is loaded
lazily on the first transcription, so an available consumer is not a warmed speech model.

## Real Docker validation (not performed by unit tests)

Read-only preflight, from the repository root:

```console
docker info
docker compose -p picturas -f fase2/picturas-27/docker-compose.yaml config --quiet
docker compose -p picturas -f fase2/picturas-27/docker-compose.yaml ps -a video_tool video_heavy_tool
python -B -m fase2.autoscaler.autoscaler --mode observe --once
```

Ensure this stack was deployed from that exact Compose directory/file, workers are stable,
the image is already built, the queues retain their quorum/DLQ policy, and the host has room
for up to three workers (each capped at 2 CPUs/3 GiB). With deliberate existing test load,
run `--mode scale-out` in one terminal and compare before/after container IDs, labels,
mounts, network, resource limits, queue consumers and successful job completion. Verify
repeated steps never exceed 3, `--mode observe` performs no further changes, and queued
startup/consumer delays do not cause duplicate creates.

Use the existing instruments in a separate `dev` campaign, never overwrite `baseline`:
on the prepared POSIX benchmark host, `fase2/bench/run-measurements.sh dev 1 S1 S2 S3`.
The existing campaign recovery can start stopped workers: ensure none exist before the
run and do not run concurrent recovery/deployment commands during actuator safety tests.
Run the existing reliability/API regression suite afterwards. In `scale-out` mode no
post-burst reduction is expected. In `scale` mode, verify one identified idle replica is
stopped and removed after the configured idle/cooldown windows, the normal minimum stays
available, and both resource usage and consumer counts reflect the confirmed removal.
Never delete volumes for these validations. Real Docker tests and S1-S3 benchmarks belong
to the designated Ubuntu validation host; simulated unit tests are not evidence of them.

## Unit tests

```console
python -B -m unittest discover -s fase2/autoscaler/tests -v
```

The tests use injected readers and a deterministic clock. They do not contact the stack
or create containers.
