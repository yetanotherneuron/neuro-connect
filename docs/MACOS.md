# macOS desktop builds

Neuro Connect targets macOS via Tauri 2 (`dmg` / `.app` bundles).

## Requirements

- macOS host (or GitHub `macos-latest` runner)
- Xcode Command Line Tools
- Rust stable + Node 20+
- See also [requirements/macos.md](../requirements/macos.md)

## Build

```bash
NEURO_CHANNEL=beta ./scripts/build-client.sh
# artifacts: dist/macos/*.dmg (and under apps/desktop/src-tauri/target/release/bundle/)
```

Release channel:

```bash
NEURO_CHANNEL=release NEURO_SERVER_URL=https://chat.example.com ./scripts/build-client.sh
```

## CI notes

- Prefer a dedicated `macos-latest` job for client bundles (signing/notarization optional for portfolio builds).
- Update API platform key: `macos-x64` / `macos-aarch64` as published by your server.
- Code signing and notarization are **not** required for local/dev artifacts; add Apple Developer credentials before public distribution.

## Limitations

- Goldberg Steam-LAN helper and some capture paths are Windows-first; macOS gets text/voice/screen share via WebRTC where the OS allows.
