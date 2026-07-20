import { invoke } from "@tauri-apps/api/core";
import type { ClientConfig } from "./types";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function loadClientConfig(): Promise<ClientConfig> {
  if (!isTauri()) {
    return {
      server_url: localStorage.getItem("nc_server") || "http://127.0.0.1:7420",
      push_to_talk: true,
      hotkey_push_to_talk: "V",
      hotkey_mute: "Ctrl+Shift+M",
      hotkey_deafen: "Ctrl+Shift+D",
      voice_sounds: true,
      ice_servers: [],
      dev_mode_ui: true,
    };
  }
  return invoke<ClientConfig>("get_config");
}

export async function saveServerUrl(url: string) {
  if (!isTauri()) {
    localStorage.setItem("nc_server", url);
    return;
  }
  await invoke("set_server_url", { url });
}

export async function loadSession(): Promise<{ token: string; user_json: string } | null> {
  if (!isTauri()) {
    const token = localStorage.getItem("nc_token");
    const user_json = localStorage.getItem("nc_user");
    if (token && user_json) return { token, user_json };
    return null;
  }
  return invoke("get_session");
}

export async function persistSession(token: string, user_json: string) {
  if (!isTauri()) {
    localStorage.setItem("nc_token", token);
    localStorage.setItem("nc_user", user_json);
    return;
  }
  await invoke("save_session", { token, userJson: user_json });
}

export async function wipeSession() {
  if (!isTauri()) {
    localStorage.removeItem("nc_token");
    localStorage.removeItem("nc_user");
    return;
  }
  await invoke("clear_session");
}

export async function saveVoiceSettings(partial: {
  push_to_talk: boolean;
  hotkey_push_to_talk: string;
  hotkey_mute: string;
  hotkey_deafen: string;
  voice_sounds: boolean;
}): Promise<ClientConfig> {
  if (!isTauri()) {
    const cfg = await loadClientConfig();
    const next = { ...cfg, ...partial };
    localStorage.setItem("nc_voice", JSON.stringify(partial));
    return next;
  }
  return invoke<ClientConfig>("set_voice_settings", { settings: partial });
}

export async function voiceStubStatus() {
  if (!isTauri()) return { ready: true, note: "browser webrtc" };
  return invoke("voice_stub_status");
}

export async function lanStubStatus() {
  if (!isTauri()) return { ready: false, note: "browser mode" };
  return invoke("lan_stub_status");
}

export type LanPeer = {
  name: string;
  host: string;
  port: number;
  url: string;
};

export async function browseLanServers(timeoutMs = 2500): Promise<LanPeer[]> {
  if (!isTauri()) return [];
  return invoke<LanPeer[]>("browse_lan_servers", { timeoutMs });
}

export async function localIpv4(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>("local_ipv4");
  } catch {
    return null;
  }
}

export type GoldbergStatus = {
  ready: boolean;
  has_x86: boolean;
  has_x64: boolean;
  assets_dir: string;
  note: string;
};

export type PreparedGame = {
  game_dir: string;
  dll_path: string;
  arch: string;
  app_id: string;
  listen_port: number;
  backed_up: boolean;
};

export async function goldbergStatus(): Promise<GoldbergStatus> {
  if (!isTauri()) {
    return {
      ready: false,
      has_x86: false,
      has_x64: false,
      assets_dir: "",
      note: "Goldberg prep requires the desktop app",
    };
  }
  return invoke<GoldbergStatus>("goldberg_status");
}

export async function goldbergImportAssets(): Promise<GoldbergStatus> {
  if (!isTauri()) throw new Error("desktop app required");
  return invoke<GoldbergStatus>("goldberg_import_assets");
}

export async function goldbergPrepareGame(
  appId: string,
  accountName: string,
  listenPort?: number,
): Promise<PreparedGame> {
  if (!isTauri()) throw new Error("desktop app required");
  return invoke<PreparedGame>("goldberg_prepare_game", {
    appId,
    accountName,
    listenPort: listenPort ?? null,
  });
}

export async function goldbergApplyBroadcasts(ips: string[]): Promise<{ ok: boolean; ips: string[] }> {
  if (!isTauri()) throw new Error("desktop app required");
  return invoke("goldberg_apply_broadcasts", { ips });
}

export const GOLDBERG_DEFAULT_PORT = 47584;

export async function downloadAndApplyUpdate(url: string, sha256: string, filename: string) {
  if (!isTauri()) {
    window.open(url, "_blank");
    return { ok: true, mode: "browser" };
  }
  return invoke<{ ok: boolean; mode: string }>("apply_update", { url, sha256, filename });
}

export function getAppChannel(): "release" | "beta" {
  const ch = (import.meta as ImportMeta & { env: Record<string, string> }).env.NEURO_CHANNEL;
  return ch === "release" ? "release" : "beta";
}

export function getBakedServerUrl(): string | null {
  const url = (import.meta as ImportMeta & { env: Record<string, string> }).env.NEURO_SERVER_URL;
  return url && url.length > 0 ? url.replace(/\/$/, "") : null;
}

export function getAppVersion(): string {
  return (
    (import.meta as ImportMeta & { env: Record<string, string> }).env.NEURO_APP_VERSION || "0.2.0"
  );
}
