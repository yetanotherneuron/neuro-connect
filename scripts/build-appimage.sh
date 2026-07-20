#!/usr/bin/env bash
# Build Tauri Linux AppImage and copy into dist/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/desktop"
npm install
npm run tauri build
OUT="$ROOT/dist"
mkdir -p "$OUT"
BUNDLE="$ROOT/apps/desktop/src-tauri/target/release/bundle/appimage"
if [[ -d "$BUNDLE" ]]; then
  cp -f "$BUNDLE"/*.AppImage "$OUT/" 2>/dev/null || true
fi
cp -f "$ROOT/scripts/neuro-connect.sh" "$OUT/"
echo "AppImage artifacts (if any) copied to $OUT"
echo "Launcher: $OUT/neuro-connect.sh"
