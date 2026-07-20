import { useEffect, useState } from "react";
import { ToastProvider, useToast } from "./components/Toast";
import { UpdateModal } from "./components/UpdateModal";
import {
  fetchLatestUpdate,
  fetchMeta,
  getAuthToken,
  loginUser,
  registerUser,
  setAuthToken,
  setBaseUrl,
} from "./lib/api";
import {
  getAppChannel,
  getAppVersion,
  getBakedServerUrl,
  loadClientConfig,
  loadSession,
  persistSession,
  saveServerUrl,
} from "./lib/native";
import type { ClientConfig, ServerMeta, UpdateManifest, UserPublic } from "./lib/types";
import { AuthPage } from "./pages/AuthPage";
import { MainShell } from "./pages/MainShell";
import "./pages/AuthPage.css";
import "./pages/MainShell.css";

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function AppInner() {
  const { pushToast } = useToast();
  const channel = getAppChannel();
  const bakedUrl = getBakedServerUrl();
  const isRelease = channel === "release";
  const brandName = isRelease ? "Neuro Connect" : "Neuro Connect Beta";

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<UserPublic | null>(null);
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [serverUrl, setServerUrl] = useState("http://127.0.0.1:7420");
  const [meta, setMeta] = useState<ServerMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [updateManifest, setUpdateManifest] = useState<UpdateManifest | null>(null);

  async function checkUpdates(base: string) {
    try {
      setBaseUrl(base);
      const latest = await fetchLatestUpdate(channel, "windows-x64");
      if (!latest) return;
      if (compareSemver(latest.version, getAppVersion()) > 0) {
        setUpdateManifest(latest);
      }
    } catch {
      /* offline / no updates */
    }
  }

  useEffect(() => {
    void (async () => {
      const cfg = await loadClientConfig();
      const url = isRelease && bakedUrl ? bakedUrl : cfg.server_url;
      setConfig(isRelease && bakedUrl ? { ...cfg, server_url: bakedUrl } : cfg);
      setServerUrl(url);
      setBaseUrl(url);
      try {
        setMeta(await fetchMeta());
      } catch {
        /* server may be offline at boot */
      }
      await checkUpdates(url);
      const session = await loadSession();
      if (session) {
        setAuthToken(session.token);
        try {
          setUser(JSON.parse(session.user_json) as UserPublic);
        } catch {
          /* ignore */
        }
      }
      setReady(true);
    })();
  }, []);

  async function handleAuth(data: {
    username: string;
    password: string;
    displayName: string;
  }) {
    setBusy(true);
    try {
      const url = isRelease && bakedUrl ? bakedUrl : serverUrl;
      setBaseUrl(url);
      if (!isRelease) {
        await saveServerUrl(url);
      }
      try {
        setMeta(await fetchMeta());
      } catch {
        /* ignore */
      }
      await checkUpdates(url);
      const res =
        mode === "login"
          ? await loginUser(data.username, data.password)
          : await registerUser(data.username, data.password, data.displayName);
      setAuthToken(res.token);
      await persistSession(res.token, JSON.stringify(res.user));
      setUser(res.user);
      setConfig((c) => (c ? { ...c, server_url: url } : c));
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "auth failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !config) {
    return <div className="auth-shell">Loading {brandName}…</div>;
  }

  const showDev = Boolean(meta?.dev_mode) && config.dev_mode_ui !== false;

  if (!user || !getAuthToken()) {
    return (
      <>
        {showDev && <div className="dev-banner">Dev Mode</div>}
        {updateManifest && (
          <UpdateModal manifest={updateManifest} onLater={() => setUpdateManifest(null)} />
        )}
        <AuthPage
          mode={mode}
          brandName={brandName}
          showServerUrl={!isRelease}
          onToggle={() => setMode((m) => (m === "login" ? "register" : "login"))}
          onSubmit={handleAuth}
          serverUrl={serverUrl}
          onServerUrl={setServerUrl}
          busy={busy}
          showDevHints={showDev}
        />
      </>
    );
  }

  return (
    <>
      {showDev && <div className="dev-banner">Dev Mode</div>}
      {updateManifest && (
        <UpdateModal manifest={updateManifest} onLater={() => setUpdateManifest(null)} />
      )}
      <MainShell
        user={user}
        config={config}
        meta={meta}
        onUser={setUser}
        onConfig={setConfig}
        onLogout={() => {
          setAuthToken(null);
          setUser(null);
        }}
      />
    </>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
