import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const channel = process.env.NEURO_CHANNEL || "beta";
const serverUrl = process.env.NEURO_SERVER_URL || "";
const appVersion = process.env.NEURO_APP_VERSION || "0.1.0";

if (channel === "release" && !serverUrl) {
  console.warn(
    "[neuro-connect] NEURO_CHANNEL=release but NEURO_SERVER_URL is empty — set it for production builds.",
  );
}

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    "import.meta.env.NEURO_CHANNEL": JSON.stringify(channel),
    "import.meta.env.NEURO_SERVER_URL": JSON.stringify(serverUrl),
    "import.meta.env.NEURO_APP_VERSION": JSON.stringify(appVersion),
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_", "NEURO_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
