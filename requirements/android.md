# Android requirements — Neuro Connect 0.4.0

## Goal

Ship a Capacitor Android MVP that loads the Neuro Connect web client (`web/`) against the same REST + WebSocket API as desktop.

## In scope

- Auth (login / register)
- Server URL (beta)
- Servers, channels, DMs, friends
- Text chat (list / send)
- Profile settings + logout
- APK install via Android Studio / Gradle

## Out of scope (MVP)

- Voice / WebRTC
- Goldberg / Steam game hosting
- Tauri / desktop-native features
- Push notifications, Play Store release pipeline

## Tooling

| Tool | Notes |
|------|--------|
| Node.js | 20+ recommended |
| npm workspaces | Root monorepo install |
| Android Studio | Latest stable; Android SDK 34+ recommended |
| JDK | 17+ |
| Capacitor | 7.x (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`) |

## Config

- `web/capacitor.config.ts`: `appId` `com.yetanotherneuron.neuroconnect`, `appName` Neuro Connect, `webDir` `dist`
- Build web first so `web/dist` exists before `cap sync`

## Workflow

1. `npm install` (repo root)
2. `npm run build:web`
3. `cd web && npx cap add android` (first time only, if `android/` missing)
4. `npm run cap:sync` or `npm run build:android`
5. `npx cap open android` → run on device/emulator
6. Optional: `./gradlew assembleDebug` for an APK

## Network

The app must reach the Neuro Connect server URL (LAN or public). Cleartext HTTP may need Android network security config for local beta servers.
