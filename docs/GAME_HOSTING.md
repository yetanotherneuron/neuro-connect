# Game hosting & Steam LAN (Goldberg)

Neuro Connect’s **Game Hosts** tab helps friends play together on LAN / VPN with a short **room code**.

There are two modes:

| Mode | When to use | What friends need |
|------|-------------|-------------------|
| **Steam LAN (Goldberg)** | Games that use Steamworks for LAN lobbies | Room code → Neuro applies host IP to Goldberg `custom_broadcasts` |
| **Direct IP:port** | Games with a normal join-by-IP dialog | Room code → copy `IP:port` into the game |

Neuro Connect does **not** ship Goldberg binaries (licensing / redistribution). You import a release once; the app automates the rest.

## Host flow (Steam LAN)

1. Download a **Goldberg Steam Emulator** release (contains `steam_api.dll` / `steam_api64.dll`).
2. Open **Home → Game Hosts → Steam LAN (Goldberg)**.
3. Click **Import Goldberg release** and select that folder (one-time).
4. Enter the game’s **Steam AppID** ([steamdb.info](https://steamdb.info)).
5. Click **Prepare game folder** → pick the game directory. Neuro:
   - backs up the original `steam_api(64).dll` as `*.neuro.bak`
   - installs the emulator DLL
   - writes `steam_settings/` (AppID, display name, listen port **47584**)
6. Start the game and create/host a lobby as usual.
7. Click **Host a room** — Neuro posts your LAN `IP:47584` and generates a **room code** (copied automatically).
8. Give friends the **room code** (e.g. `N7K2Q9`).

## Join flow

1. Open **Game Hosts**.
2. Paste the room code → **Join room**.
3. For Goldberg rooms, Neuro writes the host IP into:
   - `%AppData%\Goldberg SteamEmu Saves\settings\custom_broadcasts.txt`
   - the last prepared game’s `steam_settings\custom_broadcasts.txt`
4. Start your prepared game — you should see the host’s lobby on “LAN”.

If the game needs Steam rich-presence join (`+connect_lobby …`), the host can paste that into **Optional +connect_lobby** when posting; joiners get it copied.

## Direct IP games

Switch to **Direct IP:port**, set the real game port (suggestion uses `:24642` as a placeholder), host a room, share the code. Joiners get the address on the clipboard.

## Tips

- Everyone must reach the host IP (same Wi‑Fi, VPN, or port-forward).
- Goldberg peers must use the **same listen port** (default **47584**).
- Game traffic stays peer-to-peer; Neuro only advertises the room.
- Posts expire after 2 hours by default (API max 24h).

## API

- `GET /api/game-hosts`
- `GET /api/game-hosts/code/{code}` — resolve a room code
- `POST /api/game-hosts` — `{ "game_name", "address", "kind": "direct"|"goldberg", "app_id?", "connect_command?", "note?", "server_id?", "ttl_minutes?" }`
- `DELETE /api/game-hosts/{id}`

Response includes `room_code` — that is what users should share.
