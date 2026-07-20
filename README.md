# Neuro Connect

> **Disclaimer / warning:** This project is **not finished and not ready for real-world use**. Development has been interrupted by the ongoing war in my country. Neuro Connect was built as a **portfolio piece** to support applications to universities abroad — something that, due to sanctions, is currently not possible. Treat this repository as a demonstration of work and intent, not as production software.

Self-hosted, lightweight, privacy-first voice & text chat for friends. Discord-like experience with strong LAN/offline support, server-side media streaming, and low resource usage. Built with Tauri + Rust.

**Author:** [yetanotherneuron](https://github.com/yetanotherneuron) · Telegram: [@yetanotherneuron](https://t.me/yetanotherneuron)

## What’s in this repo

| Piece | Path | Status |
|-------|------|--------|
| Desktop client (Tauri 2 + React) | `apps/desktop` | **0.4.0** UI rewrite |
| Shared client API + UI packages | `packages/client-core`, `packages/ui` | Live |
| Community server (Rust / Axum + SQLite) | `apps/server` | MVP + voice + updates + replies |
| Shared protocol crate | `crates/shared` | MVP |
| Official website (static) | `website` | Live |
| Web client | `web` | Auth + text MVP |
| Android (Capacitor) | `web` + Capacitor | MVP (auth/text/DMs) |
| Voice (WebRTC mesh / Opus) | desktop + server signaling | Live |
| Screen share + desktop audio | desktop + Share Apps\|Windows\|URL | Live |
| Media URL relay | server + voice Share → URL | Live |
| Friends (requests / block / presence) | server + clients | Live |
| Group DMs | server + clients | Live |
| Message edit + reactions + replies | server + desktop | Live |
| Emoji picker + unread + message search | desktop + server | Live |
| LAN mDNS + Game Host board | server + desktop (Home → Game Hosts) | Live |
| Goldberg Steam LAN helper | desktop | Live (import release) |

## Quick start

1. Install dependencies - see [requirements/windows.md](requirements/windows.md) or [requirements/linux.md](requirements/linux.md).
2. Follow [docs/INSTALL.md](docs/INSTALL.md) to run the server and desktop app.
3. Configure with [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
4. Host a community with [docs/SERVER_SETUP.md](docs/SERVER_SETUP.md).

## Documentation

- [FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) - desktop / web / Android capability matrix
- [MACOS.md](docs/MACOS.md) - macOS desktop builds
- [ANDROID.md](docs/ANDROID.md) - Capacitor Android MVP
- [LINUX_DIST.md](docs/LINUX_DIST.md) - AppImage / deb / rpm packaging notes
- [BUILD_RELEASE.md](docs/BUILD_RELEASE.md) - Beta/Release builds + self-hosted updates
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) - repo layout & local dev loop
- [scripts/README.md](scripts/README.md) - start/stop/build `.bat` / `.sh` helpers
- [PROMPT_0.4.0.md](docs/PROMPT_0.4.0.md) - 0.4.0 product brief archive

## Contributing

- Format Rust with `cargo fmt`; format desktop TS with Prettier (`cd apps/desktop && npm run format`).
- Open PRs against `main` using the [pull request template](.github/pull_request_template.md).
- CI runs `cargo check` / `cargo test` and desktop `tsc` on Windows and Linux.

## Features (0.4.0)

- Username + Argon2 password (no email / phone); data stored in **SQLite** (`database_path`)
- Display names in any language (including Persian)
- Avatar & banner via external URLs
- Servers with predefined ranks (Owner, Admin, Moderator, Member)
- **Global Admin Mode** - one configurable account with instance-wide powers
- **Test / Dev Mode** - localhost seed users
- Text chat with Markdown, spoilers, code highlighting, **replies**
- **Voice rooms** - WebRTC mesh (Opus), PTT / open mic, mute / deafen, move members
- **Screen share** - Apps \| Windows \| **URL** (media relay) from the voice Share picker
- **LAN discovery** - mDNS find servers on your network
- **Game Host board** - Home → Game Hosts; room codes for LAN / Steam-LAN (Goldberg)
- **Goldberg helper** - import emu once, prepare game folder, auto `custom_broadcasts` on join
- **Friends** - requests, accept/decline, block, ignore, online presence (no Stream tab)
- Message edit, reactions, emoji picker, unread, search
- File uploads up to 12 MB (paste links for larger files)
- DMs where either participant can delete messages
- **Beta builds** with selectable Server URL; **Release builds** locked to a baked VPS URL
- **Self-hosted auto-update** via the same neuro-server (not GitHub)
- Dark UI (black + purple accents); Spacebar/Stoat-class shell in 0.4.0
- Shared `@neuro-connect/client-core` + `@neuro-connect/ui` for desktop and web

## License

MIT - see [LICENSE](LICENSE).
