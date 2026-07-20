import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const channel = process.env.NEURO_CHANNEL || "beta";
const serverUrl = process.env.NEURO_SERVER_URL || "";
const appVersion = process.env.NEURO_APP_VERSION || "0.4.0";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@neuro-connect/client-core": path.resolve(__dirname, "../packages/client-core/src"),
      "@neuro-connect/ui": path.resolve(__dirname, "../packages/ui/src"),
    },
  },
  define: {
    "import.meta.env.NEURO_CHANNEL": JSON.stringify(channel),
    "import.meta.env.NEURO_SERVER_URL": JSON.stringify(serverUrl),
    "import.meta.env.NEURO_APP_VERSION": JSON.stringify(appVersion),
  },
  server: { port: 5173 },
  envPrefix: ["VITE_", "NEURO_"],
  build: {
    target: "esnext",
    outDir: "dist",
  },
});
