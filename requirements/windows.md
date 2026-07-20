# Windows system requirements

## To run the app (end users)

- Windows 10 version 1809+ or Windows 11 (64-bit)
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)  
  Most Windows 11 PCs already have this. If the app window is blank, install the Evergreen Runtime.
- Microphone / speakers only needed when voice features ship

## To host `neuro-server`

- Any modern 64-bit Windows
- Outbound/inbound firewall rule for your chosen port (default **7420**) if others connect
- Disk space for SQLite DB + uploads

## To build from source

1. **Rust** - https://rustup.rs/ (`rustup default stable`)
2. **Node.js 20+** - https://nodejs.org/
3. **Visual Studio Build Tools** with “Desktop development with C++”
4. **WebView2** runtime
5. Optional: `cargo install tauri-cli --version "^2"`

### Verify

```powershell
rustc --version
cargo --version
node --version
npm --version
```
