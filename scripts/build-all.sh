#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/build-server.sh"
"$ROOT/scripts/build-client.sh"
echo "All builds complete."
