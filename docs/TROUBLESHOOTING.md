# Troubleshooting

## Cannot connect / “Failed to fetch”

- Is `neuro-server` running? Open `http://HOST:7420/health` - it should say `ok`.
- Check **Server URL** (include `http://`, correct IP and port).
- Firewall blocking port 7420?
- Mixed content: desktop app uses HTTP to local servers by design.

## “username already taken” / invalid username

- Usernames: start with a letter, then letters/numbers/underscore, length 3-32.
- No email, no `#discriminator`.

## “invalid username or password”

- Usernames are case-insensitive; passwords are case-sensitive.
- Register on **this** server - accounts are not global across hosts.

## “file exceeds N MB”

- Upload limit is intentional (bandwidth + disk).
- Paste a direct link for larger files.

## “cannot delete this message”

- In channels: author or Moderator+ can delete.
- In DMs: **either** participant can delete any message in that DM.
- Global Admin can delete any message.

## Access is denied when building (os error 5)

`neuro-server.exe` is still running, so Cargo cannot overwrite it.

```bat
scripts\stop-server.bat
cargo run -p neuro-server -- server.toml
```

Or use `scripts\build-server.bat` (it stops the server first, then builds).

## Port already in use (os error 10048)

Another `neuro-server` (or app) is using port **7420**.

When you start the server again, it will ask:

```text
Port 7420 is already in use ...
Terminate it and start this server instead? [y/N]:
```

Type `y` and Enter to kill the old process and continue.

Or manually:

```powershell
# Find PID
netstat -ano -p tcp | findstr :7420
# Kill it
taskkill /PID <pid> /F
```

## “account is banned”

- A Global Admin banned this username on this `neuro-server` instance.
- Ask the host to unban you in Settings → Global Admin users, or `POST /api/admin/users/{id}/unban`.

## Global Admin claim fails

- Confirm `global_admin_username` matches your username (case-insensitive).
- Confirm `global_admin_bootstrap_secret` matches what you paste in Settings → Claim.
- If the secret is empty in config, admin elevates automatically on login - Claim is not needed.

## Dev Mode seed users

- With `dev_mode = true` and an empty database, log in as `devuser` / `devpass12`.
- If the DB already has users, seed is skipped - delete `database_path` to re-seed (loses data).

## WebSocket disconnects

- Use `ws://` equivalent of your server URL (the client converts automatically).
- Proxies must support WebSocket upgrade on `/api/ws`.

## Tauri / blank window (dev)

- Run `npm install` inside `apps/desktop`.
- Ensure port `1420` is free for Vite.
- Install WebView2 on Windows.

## Linux AppImage won’t start

- `chmod +x` the AppImage.
- Install FUSE if required by your distro (see [requirements/linux.md](../requirements/linux.md)).
- Try `./scripts/neuro-connect.sh ./Neuro-Connect-x86_64.AppImage`.

## Database locked / corrupt

- Only one `neuro-server` process should use a given `database_path`.
- Stop the server before copying the `.db` file for backups.

## Firewall blocking port 7420?

See [FIREWALL.md](FIREWALL.md) for ufw, firewall-cmd, and Windows Firewall. Also open the port in your cloud provider panel.

## Find on LAN shows nothing

- Server must use `bind = "0.0.0.0:7420"` (not loopback) and `lan_discovery = true`.
- Client and server must be on the same LAN/Wi‑Fi.
- Some guest Wi‑Fi networks block mDNS (UDP 5353).
- Use the Server URL field manually as a fallback.

## Voice connects but no audio (remote friends)

- Allow microphone permission in the OS / app.
- Strict NAT may need a TURN server in client `ice_servers` — see [CONFIGURATION.md](CONFIGURATION.md) and [FIREWALL.md](FIREWALL.md).

## Game host address not reachable

- Neuro Connect only shares the IP:port string; the game must accept LAN/IP joins.
- Host firewall must allow the game’s port.
- See [GAME_HOSTING.md](GAME_HOSTING.md).

## VPS with public IP only

Follow [VPS_HOSTING.md](VPS_HOSTING.md). Clients use `http://PUBLIC_IP:7420` (Beta) or a Release build baked to that URL.
