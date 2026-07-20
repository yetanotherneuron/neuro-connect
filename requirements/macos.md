# macOS requirements

- macOS 12+ recommended
- [Xcode Command Line Tools](https://developer.apple.com/xcode/resources/)
- [Rust](https://rustup.rs/) stable
- [Node.js](https://nodejs.org/) 20+
- Optional: Apple Developer ID for signed/notarized DMG distribution

Install frontend deps from the monorepo root or `apps/desktop`:

```bash
npm install
cd apps/desktop && npm run tauri build
```

Or use `./scripts/build-client.sh` (see [docs/MACOS.md](../docs/MACOS.md)).
