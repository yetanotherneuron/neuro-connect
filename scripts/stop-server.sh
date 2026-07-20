#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Stopping Neuro Connect server..."
pkill -f 'neuro-server' 2>/dev/null || true

# Free port from server.toml / default 7420
PORT=7420
if [[ -f server.toml ]]; then
  BIND=$(grep -E '^\s*bind\s*=' server.toml | head -1 | cut -d'"' -f2 || true)
  if [[ -n "${BIND:-}" && "$BIND" == *:* ]]; then
    PORT="${BIND##*:}"
  fi
fi

if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "${PIDS:-}" ]]; then
    echo "Killing PIDs on port ${PORT}: ${PIDS}"
    kill -TERM ${PIDS} 2>/dev/null || true
    sleep 0.4
    kill -KILL ${PIDS} 2>/dev/null || true
  fi
fi

echo "Done."
