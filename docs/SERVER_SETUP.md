# Server setup

Neuro Connect uses a **hybrid** model: you (or a friend) run `neuro-server`, and clients connect with an invite code or the server URL.

## Minimal hosting checklist

1. Copy `configs/server.example.toml` → `server.toml`.
2. Change `jwt_secret` to a long random value.
3. Decide bind address:
   - Same PC only → `127.0.0.1:7420`
   - Home LAN → `0.0.0.0:7420` and share `http://YOUR_LAN_IP:7420`
4. Open the port in your firewall if needed.
5. Start the server:

```bash
neuro-server server.toml
```

6. Clients set **Server URL** to that address, register, then **Create** or **Join** a community.
7. Configure **Global Admin** (recommended): set `global_admin_username` and a non-empty `global_admin_bootstrap_secret`. See [CONFIGURATION.md](CONFIGURATION.md).
8. Keep `dev_mode = false` on any host that is not your personal machine.

## Security warnings

- Never set `dev_mode = true` on a public or LAN-shared server (it seeds known passwords and exposes mock debug helpers).
- On the public internet, always set `global_admin_bootstrap_secret` so random registration of the admin username cannot steal Global Admin.
- Change `jwt_secret` before hosting.

## Invites

When you create a server, Neuro Connect generates an **invite code** (shown under the server name). Share that code - no Discord-style vanity URLs required.

## Ranks (fixed - no custom roles)

| Rank | Typical powers |
|------|----------------|
| Owner | Full control (creator) |
| Admin | Channels, ranks (not Owner) |
| Moderator | Delete others’ channel messages |
| Member | Chat |

**Global Admin** (config username) sits above every community: all servers, any channel, any message delete, instance-wide ban/unban, delete servers. Managed in the desktop **Settings** panel.

## Uploads

- Default limit: **12 MB**.
- Files are stored under `upload_dir` and served at `/uploads/...`.
- For larger files, paste a direct download link in chat.

## Voice

Voice uses **WebRTC mesh** (Opus in the browser/WebView). The server handles room membership and signaling over `/api/ws` (offer/answer/ICE). Media stays peer-to-peer.

- Join a voice channel from the sidebar.
- Push-to-talk or open mic (Settings).
- Mute / deafen / move members (mods+).
- **Screen share** (and desktop audio when the OS allows) from the voice panel — one sharer per channel.
- `GET /api/voice/status` lists live rooms.
- Optional TURN: set `ice_servers` in client config (see [FIREWALL.md](FIREWALL.md)).

See [VOICE.md](VOICE.md) for details.

## LAN discovery + game hosts

- Server advertises `_neuroconnect._tcp` when `lan_discovery = true` (non-loopback bind).
- Beta clients: **Find on LAN** on the login screen.
- **Game Host board** on Home — see [GAME_HOSTING.md](GAME_HOSTING.md).

## Auto-updates

Publish client builds to this server so users update on launch (see [BUILD_RELEASE.md](BUILD_RELEASE.md)):

```bash
neuro-server update publish --config server.toml --channel beta --platform windows-x64 --version 0.2.0 --file setup.exe --notes "..."
```

## Media URL relay

Paste a direct audio/video URL in the client; the server fetches it and clients play via
`GET /api/media/stream/{id}?token=…` (saves the origin from N parallel downloads).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/media/status` | Active relay (if any) |
| POST | `/api/media/start` | Start relay `{ url, title?, channel_id?, server_id? }` |
| POST | `/api/media/stop` | Stop (starter, mod, or global admin) |
| GET | `/api/media/stream/{id}` | Proxied bytes (`Authorization` or `?token=`) |

Private/local hosts are blocked (SSRF protection). One active relay at a time.

## Reverse proxy (optional)

If you put Nginx/Caddy in front, forward HTTP and WebSockets for `/api/ws`.
