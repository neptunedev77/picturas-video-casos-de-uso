#!/usr/bin/env bash
# Records the measurement environment (commit, versions, hardware, load) for one run.
# Usage: bench/env-snapshot.sh <output-file>
set -u
OUT="${1:-/dev/stdout}"
REPO="$(cd "$(dirname "$0")/../picturas-27" && pwd)"
{
  echo "# env-snapshot $(date --iso-8601=seconds)"
  echo "## commit"; git -C "$REPO" rev-parse HEAD; git -C "$REPO" status --short | head -20
  echo "## kernel"; uname -a
  echo "## cpu"; lscpu | grep -E "Model name|^CPU\(s\)|Thread|Core|MHz"
  echo "## memory"; free -h
  echo "## power"
  powerprofilesctl get 2>/dev/null || echo "powerprofilesctl n/a"
  for s in /sys/class/power_supply/A*/online; do [ -f "$s" ] && echo "ac_online=$(cat "$s")"; done
  echo "## docker"; docker version --format 'client={{.Client.Version}} server={{.Server.Version}}'
  docker compose version
  echo "## containers"; docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | sort
  echo "## loadavg"; cat /proc/loadavg
  echo "## autoscaler"
  echo "AUTOSCALER mode for this campaign: ${AUTOSCALER:-off}"
  AS_CFG="$(dirname "$REPO")/autoscaler/config.json"
  [ -f "$AS_CFG" ] && cat "$AS_CFG" || echo "no fase2/autoscaler in this checkout"
} > "$OUT" 2>&1
