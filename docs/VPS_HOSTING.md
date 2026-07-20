# VPS hosting (public IP, no domain)

This guide is for beginners hosting Neuro Connect on a cheap VPS with **only a public IP** (no domain name required).

Clients connect with:

```text
http://YOUR_PUBLIC_IP:7420
```

## What you need

- A VPS with a public IPv4 address (Ubuntu 22.04+ or Windows Server)
- Ability to open **TCP port 7420** in the cloud firewall + OS firewall
- The `neuro-server` binary (see [BUILD_RELEASE.md](BUILD_RELEASE.md))

## Find your public IP

**Linux:**

```bash
curl -4 ifconfig.me
# or
hostname -I
```

**Windows (PowerShell):**

```powershell
(Invoke-RestMethod -Uri https://api.ipify.org)
```

Also check your cloud panel (DigitalOcean, Hetzner, AWS, …) for the droplet/instance IP.

## Folder layout (recommended)

```text
/opt/neuro-connect/          # or C:\neuro-connect\
  neuro-server               # or neuro-server.exe
  server.toml
  data/
    neuro-server.db          # SQLite users, chat, game hosts
    uploads/                 # uploaded files
    updates/                 # self-hosted client update artifacts
```

## Configure `server.toml`

```toml
bind = "0.0.0.0:7420"
database_path = "data/neuro-server.db"
upload_dir = "data/uploads"
jwt_secret = "PASTE_A_LONG_RANDOM_SECRET_HERE"
token_ttl_hours = 168
max_upload_mb = 12
public_url = "http://YOUR_PUBLIC_IP:7420"
global_admin_username = "neuroowner"
global_admin_bootstrap_secret = "another-long-secret"
dev_mode = false
lan_discovery = false
lan_service_name = "Neuro Connect"
```

Notes:

- `bind = "0.0.0.0:7420"` listens on all interfaces (required for VPS).
- Set `dev_mode = false` on any public host.
- `lan_discovery` is for home LAN only; leave `false` on a VPS.
- Change both secrets before going live.

Generate a secret:

```bash
openssl rand -hex 32
```

## Linux (Ubuntu) — run as systemd service

1. Copy binary + config to `/opt/neuro-connect/`.
2. Create user and service:

```bash
sudo useradd --system --home /opt/neuro-connect --shell /usr/sbin/nologin neuro
sudo chown -R neuro:neuro /opt/neuro-connect
```

`/etc/systemd/system/neuro-connect.service`:

```ini
[Unit]
Description=Neuro Connect Server
After=network.target

[Service]
Type=simple
User=neuro
WorkingDirectory=/opt/neuro-connect
ExecStart=/opt/neuro-connect/neuro-server /opt/neuro-connect/server.toml
Restart=on-failure
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now neuro-connect
sudo systemctl status neuro-connect
journalctl -u neuro-connect -f
```

Open the firewall (see [FIREWALL.md](FIREWALL.md)):

```bash
sudo ufw allow 7420/tcp
sudo ufw reload
```

Test:

```bash
curl http://127.0.0.1:7420/health
curl http://YOUR_PUBLIC_IP:7420/health
```

## Windows Server — NSSM or Task Scheduler

1. Put `neuro-server.exe` + `server.toml` in `C:\neuro-connect\`.
2. Open Windows Firewall for TCP 7420 ([FIREWALL.md](FIREWALL.md)).
3. **NSSM** (recommended):

```bat
nssm install NeuroConnect "C:\neuro-connect\neuro-server.exe" "C:\neuro-connect\server.toml"
nssm set NeuroConnect AppDirectory C:\neuro-connect
nssm start NeuroConnect
```

Or **Task Scheduler**: create a task that runs at startup:

```text
Program: C:\neuro-connect\neuro-server.exe
Arguments: C:\neuro-connect\server.toml
Start in: C:\neuro-connect
```

## Connect clients

1. Distribute **Neuro Connect Beta** (selectable Server URL).
2. Users set Server URL to `http://YOUR_PUBLIC_IP:7420`.
3. Register accounts; claim Global Admin if bootstrap secret is set (Settings).

**Release** builds bake the URL at compile time — see [BUILD_RELEASE.md](BUILD_RELEASE.md).

## Logs and data

| Item | Location |
|------|----------|
| SQLite DB | `database_path` |
| Uploads | `upload_dir` |
| Client updates | `data/updates/...` |
| Linux logs | `journalctl -u neuro-connect` |
| Windows | console / NSSM log if configured |

Back up `data/` regularly (stop the service briefly for a consistent SQLite copy, or use `sqlite3 .backup`).

## HTTPS / domain (optional later)

A reverse proxy (Caddy/Nginx) can terminate TLS if you add a domain. Forward WebSockets for `/api/ws`. Not required for IP-only hosting.
