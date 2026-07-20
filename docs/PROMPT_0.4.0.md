# Prompt archive — Neuro Connect 0.4.0

Product brief for the 0.4.0 UI rewrite and platform expansion (archived for history).

## Goals

- Recreate desktop UI (Spacebar/Stoat-class shell, Neuro theme tokens only)
- Fix IA: remove Stream from Friends; Share picker Apps \| Windows \| URL; Game Hosts under Home
- Settings shells (User / Voice / Appearance / Server / Members & ranks / Global Admin)
- Shared packages: `@neuro-connect/client-core`, `@neuro-connect/ui`
- Web client (non-stub); Android MVP via Capacitor wrapping web
- Linux AppImage + deb/rpm; macOS docs; version bump to 0.4.0
- Keep all Neuro-exclusive backend features

## Out of scope

- Copying Spacebar/Stoat source
- Abandoning Rust server / SQLite without migration plan
- Purple-glow AI chrome

See [FEATURE_MATRIX.md](FEATURE_MATRIX.md) for shipped status.
