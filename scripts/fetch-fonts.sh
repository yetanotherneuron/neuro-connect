#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONT_DIR="$ROOT/assets/fonts"
PUBLIC="$ROOT/apps/desktop/public/fonts"
mkdir -p "$FONT_DIR" "$PUBLIC"
curl -L "https://github.com/google/fonts/raw/main/ofl/outfit/Outfit%5Bwght%5D.ttf" -o "$FONT_DIR/Outfit-Variable.ttf"
curl -L "https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf" -o "$FONT_DIR/JetBrainsMono-Regular.ttf"
cp "$FONT_DIR/Outfit-Variable.ttf" "$FONT_DIR/JetBrainsMono-Regular.ttf" "$PUBLIC/"
echo "Fonts ready"
