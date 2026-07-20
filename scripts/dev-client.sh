#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/desktop"
echo "Tip: run scripts/start-server.sh in another terminal first."
npm install
npm run tauri dev
