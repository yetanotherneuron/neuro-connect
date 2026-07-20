# Neuro Connect feature matrix (0.4.0)

| Area | Desktop | Web | Android | Server |
|------|---------|-----|---------|--------|
| Auth (username + Argon2) | Yes | Yes | Yes (via web) | Yes |
| Servers / channels / ranks | Yes | Yes | Yes | Yes |
| Text chat + Markdown | Yes | Yes | Yes | Yes |
| Message edit / delete / reactions | Yes | Partial | Partial | Yes |
| Message replies | Yes | Planned | Planned | Yes |
| DMs + group DMs | Yes | Yes | Yes | Yes |
| Friends / presence | Yes | Yes | Yes | Yes |
| Voice (WebRTC mesh) | Yes | Optional | No (MVP) | Signaling |
| Screen share (Apps \| Windows \| URL) | Yes | No | No | Media URL relay |
| Media URL relay | Yes (voice Share → URL) | No | No | Yes |
| Game Hosts + room codes | Yes (Home → Game Hosts) | Read-only later | No | Yes |
| Goldberg helper | Yes (desktop) | No | No | N/A |
| LAN mDNS | Yes | No | No | Yes |
| Global Admin / Dev Mode | Yes | Partial | Partial | Yes |
| Self-hosted updates | Yes | N/A | N/A | Yes |
| Beta / Release channels | Win/Linux/macOS scripts | Server URL field | Same as web | Updates API |

Packaging: Windows NSIS/MSI; Linux AppImage + deb/rpm; macOS DMG — see [BUILD_RELEASE.md](BUILD_RELEASE.md), [LINUX_DIST.md](LINUX_DIST.md), [MACOS.md](MACOS.md).
