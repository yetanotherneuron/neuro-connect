# Linux system requirements

## To run the AppImage (end users)

- 64-bit Linux (x86_64)
- FUSE (for many AppImage builds). On Debian/Ubuntu:

```bash
sudo apt update
sudo apt install libfuse2
```

On newer Ubuntu with AppImage issues, try `libfuse2t64` or extract with `--appimage-extract`.

- WebKitGTK / related libs are usually bundled inside the AppImage when built with Tauri. If a native `.deb` is used instead, install:

```bash
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1
```

(Package names vary by distro.)

## To host `neuro-server`

- glibc-based 64-bit Linux
- Open TCP port (default **7420**)
- Write access to `database_path` and `upload_dir`

## To build from source

```bash
# Debian / Ubuntu example
sudo apt update
sudo apt install build-essential curl wget file libssl-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf
```

Also install:

- Rust via https://rustup.rs/
- Node.js 20+ (NodeSource or nvm recommended)

### Verify

```bash
rustc --version
cargo --version
node --version
npm --version
pkg-config --exists webkit2gtk-4.1 && echo webkit ok
```
