# Neuro Connect

> **Disclaimer / warning:** This project is **not finished and not ready for real-world use**. Development has been interrupted by the ongoing war in my country. Neuro Connect was built as a **portfolio piece** to support applications to universities abroad — something that, due to sanctions, is currently not possible. Treat this repository as a demonstration of work and intent, not as production software.

Self-hosted, lightweight, privacy-first voice & text chat for friends. Discord-like experience with strong LAN/offline support, server-side media streaming, and low resource usage. Built with Tauri + Rust.

**Author:** [yetanotherneuron](https://github.com/yetanotherneuron) · Telegram: [@yetanotherneuron](https://t.me/yetanotherneuron)

## What’s in this repo

| Piece | Path | Status |
|-------|------|--------|
| Desktop client (Tauri 2 + React) | `apps/desktop` | MVP + voice |
| Community server (Rust / Axum + SQLite) | `apps/server` | MVP + voice + updates |
| Shared protocol crate | `crates/shared` | MVP |
| Official website (static) | `website` | Live |
| Web / mobile scaffold | `web` | Stub / TODO |
| Voice (WebRTC mesh / Opus) | desktop + server signaling | Live |
| Screen share + desktop audio | desktop + voice signaling | Live |
| Media URL relay | server + desktop | Live |
| Friends (requests / block / presence) | server + desktop | Live |
| Group DMs | server + desktop | Live |
| Message edit + reactions | server + desktop | Live |
| LAN mDNS + Game Host board | server + desktop | Live |
| Goldberg Steam LAN helper | desktop | Live (import release) |
| Goldberg Steam LAN helper | desktop | Live (import release) |
| Web / mobile scaffold | `web` | Stub / TODO |

## Quick start

1. Install dependencies - see [requirements/windows.md](requirements/windows.md) or [requirements/linux.md](requirements/linux.md).
2. Follow [docs/INSTALL.md](docs/INSTALL.md) to run the server and desktop app.
3. Configure with [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
4. Host a community with [docs/SERVER_SETUP.md](docs/SERVER_SETUP.md).

## Documentation

- [INSTALL.md](docs/INSTALL.md) - install & run (Windows + Linux)
- [CONFIGURATION.md](docs/CONFIGURATION.md) - client & server settings
- [SERVER_SETUP.md](docs/SERVER_SETUP.md) - hosting communities
- [VPS_HOSTING.md](docs/VPS_HOSTING.md) - public-IP VPS (no domain)
- [FIREWALL.md](docs/FIREWALL.md) - ufw / firewalld / Windows Firewall
- [VOICE.md](docs/VOICE.md) - voice rooms + screen share
- [GAME_HOSTING.md](docs/GAME_HOSTING.md) - LAN co-op + Goldberg room codes
- [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) - common errors
- [BUILD_RELEASE.md](docs/BUILD_RELEASE.md) - Beta/Release builds + self-hosted updates
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) - repo layout & local dev loop
- [scripts/README.md](scripts/README.md) - start/stop/build `.bat` / `.sh` helpers
- [LINUX_DIST.md](docs/LINUX_DIST.md) - AppImage / Linux packaging notes

## Contributing

- Format Rust with `cargo fmt`; format desktop TS with Prettier (`cd apps/desktop && npm run format`).
- Open PRs against `main` using the [pull request template](.github/pull_request_template.md).
- CI runs `cargo check` / `cargo test` and desktop `tsc` on Windows and Linux.

## Features (MVP)

- Username + Argon2 password (no email / phone); data stored in **SQLite** (`database_path`)
- Display names in any language (including Persian)
- Avatar & banner via external URLs
- Servers with predefined ranks (Owner, Admin, Moderator, Member)
- **Global Admin Mode** - one configurable account with instance-wide powers
- **Test / Dev Mode** - localhost seed users
- Text chat with Markdown, spoilers, code highlighting
- **Voice rooms** - WebRTC mesh (Opus), PTT / open mic, mute / deafen, move members
- **Screen share** - one sharer per voice channel; optional desktop audio when the OS picker provides it
- **LAN discovery** - mDNS find servers on your network
- **Game Host board** - share a **room code** for LAN / Steam-LAN (Goldberg) co-op
- **Goldberg helper** - import emu once, prepare game folder, auto `custom_broadcasts` on join
- **Friends** - requests, accept/decline, block, ignore, online presence
- File uploads up to 12 MB (paste links for larger files)
- DMs where either participant can delete messages
- **Beta builds** with selectable Server URL; **Release builds** locked to a baked VPS URL
- **Self-hosted auto-update** via the same neuro-server (not GitHub)
- Dark UI (black + purple accents)

## License

MIT - see [LICENSE](LICENSE).
