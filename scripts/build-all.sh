#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHANNEL="${NEURO_CHANNEL:-beta}"
SERVER_URL="${NEURO_SERVER_URL:-}"

echo "Building server + desktop (Linux) + Android (if SDK present)..."
"$ROOT/scripts/build-server.sh"
NEURO_CHANNEL="$CHANNEL" NEURO_SERVER_URL="$SERVER_URL" "$ROOT/scripts/build-client.sh"

if [[ "${NEURO_SKIP_ANDROID:-}" != "1" ]]; then
  if command -v java >/dev/null 2>&1; then
    echo "=== Android APK ==="
    # Prefer PowerShell core if present; else use bash-friendly gradle path
    if command -v pwsh >/dev/null 2>&1; then
      pwsh -File "$ROOT/scripts/build-android.ps1" -Channel "$CHANNEL" || {
        echo "WARNING: Android build failed (set ANDROID_HOME or install SDK)."
      }
    else
      (
        cd "$ROOT/web"
        npm install
        npm run build
        npx cap sync android
        cd android
        if [[ -n "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]]; then
          ./gradlew assembleDebug --no-daemon
          mkdir -p "$ROOT/dist/android"
          find app/build/outputs/apk -name '*.apk' -print0 | xargs -0 -I{} cp -f {} "$ROOT/dist/android/" || true
          find app/build/outputs/apk -name '*.apk' -print0 | xargs -0 -I{} cp -f {} "$ROOT/dist/" || true
        else
          echo "WARNING: ANDROID_HOME not set; skipping APK."
        fi
      ) || echo "WARNING: Android build failed."
    fi
  else
    echo "WARNING: Java not found; skipping APK."
  fi
fi

echo "All builds complete. See dist/ (AppImage, deb/rpm, APK when produced)."
