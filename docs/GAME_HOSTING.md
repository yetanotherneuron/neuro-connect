# Game hosting (LAN / IP co-op)

Neuro Connect includes a **Game Host board** so friends can share a game’s `IP:port` for co-op (inspired by classic “play over LAN/IP” workflows — not a Steam emulator).

## How it works

1. Someone hosts a game in LAN / IP mode (example: Stardew Valley multiplayer).
2. In Neuro Connect **Home → Game Hosts**, they post:
   - Game name
   - Address (`192.168.1.10:24642` or public IP:port)
   - Optional note
3. Friends click **Copy** and paste the address into the game’s join dialog.

Posts expire after 2 hours by default (max 24 hours via API).

## Find your LAN IP

The desktop app suggests an address using your machine’s preferred IPv4.

Or manually:

**Windows:** `ipconfig` → IPv4 Address  
**Linux:** `ip -4 addr` or `hostname -I`

## Tips

- Everyone must reach the host IP (same Wi‑Fi / VPN / port-forwarded public IP).
- Neuro Connect only **advertises** the address; game traffic stays between game clients.
- Scope a host to a community by posting while that server is selected (optional `server_id`).

## API (for scripts)

- `GET /api/game-hosts`
- `POST /api/game-hosts` — `{ "game_name", "address", "note?", "server_id?", "ttl_minutes?" }`
- `DELETE /api/game-hosts/{id}` — owner, Global Admin, or community moderator
