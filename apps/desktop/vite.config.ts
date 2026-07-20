import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const channel = process.env.NEURO_CHANNEL || "beta";
const serverUrl = process.env.NEURO_SERVER_URL || "";
const appVersion = process.env.NEURO_APP_VERSION || "0.4.0";

if (channel === "release" && !serverUrl) {
  console.warn(
    "[neuro-connect] NEURO_CHANNEL=release but NEURO_SERVER_URL is empty — set it for production builds.",
  );
}

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@neuro-connect/client-core": path.resolve(__dirname, "../../packages/client-core/src"),
      "@neuro-connect/ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
  define: {
    "import.meta.env.NEURO_CHANNEL": JSON.stringify(channel),
    "import.meta.env.NEURO_SERVER_URL": JSON.stringify(serverUrl),
    "import.meta.env.NEURO_APP_VERSION": JSON.stringify(appVersion),
  },
  server: {
    port: 1420,
    strictPort: true,
    // Tauri WebView uses IPv4; Vite otherwise may bind [::1] only on Windows.
    host: "127.0.0.1",
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      port: 1420,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_", "NEURO_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
