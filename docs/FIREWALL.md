# Firewall guide

Neuro Connect needs **TCP 7420** (default) open between clients and the server. Voice uses WebRTC (UDP) peer-to-peer; STUN helps with NAT. LAN discovery uses **mDNS (UDP 5353)** on the local network only.

## What to open

| Traffic | Port | When |
|---------|------|------|
| HTTP API + WebSocket | TCP **7420** | Always (or your custom `bind` port) |
| mDNS discovery | UDP **5353** | Home LAN only (usually automatic on LAN) |
| WebRTC media | UDP (ephemeral) | Between clients; often works with STUN; hard NATs may need TURN |

## Ubuntu / Debian — ufw

```bash
sudo ufw allow OpenSSH
sudo ufw allow 7420/tcp
sudo ufw enable
sudo ufw status
```

Cloud providers often have a **separate** security group / firewall — open TCP 7420 there too.

## Fedora / RHEL — firewall-cmd

```bash
sudo firewall-cmd --permanent --add-port=7420/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports
```

## Windows Firewall

**PowerShell (Admin):**

```powershell
New-NetFirewallRule -DisplayName "Neuro Connect" -Direction Inbound -Protocol TCP -LocalPort 7420 -Action Allow
```

Or: Windows Defender Firewall → Advanced → Inbound Rules → New Rule → Port → TCP 7420 → Allow.

Also open **7420** in your router / cloud panel if the server is behind NAT.

## Home LAN

- Bind `0.0.0.0:7420` (not `127.0.0.1`) so other PCs can connect.
- Clients use `http://192.168.x.x:7420` or **Find on LAN** (Beta).
- mDNS must be allowed on the local subnet (most home routers allow it).

## Voice / NAT tips

- Same LAN: usually works with host candidates + STUN.
- Remote friends behind strict NAT: add a TURN server URL in client `ice_servers` (see [CONFIGURATION.md](CONFIGURATION.md)).
- Example:

```toml
ice_servers = ["turn:user:password@turn.example.com:3478"]
```

## Verify

From another machine:

```bash
curl http://SERVER_IP:7420/health
```

If this fails, the problem is almost always firewall, wrong bind, or wrong IP — not the desktop app.
