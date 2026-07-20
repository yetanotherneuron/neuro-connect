# Configuration

All settings are plain text. Lines starting with `#` are comments.

## Server - `server.toml`

Start from the example:

```bash
cp configs/server.example.toml server.toml
```

| Setting | Meaning |
|---------|---------|
| `bind` | Address and port. Use `127.0.0.1:7420` for local-only, or `0.0.0.0:7420` to allow LAN/internet (protect with a firewall). |
| `database_path` | Where the SQLite database file is stored. |
| `upload_dir` | Folder for uploaded files (max size set by `max_upload_mb`). |
| `jwt_secret` | **Change this.** Long random string used to sign login tokens. |
| `token_ttl_hours` | How long a login stays valid (hours). |
| `max_upload_mb` | Max upload size (10-12 recommended). Larger files: paste a direct link in chat. |
| `public_url` | Optional public base URL for helpers/logs. |
| `global_admin_username` | Username that becomes Global Admin across the whole instance. Empty = disabled. |
| `global_admin_bootstrap_secret` | Optional one-time secret; if set, that user must call **Claim** in Settings (or `POST /api/admin/claim`) before elevation. Empty = auto-elevate on login/register. |
| `dev_mode` | Local test mode (seed users, mock stubs). **Never enable on a public host.** |
| `lan_discovery` | Advertise `_neuroconnect._tcp` on the LAN (skip if bind is loopback). |
| `lan_service_name` | Friendly name shown in **Find on LAN**. |

Generate a secret on Windows (PowerShell):

```powershell
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

On Linux:

```bash
openssl rand -hex 32
```

### Global Admin Mode

1. Set `global_admin_username` to an English username you will register (example: `neuroowner`).
2. Prefer setting `global_admin_bootstrap_secret` on any host that is reachable from the internet.
3. Register/login as that username. If a bootstrap secret is configured, open **Settings → Claim Global Admin** and paste it once.
4. Global Admin can: see every server, enter any channel, delete any message, ban/unban users, delete servers.

### Test / Development Mode

In `server.toml`:

```toml
dev_mode = true
bind = "127.0.0.1:7420"
```

When the database is empty, the server seeds:

- `devuser` / `devpass12` (Global Admin)
- `devbuddy` / `devpass12`
- Server **Dev Playground** with text + voice channels

`/api/media/status` remains a stub (mock in Dev Mode). **Voice** and **LAN** status endpoints report live state.

Check `GET /api/meta` for `{ "dev_mode": true, ... }`.

## Client - `client.toml`

Example: [configs/client.example.toml](../configs/client.example.toml).

The desktop app also writes a `client.toml` into its app data folder when you change the server URL.

| Setting | Meaning |
|---------|---------|
| `server_url` | Full HTTP URL of `neuro-server`, e.g. `http://192.168.1.50:7420`. Ignored on **Release** builds (baked URL). |
| `push_to_talk` | `true` = hold PTT key to speak; `false` = open mic. |
| `hotkey_*` | Global / in-app hotkeys for mute, deafen, and PTT. |
| `voice_sounds` | Play short join/leave tones. |
| `ice_servers` | Extra STUN/TURN URLs for voice (e.g. `"turn:user:pass@host:3478"`). |
| `prefer_external_images` | Prefer avatar/banner URLs over server storage. |
| `dev_mode_ui` | Show Dev Mode banner when the server reports `dev_mode`. |

### Build channels

- **Beta** (`NEURO_CHANNEL=beta`): Server URL field on login (default for `tauri dev`).
- **Release** (`NEURO_CHANNEL=release` + `NEURO_SERVER_URL=...`): no URL field; always connects to the baked address.

## Environment

- Server logging: set `RUST_LOG=info` or `RUST_LOG=debug`.
- Client build: `NEURO_CHANNEL`, `NEURO_SERVER_URL`, `NEURO_APP_VERSION` (see [BUILD_RELEASE.md](BUILD_RELEASE.md)).

## Profile images

- Prefer **https://** links for avatar and banner (max conceptual size 4 MB).
- This avoids filling the server disk.
