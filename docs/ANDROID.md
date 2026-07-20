# Android (Capacitor) — Neuro Connect

Neuro Connect’s Android MVP wraps the **web** client with Capacitor.

- App ID: `com.yetanotherneuron.neuroconnect`
- App name: Neuro Connect
- Web assets: `web/dist` (`webDir` in `web/capacitor.config.ts`)

Voice chat and Goldberg game hosting are **not** included in the Android MVP.

## Prerequisites

- Node.js 20+
- Android Studio (SDK + platform tools)
- JDK 17+ (bundled with recent Android Studio)

See [requirements/android.md](../requirements/android.md).

## Build & sync

From the repo root:

```bash
# Prefer the all-in-one helper (also copies APK into dist/)
scripts\build-android.bat

# Or manually:
npm install
npm run build:web
cd web
npx cap sync android
npm run build:android
```

`scripts\build-all.bat` runs Android as part of a full release (best-effort). If the SDK is missing, `build-android.ps1` can download command-line tools into `.tools\android-sdk` (gitignored).

If the native `android/` project is missing, generate it once:

```bash
cd web
npm run build
npx cap add android
npx cap sync android
```

## Open in Android Studio

```bash
cd web
npx cap open android
```

Then Run ▶ on an emulator or device.

## Install APK

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

Or from the generated project:

```bash
cd web/android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

On Windows PowerShell use `.\gradlew.bat assembleDebug`.

## Cleartext / LAN servers

Beta builds often talk to `http://…` LAN servers. If the WebView blocks cleartext HTTP, enable cleartext traffic in the Android app network security config (Android Studio) or use HTTPS / a tunnel for the server URL.

## Scripts

| Script | Where | What |
|--------|--------|------|
| `build:android` | `web/` or root (`-w neuro-connect-web`) | Build web + `cap sync android` |
| `cap:sync` | `web/` | `npx cap sync` (all platforms) |
| `cap:sync` | root | Same via workspace |
