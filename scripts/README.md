# Helper scripts

Run these from anywhere; they `cd` to the repo root automatically.

## Windows

| Script | What it does |
|--------|----------------|
| `stop-server.bat` | Kill tray host + server core; free port 7420 |
| `start-server.bat` | Prefer `dist\Neuro Server*.exe` (tray), else core in this terminal |
| `build-server.bat` | Release-build server + host |
| `package-dist.bat [beta\|release]` | Fill `dist\` with friendly names + Linux script stubs |
| `build-client.bat [beta\|release] [serverUrl]` | Tauri client (NSIS + MSI), copied into `dist\` |
| `build-android.bat` | Web + Capacitor + Gradle APK → `dist\` / `dist\android\` |
| `build-appimage.bat` | AppImage via WSL or Docker (not native Windows) |
| `build-all.bat` | Server + Windows client + Android APK + AppImage (best effort) |
| `build-all.ps1 -SkipAndroid -SkipLinux` | Windows-only full build |
| `dev-client.bat` | Tauri dev mode (Beta channel / editable URL) |
| `start-client.bat` | Launch portable client from `dist\` |

## Typical test

1. `scripts\build-all.bat` (or `build-all.ps1 -SkipLinux` if you only need Win + APK)
2. `dist\Neuro Server Beta.exe`
3. `dist\Neuro Connect Beta.exe` / Setup / MSI
4. `dist\Neuro-Connect-Beta-0.4.0.apk` when Android SDK is available
5. AppImage only when WSL/Docker/Linux is available (`dist\*.AppImage`)

## Publish a client update on the VPS

```bash
neuro-server update publish --config server.toml --channel beta --platform windows-x64 --version 0.4.0 --file "Neuro Connect Beta Setup.exe" --notes "..."
```

## Linux / macOS

| Script | What it does |
|--------|----------------|
| `build-client.sh` | Tauri client with Beta/Release env; copies AppImage, deb, rpm, dmg into `dist/` |
| `build-appimage.sh` | AppImage-focused helper |
| `build-server.sh` | Release-build `neuro-server` |
| `build-all.sh` | Server + Linux client + Android when SDK present |

See `docs/LINUX_DIST.md` and `docs/MACOS.md`. AppImage / DMG must be produced on the matching OS (or WSL/Docker on Windows).
