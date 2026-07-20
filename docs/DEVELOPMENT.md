# Neuro Connect - Project structure

```
neuro-connect/
  apps/desktop/     Tauri 2 + React client
  apps/server/      neuro-server (Axum + SQLite)
  crates/shared/    Protocol, models, Argon2 helpers
  website/          Static marketing site (GitHub Pages–ready)
  web/              Future web/mobile scaffold
  configs/          Example TOML configs
  docs/             User documentation
  requirements/     OS dependency lists
  scripts/          Build & launch helpers
  assets/           Icons, fonts, sound placeholders
```

## Local development loop (recommended)

1. Copy and enable Dev Mode:

```powershell
copy configs\server.example.toml server.toml
```

Edit `server.toml`:

```toml
bind = "127.0.0.1:7420"
dev_mode = true
global_admin_username = "devuser"
# leave bootstrap empty for auto-elevate while testing
global_admin_bootstrap_secret = ""
```

2. Terminal A - server:

```powershell
cargo run -p neuro-server -- server.toml
```

On first empty DB you get `devuser` / `devpass12` (Global Admin) and **Dev Playground**.

3. Terminal B - desktop:

```powershell
cd apps\desktop
npm install
npm run tauri dev
```

4. Log in as `devuser` / `devpass12`. You should see a purple **Dev Mode** banner. Open a **Voice** channel and click **Join Voice** (allow the mic).

### Useful endpoints while developing

| URL | Purpose |
|-----|---------|
| `GET /health` | Liveness |
| `GET /api/meta` | `{ dev_mode, version, global_admin_enabled }` |
| `GET /api/voice/status` | Live voice rooms |
| `GET /api/updates/latest?channel=beta&platform=windows-x64` | Latest client update manifest |
| `GET /api/lan/status` | Mock peers when `dev_mode` |
| `GET /api/media/status` | Active media URL relay |
| `POST /api/media/start` | Start streaming a direct media URL via the server |
| `POST /api/media/stop` | Stop the active relay |
| `GET /api/media/stream/{id}` | Proxied media bytes |

LAN discovery remains optional. Voice + screen share + media relay use `/api/ws` and HTTP as documented in [VOICE.md](VOICE.md) / [SERVER_SETUP.md](SERVER_SETUP.md).

## Desktop UI layout (0.3+)

The desktop client lives under `apps/desktop/src/`:

| Piece | Path |
|-------|------|
| Design tokens + button primitives | `styles/global.css` |
| App shell (state + view switcher) | `pages/MainShell.tsx` |
| Server rail / channel sidebar / members | `components/ServerRail.tsx`, `ChannelSidebar.tsx`, `MemberPanel.tsx` |
| Settings | `components/SettingsView.tsx` + `SettingsView.css` |
| Chat + messages | `ChatView.tsx` / `MessageItem.tsx` (+ co-located CSS) |
| Dialogs | `components/Modal.tsx` |
| Emoji picker | `components/EmojiPicker.tsx` (`emoji-picker-react`) |

Shell columns: **server rail → channel/DM sidebar → main surface → members** (server mode). Main pane uses an elevated surface framed against `--bg-deep`.

### Unread + search APIs

| URL | Purpose |
|-----|---------|
| `POST /api/channels/{id}/read` | Mark channel read (optional `{ message_id }`) |
| `POST /api/dms/{id}/read` | Mark DM read |
| `GET /api/channels/{id}/messages/search?q=` | Search channel messages |
| `GET /api/dms/{id}/messages/search?q=` | Search DM messages |

Channel/DM list payloads include `unread_count` (default `0`).
