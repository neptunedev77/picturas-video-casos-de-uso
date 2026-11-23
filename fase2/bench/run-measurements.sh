#!/usr/bin/env bash
# Runs the whole measurement campaign (baseline or final) without intervention.
# Usage: bench/run-measurements.sh <phase: baseline|final|...> [reps=5] [scenario ...]
# Default scenarios: IDLE REF-* S1 S2 S3 F1..F6. Results: bench/results/<phase>/<scenario>/repN/
#
# With the elasticity work merged, run the final campaign with the autoscaler on:
#   AUTOSCALER=scale bench/run-measurements.sh final 5
# The script then starts the autoscaler (fase2/autoscaler, mode "scale") for the whole
# campaign, saves its decisions in results/<phase>/autoscaler.jsonl, and before every run
# waits until the video pools are back at rest (minimum replicas), so every repetition
# starts from the same state. Without AUTOSCALER nothing changes from the baseline method.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PHASE="${1:?baseline|final}"; REPS="${2:-5}"; shift $(( $# >= 2 ? 2 : $# ))
SCEN=("$@")
[ ${#SCEN[@]} -eq 0 ] && SCEN=(IDLE REF-trim REF-subs REF-img10 REF-mixed REF-f4mix S1 S2 S3 F1 F2 F3 F4 F5 F6)
PY="$HERE/.venv/bin/python"
OUT="$HERE/results/$PHASE"
COMPOSE_DIR="$HERE/../picturas-27"
REPO="$(cd "$HERE/../.." && pwd)"
export AUTOSCALER="${AUTOSCALER:-}"
RABBIT_API="http://localhost:15672/api"
mkdir -p "$OUT"

queues_json() { curl -s -u user:password "$RABBIT_API/queues" 2>/dev/null; }

# ---------------------------------------------------------------- autoscaler (final only)
AS_PID=""
start_autoscaler() {
  [ -n "$AUTOSCALER" ] || return 0
  if [ ! -f "$REPO/fase2/autoscaler/autoscaler.py" ]; then
    echo "ERROR: AUTOSCALER=$AUTOSCALER but fase2/autoscaler is not in this checkout"; exit 1
  fi
  # Background jobs of a script ignore Ctrl+C (SIGINT); the wrapper turns it back on, so
  # stop_autoscaler can end the autoscaler cleanly, as if Ctrl+C was pressed.
  PYTHONPATH="$REPO" RABBIT_USER=user RABBIT_PASS=password python3 -B -c '
import runpy, signal, sys
signal.signal(signal.SIGINT, signal.default_int_handler)
sys.argv = ["autoscaler", "--mode", sys.argv[1]]
runpy.run_module("fase2.autoscaler.autoscaler", run_name="__main__")' "$AUTOSCALER" \
     >> "$OUT/autoscaler.jsonl" 2>> "$OUT/autoscaler.err" &
  AS_PID=$!
  echo "autoscaler started (mode $AUTOSCALER, pid $AS_PID)"
}
stop_autoscaler() {
  [ -n "$AS_PID" ] || return 0
  kill -INT "$AS_PID" 2>/dev/null   # Ctrl+C: the autoscaler exits cleanly
  wait "$AS_PID" 2>/dev/null
  echo "autoscaler stopped"
  AS_PID=""
}
check_autoscaler() {
  [ -n "$AS_PID" ] || return 0
  if ! kill -0 "$AS_PID" 2>/dev/null; then
    echo "WARNING: autoscaler died (see $OUT/autoscaler.err), starting it again"
    start_autoscaler
  fi
}
trap stop_autoscaler EXIT

# ---------------------------------------------------------------- before every run
recover() {  # every picturas container running and unpaused, queues drained
  for c in $(docker ps -a --filter name=picturas- --filter status=paused --format '{{.Names}}'); do docker unpause "$c"; done
  for c in $(docker ps -a --filter name=picturas- --filter status=exited --format '{{.Names}}'); do
    [[ "$c" == *mongo-backup* ]] && continue
    # A video replica that exited cleanly (code 0) was stopped on purpose by the autoscaler
    # (scale-in) and is about to be removed: starting it again would undo the scale-in.
    if [ -n "$AUTOSCALER" ] && [[ "$c" == picturas-video* ]] \
       && [ "$(docker inspect -f '{{.State.ExitCode}}' "$c" 2>/dev/null)" = "0" ]; then
      continue
    fi
    docker start "$c" >/dev/null
  done
  for i in $(seq 1 120); do
    busy=$(queues_json | "$PY" -c 'import json,sys
import re
try: print(sum(q.get("messages_ready",0)+q.get("messages_unacknowledged",0) for q in json.load(sys.stdin) if not re.search(r"dlq|dead|parking", q["name"], re.I)))
except Exception: print(-1)')
    [ "$busy" = "0" ] && break
    sleep 5
  done
  [ "$busy" = "0" ] || echo "WARNING: queues not empty after 10 min (busy=$busy)"
  wait_at_rest
  sleep 10
}

wait_at_rest() {  # autoscaler on: video pools back at their minimum (normal 1, heavy 0)
  [ -n "$AUTOSCALER" ] || return 0
  check_autoscaler
  for i in $(seq 1 60); do
    state=$(queues_json | "$PY" -c 'import json,sys
try:
    q = {x["name"]: x.get("consumers", 0) for x in json.load(sys.stdin)}
    print("%s/%s" % (q.get("video_queue", "?"), q.get("video_heavy_queue", "?")))
except Exception: print("?/?")')
    others=$(docker ps -a --filter name=^picturas-video --format '{{.Status}}' | grep -vc '^Up')
    [ "$state" = "1/0" ] && [ "$others" = "0" ] && return 0
    sleep 5
  done
  echo "WARNING: video pools not at rest after 5 min (consumers normal/heavy = $state, not running = $others)"
}

# ---------------------------------------------------------------- campaign
"$HERE/env-snapshot.sh" "$OUT/env-$(date +%Y%m%dT%H%M%S).txt"
start_autoscaler
for rep in $(seq 1 "$REPS"); do
  for s in "${SCEN[@]}"; do
    dir="$OUT/$s/rep$rep"
    if [ -f "$dir/jobs.csv" ] || [ -f "$dir/docker.csv" -a "$s" = IDLE ]; then
      echo "skip $s rep$rep (already done)"; continue
    fi
    recover
    echo "=== $(date +%T) $s rep$rep ==="
    start=$(date --iso-8601=seconds)
    if [ "$s" = IDLE ]; then
      mkdir -p "$dir"; timeout -s TERM 60 "$PY" "$HERE/sampler/sampler.py" "$dir"
    else
      timeout=600; [[ "$s" == F* ]] && timeout=150
      "$PY" "$HERE/loadgen/run.py" "$s" "$dir" --timeout "$timeout"
    fi
    (cd "$COMPOSE_DIR" && docker compose logs --since "$start" --no-color > "$dir/compose.log" 2>&1)
  done
done
recover
stop_autoscaler
"$PY" "$HERE/analyze/analyze.py" "$OUT"
echo "Done: $OUT/summary.md"
