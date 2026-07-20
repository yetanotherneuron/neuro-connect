#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Stopping any running neuro-server so the binary can be replaced..."
"$ROOT/scripts/stop-server.sh" || true

echo "Building neuro-server (release)..."
cargo build -p neuro-server --release
mkdir -p dist
cp -f target/release/neuro-server dist/neuro-server
chmod +x dist/neuro-server
echo "Built: target/release/neuro-server"
echo "Copied: dist/neuro-server"
