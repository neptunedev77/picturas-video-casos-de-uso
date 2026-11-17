#!/usr/bin/env bash
# Runs the whole measurement campaign (baseline or final) without intervention.
# Usage: bench/run-measurements.sh <phase: baseline|final> [reps=5] [scenario ...]
# Default scenarios: IDLE REF-* S1 S2 S3 F1..F6. Results: bench/results/<phase>/<scenario>/repN/
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PHASE="${1:?baseline|final}"; REPS="${2:-5}"; shift $(( $# >= 2 ? 2 : $# ))
SCEN=("$@")
[ ${#SCEN[@]} -eq 0 ] && SCEN=(IDLE REF-trim REF-subs REF-img10 REF-mixed S1 S2 S3 F1 F2 F3 F4 F5 F6)
PY="$HERE/.venv/bin/python"
OUT="$HERE/results/$PHASE"
COMPOSE_DIR="$HERE/../picturas-27"
mkdir -p "$OUT"

recover() {  # every picturas container running and unpaused, queues drained
  for c in $(docker ps -a --filter name=picturas- --filter status=paused --format '{{.Names}}'); do docker unpause "$c"; done
  for c in $(docker ps -a --filter name=picturas- --filter status=exited --format '{{.Names}}'); do
    [[ "$c" == *mongo-backup* ]] || docker start "$c" >/dev/null
  done
  for i in $(seq 1 120); do
    busy=$(curl -s -u user:password http://localhost:15672/api/queues 2>/dev/null \
      | "$PY" -c 'import json,sys
import re
try: print(sum(q.get("messages_ready",0)+q.get("messages_unacknowledged",0) for q in json.load(sys.stdin) if not re.search(r"dlq|dead|parking", q["name"], re.I)))
except Exception: print(-1)')
    [ "$busy" = "0" ] && break
    sleep 5
  done
  [ "$busy" = "0" ] || echo "WARNING: queues not empty after 10 min (busy=$busy)"
  sleep 10
}

"$HERE/env-snapshot.sh" "$OUT/env-$(date +%Y%m%dT%H%M%S).txt"
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
"$PY" "$HERE/analyze/analyze.py" "$OUT"
echo "Done: $OUT/summary.md"
