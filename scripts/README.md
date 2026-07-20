# Helper scripts

Run these from anywhere; they `cd` to the repo root automatically.

## Windows

| Script | What it does |
|--------|----------------|
| `stop-server.bat` | Kill tray host + server core; free port 7420 |
| `start-server.bat` | Prefer `dist\Neuro Server*.exe` (tray), else core in this terminal |
| `build-server.bat` | Release-build server + host |
| `package-dist.bat [beta\|release]` | Fill `dist\` with friendly names + Linux script stubs |
| `build-client.bat [beta\|release] [serverUrl]` | Tauri client (NSIS + MSI), renamed for channel |
| `build-client.ps1 -Channel beta` | Same, PowerShell |
| `build-client.ps1 -Channel release -ServerUrl https://...` | Locked production client |
| `build-all.bat` | Server + client |
| `dev-client.bat` | Tauri dev mode (Beta channel / editable URL) |
| `start-client.bat` | Launch portable client from `dist\` |

## Typical test

1. `scripts\package-dist.bat beta` (once after changes)
2. `dist\Neuro Server Beta.exe` (or `Neuro Server.exe` for release packaging)
3. `dist\Neuro Connect Beta.exe`
4. Login `devuser` / `devpass12` (with `dev_mode = true`)

## Publish a client update on the VPS

```bash
neuro-server update publish --config server.toml --channel beta --platform windows-x64 --version 0.2.0 --file "Neuro Connect Beta Setup.exe" --notes "..."
```

## Linux

See `scripts/*.sh` and `docs/LINUX_DIST.md`. AppImage cannot be produced on Windows.
