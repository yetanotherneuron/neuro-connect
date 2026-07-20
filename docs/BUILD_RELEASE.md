# Building releases

Goal: a **small number of clean artifacts** suitable for distribution and self-hosted auto-updates.

## Prerequisites

- Rust stable toolchain
- Node.js 20+
- Platform notes in `requirements/`

## Build channels

| Channel | Product names | Server URL at login | Build |
|---------|---------------|---------------------|-------|
| **beta** (default) | Neuro Connect Beta / Neuro Server Beta | Editable | `./scripts/build-client.ps1 -Channel beta` |
| **release** | Neuro Connect / Neuro Server | Locked to bake-time URL | `./scripts/build-client.ps1 -Channel release -ServerUrl https://your-vps.example.com` |

Beta is intended for testers and self-hosters who pick their own IP. Release is for a locked official VPS build.

## Build the server

```bash
cargo build -p neuro-server --release
```

Binary:

- Windows: `target/release/neuro-server.exe`
- Linux: `target/release/neuro-server`

```bash
# Windows
./scripts/build-server.ps1

# Linux
./scripts/build-server.sh
```

Package tray host + client into `dist\`:

```powershell
./scripts/package-dist.ps1 -Channel beta
# or
./scripts/package-dist.ps1 -Channel release
```

## Build the desktop client

```powershell
# Beta (selectable Server URL)
./scripts/build-client.ps1 -Channel beta

# Production locked to your VPS
./scripts/build-client.ps1 -Channel release -ServerUrl https://chat.example.com -Version 0.2.0
```

Windows outputs (renamed into `dist\`):

| Channel | Artifacts |
|---------|-----------|
| beta | `Neuro Connect Beta Setup.exe`, `Neuro Connect Beta.msi`, `Neuro Connect Beta.exe` |
| release | `Neuro Connect Setup.exe`, `Neuro Connect.msi`, `Neuro Connect.exe` |

### Linux outputs

```bash
npm run tauri build
./scripts/build-appimage.sh
```

## Self-hosted auto-update (VPS)

Updates are served by **neuro-server**, not GitHub.

1. Build a new client artifact.
2. Publish it on the VPS:

```bash
neuro-server update publish \
  --config server.toml \
  --channel beta \
  --platform windows-x64 \
  --version 0.2.0 \
  --file "Neuro Connect Beta Setup.exe" \
  --notes "Voice fixes and UI polish"
```

Or as Global Admin via `POST /api/admin/updates` (multipart: `version`, `channel`, `platform`, `notes`, `file`).

3. Clients check `GET /api/updates/latest?channel=beta&platform=windows-x64` on launch and show an **Update available** modal.

Artifacts live under `data/updates/{channel}/{platform}/` next to the SQLite DB.

## Suggested distribution assets

| Asset | Description |
|-------|-------------|
| `Neuro Connect Beta Setup.exe` / `.msi` | Windows installer (beta) |
| `Neuro Connect Beta.exe` | Portable client (beta) |
| `Neuro Server Beta.exe` | Tray host (beta) |
| `neuro-server` (+ config) | Core server binary |
| AppImage / `.sh` | Linux (see LINUX_DIST.md) |

## Version bump

Update version in:

- root `Cargo.toml` workspace package
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `web/package.json`
- and pass `-Version` to `build-client.ps1`
