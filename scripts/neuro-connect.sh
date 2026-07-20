#!/usr/bin/env bash
# Neuro Connect Linux launcher
# Usage:
#   ./scripts/neuro-connect.sh
#   ./scripts/neuro-connect.sh /path/to/Neuro-Connect-x86_64.AppImage

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

APPIMAGE=""
if [[ $# -gt 0 && -f "${1:-}" ]]; then
  APPIMAGE="$1"
  shift
fi

if [[ -z "$APPIMAGE" ]]; then
  for candidate in \
    "$ROOT_DIR/dist/Neuro-Connect-x86_64.AppImage" \
    "$ROOT_DIR/Neuro-Connect-x86_64.AppImage" \
    "$SCRIPT_DIR/Neuro-Connect-x86_64.AppImage"
  do
    if [[ -f "$candidate" ]]; then
      APPIMAGE="$candidate"
      break
    fi
  done
fi

if [[ -z "$APPIMAGE" || ! -f "$APPIMAGE" ]]; then
  echo "Neuro Connect launcher"
  echo
  echo "Could not find an AppImage."
  echo "Download Neuro-Connect-x86_64.AppImage from GitHub Releases, then run:"
  echo "  $0 /path/to/Neuro-Connect-x86_64.AppImage"
  echo
  echo "If the AppImage fails to start, install FUSE (see requirements/linux.md)."
  exit 1
fi

chmod +x "$APPIMAGE" 2>/dev/null || true
echo "Starting Neuro Connect…"
exec "$APPIMAGE" "$@"
