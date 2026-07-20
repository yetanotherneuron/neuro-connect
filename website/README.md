# Neuro Connect website

Static marketing site for **Neuro Connect**. No build step — plain HTML, CSS, and minimal JS.

## Local preview

Open `index.html` in a browser, or serve the folder:

```bash
# Python
python -m http.server 8080 --directory .

# Node
npx serve .
```

## Configure downloads

Edit [`config.js`](config.js):

| Key | Purpose |
|-----|---------|
| `updateServerBase` | Your neuro-server URL (e.g. `http://YOUR_IP:7420`) for Direct download |
| `defaultChannel` | `beta` (recommended) or `release` |
| `githubReleasesUrl` | Fallback / secondary download link |

Direct download calls:

1. `GET {base}/api/updates/latest?channel=…&platform=…`
2. Then navigates to `GET {base}/api/updates/download/{channel}/{platform}/{filename}`

If `updateServerBase` is empty or the request fails, the page shows an error and users can use **GitHub Releases**.

## Deploy to GitHub Pages

This folder is designed to be copied into a separate repo named `neuro-connect.github.io`:

1. Create the Pages repo (org/user pages or project pages as you prefer).
2. Copy **everything inside** `website/` to the **root** of that repo (not nested under `website/`).
3. Set `updateServerBase` in `config.js` to your public update server.
4. Enable GitHub Pages from the `main` branch, site root `/`.

## Screenshots

Placeholder SVGs live in `assets/screenshots/`. Replace with real captures:

- `chat.svg` → `chat.png` (update `index.html` `src` if you change names)
- `voice.svg` → `voice.png`

## Design

Colors and typography match the desktop app (Outfit, black + purple, `#7c3aed` accent).
