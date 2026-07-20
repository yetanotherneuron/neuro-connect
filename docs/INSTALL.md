# Installing Neuro Connect

This guide is written for beginners. Follow the section for your operating system.

## What you will run

1. **neuro-server** - the community backend (someone must host this).
2. **Neuro Connect** desktop app - the client you chat with.

You can run both on the same computer for testing.

---

## Windows

### 1. System requirements

See [requirements/windows.md](../requirements/windows.md).

You need:

- Windows 10 or 11
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (usually already installed)
- For building from source: Rust, Node.js 20+, Visual Studio Build Tools

### 2. Run a prebuilt release (easiest)

1. Download the latest release from GitHub Releases.
2. Either:
   - Run the **installer** (`.msi` / NSIS `.exe`), or
   - Unzip the **portable** zip and run `Neuro Connect.exe`.
3. Download `neuro-server-windows.zip`, extract it, copy `configs/server.example.toml` to `server.toml`, edit the JWT secret, then run:

```powershell
.\neuro-server.exe server.toml
```

4. Open the desktop app, set **Server URL** to `http://127.0.0.1:7420` (or the host’s LAN IP), and register.

### 3. Run from source

```powershell
# From the repo root
copy configs\server.example.toml server.toml
cargo run -p neuro-server -- server.toml
```

In another terminal:

```powershell
cd apps\desktop
npm install
npm run tauri dev
```

---

## Linux

### 1. System requirements

See [requirements/linux.md](../requirements/linux.md).

### 2. AppImage (recommended)

1. Download `Neuro-Connect-x86_64.AppImage` and make it executable:

```bash
chmod +x Neuro-Connect-x86_64.AppImage
```

2. Or use the launcher script from this repo:

```bash
./scripts/neuro-connect.sh /path/to/Neuro-Connect-x86_64.AppImage
```

3. Run the server binary (or build with Cargo), pointing at a config:

```bash
cp configs/server.example.toml server.toml
./neuro-server server.toml
```

### 3. From source

```bash
cp configs/server.example.toml server.toml
cargo run -p neuro-server -- server.toml
```

```bash
cd apps/desktop
npm install
npm run tauri dev
```

---

## First login tips

- **Username** - English letters, numbers, underscore only (starts with a letter).
- **Display name** - any language, including Persian.
- **Avatar / banner** - prefer a public image URL (keeps the server small).

Next: [CONFIGURATION.md](CONFIGURATION.md) · [SERVER_SETUP.md](SERVER_SETUP.md)
