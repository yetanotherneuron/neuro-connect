#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/desktop"

echo "Building Neuro Connect desktop client..."
npm install
npm run tauri build

mkdir -p "$ROOT/dist"
BUNDLE="$ROOT/apps/desktop/src-tauri/target/release/bundle"
if [[ -d "$BUNDLE/appimage" ]]; then
  cp -f "$BUNDLE"/appimage/*.AppImage "$ROOT/dist/" 2>/dev/null || true
fi
if [[ -f "$ROOT/apps/desktop/src-tauri/target/release/neuro-connect" ]]; then
  cp -f "$ROOT/apps/desktop/src-tauri/target/release/neuro-connect" "$ROOT/dist/neuro-connect"
  chmod +x "$ROOT/dist/neuro-connect"
fi
cp -f "$ROOT/scripts/neuro-connect.sh" "$ROOT/dist/" 2>/dev/null || true
echo "Client build finished. See dist/ and $BUNDLE"
