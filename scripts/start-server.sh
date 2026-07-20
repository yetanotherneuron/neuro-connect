#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f server.toml ]]; then
  echo "Creating server.toml from example..."
  cp configs/server.example.toml server.toml
fi

if [[ -x target/release/neuro-server ]]; then
  BIN=target/release/neuro-server
elif [[ -x target/debug/neuro-server ]]; then
  BIN=target/debug/neuro-server
elif [[ -x dist/neuro-server ]]; then
  BIN=dist/neuro-server
else
  echo "neuro-server not found - building release..."
  "$ROOT/scripts/build-server.sh"
  BIN=target/release/neuro-server
fi

echo "Starting Neuro Connect server..."
echo "Binary: $BIN"
exec "$BIN" server.toml
