# Neuro Connect Web

Vite + React 19 browser client for Neuro Connect **0.4.0**.

Uses workspace packages `@neuro-connect/client-core` (API) and `@neuro-connect/ui` (shell / controls).

## Features (MVP)

- Login / register with configurable server URL (beta builds)
- Servers, text channels, DMs, friends
- List and send chat messages (WebSocket live updates)
- App shell (rail / sidebar / main) and settings (profile + logout)

Voice, Goldberg game hosting, and Tauri desktop features are **not** part of this web MVP.

## Develop

From the repo root:

```bash
npm install
npm run dev:web
```

Or inside `web/`:

```bash
npm run dev
```

Default Vite port: `5173`. Point the Server URL at your Neuro Connect backend (e.g. `http://127.0.0.1:7420`).

## Build

```bash
npm run build:web
```

## Android (Capacitor)

See [docs/ANDROID.md](../docs/ANDROID.md) and [requirements/android.md](../requirements/android.md).

```bash
npm run build:android -w neuro-connect-web
# or
cd web && npm run build:android
```
