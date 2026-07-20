#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

CHANNEL="${NEURO_CHANNEL:-beta}"
SERVER_URL="${NEURO_SERVER_URL:-}"
VERSION="${NEURO_APP_VERSION:-}"

if [[ "$CHANNEL" == "release" && -z "$SERVER_URL" ]]; then
  echo "Release builds require NEURO_SERVER_URL (e.g. https://chat.example.com)" >&2
  exit 1
fi

if [[ -z "$VERSION" ]]; then
  VERSION="$(node -p "require('$ROOT/apps/desktop/package.json').version")"
fi

export NEURO_CHANNEL="$CHANNEL"
export NEURO_SERVER_URL="$SERVER_URL"
export NEURO_APP_VERSION="$VERSION"
export TAURI_CONF="$ROOT/apps/desktop/src-tauri/tauri.conf.json"

PRODUCT_NAME="Neuro Connect"
IDENTIFIER="com.yetanotherneuron.neuroconnect"
if [[ "$CHANNEL" != "release" ]]; then
  PRODUCT_NAME="Neuro Connect Beta"
  IDENTIFIER="com.yetanotherneuron.neuroconnect.beta"
fi

BACKUP="${TAURI_CONF}.bak"
cp -f "$TAURI_CONF" "$BACKUP"

cleanup() {
  if [[ -f "$BACKUP" ]]; then
    mv -f "$BACKUP" "$TAURI_CONF"
  fi
}
trap cleanup EXIT

node <<EOF
const fs = require('fs');
const p = process.env.TAURI_CONF;
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.productName = '$PRODUCT_NAME';
j.identifier = '$IDENTIFIER';
j.version = '$VERSION';
if (j.app?.windows?.[0]) j.app.windows[0].title = '$PRODUCT_NAME';
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
EOF

cd "$ROOT/apps/desktop"
echo "Building $PRODUCT_NAME (channel=$CHANNEL, version=$VERSION)..."
npm install
npm run tauri build

mkdir -p "$ROOT/dist"
# Cargo workspace release dir (preferred); fall back to crate-local target.
BUNDLE_ROOT="$ROOT/target/release"
if [[ ! -d "$BUNDLE_ROOT/bundle" && -d "$ROOT/apps/desktop/src-tauri/target/release/bundle" ]]; then
  BUNDLE_ROOT="$ROOT/apps/desktop/src-tauri/target/release"
fi
BUNDLE="$BUNDLE_ROOT/bundle"

copy_glob() {
  local dir="$1"
  local dest="$2"
  if [[ -d "$dir" ]]; then
    mkdir -p "$dest"
    cp -f "$dir"/* "$dest/" 2>/dev/null || true
  fi
}

copy_glob "$BUNDLE/appimage" "$ROOT/dist"
copy_glob "$BUNDLE/deb" "$ROOT/dist/linux"
copy_glob "$BUNDLE/rpm" "$ROOT/dist/linux"
copy_glob "$BUNDLE/dmg" "$ROOT/dist/macos"

if [[ -f "$BUNDLE_ROOT/neuro-connect" ]]; then
  cp -f "$BUNDLE_ROOT/neuro-connect" "$ROOT/dist/neuro-connect"
  chmod +x "$ROOT/dist/neuro-connect"
fi
cp -f "$ROOT/scripts/neuro-connect.sh" "$ROOT/dist/" 2>/dev/null || true

echo "Client build finished. Artifacts in dist/ (from $BUNDLE_ROOT)"
echo "Linux: AppImage in dist/; .deb/.rpm in dist/linux/ (when toolchain supports them)"
echo "macOS: .dmg in dist/macos/ when built on macOS"
echo "Android APK: npm run build:android (separate Capacitor step)"
