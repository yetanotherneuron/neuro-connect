import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yetanotherneuron.neuroconnect",
  appName: "Neuro Connect",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
