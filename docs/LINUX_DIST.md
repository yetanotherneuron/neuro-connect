# Linux distribution builds

Neuro Connect desktop packaging on Linux uses [Tauri 2](https://v2.tauri.app/) bundle targets.

## Artifacts

| Format | Path (after build) | Notes |
|--------|-------------------|--------|
| AppImage | `dist/*.AppImage` | Preferred portable binary — **build on Linux** |
| Debian `.deb` | `dist/linux/*.deb` | When `bundle.targets` includes `deb` |
| RPM `.rpm` | `dist/linux/*.rpm` | When `bundle.targets` includes `rpm` |
| Raw binary | `dist/neuro-connect` | Unbundled release binary |

Windows `build-all.bat` / `build-client.ps1` produce **NSIS + MSI + portable exe** into `dist\`.

Cross-platform extras from `build-all`:
- **APK** via `scripts\build-android.bat` (needs Android SDK or auto-bootstrap into `.tools\android-sdk`)
- **AppImage** via `scripts\build-appimage.bat` (needs **WSL**, **Docker**, or a Linux host — not produced by native Windows Tauri)

If AppImage/APK cannot be built, `dist\CROSS_PLATFORM_MISSING.txt` explains why.

Build on a Linux host (or CI `ubuntu-latest`):

```bash
# Beta (selectable server URL at login)
NEURO_CHANNEL=beta ./scripts/build-client.sh

# Release (baked server URL)
NEURO_CHANNEL=release NEURO_SERVER_URL=https://chat.example.com ./scripts/build-client.sh
```

Optional AppImage-only helper: `./scripts/build-appimage.sh`.

## Dependencies

See [requirements/linux.md](../requirements/linux.md). For `.deb` / `.rpm` you need the usual Tauri Linux deps plus packaging tools (`dpkg`, `rpm-build` as appropriate).

## Channels

Same as Windows: **Beta** allows choosing the server URL; **Release** bakes `NEURO_SERVER_URL` into the client. Self-hosted updates use `/api/updates` with `platform` values such as `linux-x64`.

## Notes

- AppImage builds must run on Linux; Windows `package-dist` only copies launcher script stubs into `dist/linux/`.
- Tray / autostart for Linux remain optional follow-ups.
