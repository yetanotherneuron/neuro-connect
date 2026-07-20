#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -x "$ROOT/dist/neuro-connect" ]]; then
  exec "$ROOT/dist/neuro-connect"
fi
if [[ -f "$ROOT/dist/"*.AppImage ]]; then
  exec "$ROOT/scripts/neuro-connect.sh"
fi
echo "Desktop binary not found in dist/."
echo "Run scripts/build-client.sh first, or scripts/dev-client.sh for development."
exit 1
