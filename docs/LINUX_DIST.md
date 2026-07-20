# Linux release notes

AppImage and native Linux binaries must be **built on a Linux machine** (WiX/NSIS are Windows-only; AppImage needs Linux).

## On a Linux builder

```bash
# Server
./scripts/build-server.sh
# produces dist/neuro-server

# Client AppImage
./scripts/build-client.sh
# copies *.AppImage into dist/

# Launcher
cp scripts/neuro-connect.sh dist/
chmod +x dist/*.sh dist/neuro-server dist/neuro-connect 2>/dev/null || true
```

## Suggested GitHub Release assets (Linux)

| File | Purpose |
|------|---------|
| `Neuro-Connect-x86_64.AppImage` | Desktop client |
| `neuro-connect.sh` | Simple launcher |
| `neuro-server` | Server core binary |
| `start-server.sh` / `stop-server.sh` | Helpers |
| `server.example.toml` | Config |

## Tray host on Linux

`Neuro Server.exe` (tray host) is Windows-focused. On Linux, run:

```bash
./start-server.sh
```

in a terminal for live logs. A Linux tray host can be added later.
