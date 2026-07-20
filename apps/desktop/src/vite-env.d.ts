/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEURO_CHANNEL: string;
  readonly NEURO_SERVER_URL: string;
  readonly NEURO_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
