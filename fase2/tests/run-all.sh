#!/usr/bin/env bash
# Runs every functional check of phase 2 against the running stack:
#   1. projects unit tests (node --test)   2. video worker tests (pytest)
#   3. API regression suite against the golden outputs captured on the base
# Usage (stack up, from anywhere): fase2/tests/run-all.sh
# Exit code 0 only if all three pass.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../picturas-27"
PY="$HERE/../bench/.venv/bin/python"
fail=0

echo "== 1/3 projects tests"
(cd "$APP" && docker compose run --rm --no-deps projects sh -c "node --test tests/*.test.js") \
  2>&1 | grep -E "^ℹ (tests|pass|fail)|✖" || true
(cd "$APP" && docker compose run --rm --no-deps projects sh -c "node --test tests/*.test.js" >/dev/null 2>&1) || fail=1

echo "== 2/3 video worker tests"
(cd "$APP" && docker compose run --rm --no-deps video_tool sh -c \
  "pip install -q pytest 2>/dev/null && python -m pytest -q tests") 2>&1 | tail -3
[ "${PIPESTATUS[0]}" -eq 0 ] || fail=1

echo "== 3/3 API regression (golden outputs)"
"$PY" "$HERE/regression/regression.py" || fail=1

[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOMETHING FAILED (see above)"
exit $fail
