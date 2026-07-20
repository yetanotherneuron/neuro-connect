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
| `GET /api/media/status` | Mock stream when `dev_mode` |
| `GET /api/dev/whoami` | Debug identity (dev_mode only) |

LAN discovery and media URL relay remain stubs / roadmap. Voice + screen share use WebRTC in the WebView with server signaling on `/api/ws` (see [VOICE.md](VOICE.md)).
