import { useEffect, useState } from "react";
import {
  fetchMe,
  fetchMeta,
  getAuthToken,
  loginUser,
  registerUser,
  setAuthToken,
  setBaseUrl,
  type ServerMeta,
  type UserPublic,
} from "@neuro-connect/client-core";
import { AuthPage } from "./pages/AuthPage";
import { Shell } from "./pages/Shell";
import {
  loadServerUrl,
  loadSession,
  persistSession,
  saveServerUrl,
  wipeSession,
} from "./lib/session";
import "./styles/global.css";

function getChannel() {
  return import.meta.env.NEURO_CHANNEL || "beta";
}

function getBakedServerUrl() {
  return (import.meta.env.NEURO_SERVER_URL || "").trim();
}

export function App() {
  const channel = getChannel();
  const bakedUrl = getBakedServerUrl();
  const isRelease = channel === "release";
  const brandName = isRelease ? "Neuro Connect" : "Neuro Connect Beta";

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<UserPublic | null>(null);
  const [serverUrl, setServerUrl] = useState("http://127.0.0.1:7420");
  const [meta, setMeta] = useState<ServerMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const url = isRelease && bakedUrl ? bakedUrl : loadServerUrl(bakedUrl || undefined);
      setServerUrl(url);
      setBaseUrl(url);
      try {
        setMeta(await fetchMeta());
      } catch {
        /* server may be offline */
      }
      const session = loadSession();
      if (session) {
        setAuthToken(session.token);
        try {
          const cached = JSON.parse(session.userJson) as UserPublic;
          setUser(cached);
          try {
            setUser(await fetchMe());
          } catch {
            /* keep cached user if offline */
          }
        } catch {
          wipeSession();
          setAuthToken(null);
        }
      }
      setReady(true);
    })();
  }, [bakedUrl, isRelease]);

  useEffect(() => {
    const onExpired = () => {
      setAuthToken(null);
      setUser(null);
      wipeSession();
      setError("Session expired — please log in again");
    };
    window.addEventListener("nc-auth-expired", onExpired);
    return () => window.removeEventListener("nc-auth-expired", onExpired);
  }, []);

  async function handleAuth(data: {
    username: string;
    password: string;
    displayName: string;
  }) {
    setBusy(true);
    setError(null);
    try {
      const url = isRelease && bakedUrl ? bakedUrl : serverUrl;
      setBaseUrl(url);
      if (!isRelease) saveServerUrl(url);
      try {
        setMeta(await fetchMeta());
      } catch {
        /* ignore */
      }
      const res =
        mode === "login"
          ? await loginUser(data.username, data.password)
          : await registerUser(data.username, data.password, data.displayName);
      setAuthToken(res.token);
      persistSession(res.token, JSON.stringify(res.user));
      setUser(res.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <div className="web-auth">Loading {brandName}…</div>;
  }

  if (!user || !getAuthToken()) {
    return (
      <>
        {meta?.dev_mode && <div className="dev-banner">Dev Mode</div>}
        <AuthPage
          mode={mode}
          brandName={brandName}
          serverUrl={serverUrl}
          showServerUrl={!isRelease}
          busy={busy}
          error={error}
          onToggle={() => {
            setMode((m) => (m === "login" ? "register" : "login"));
            setError(null);
          }}
          onServerUrl={setServerUrl}
          onSubmit={handleAuth}
        />
      </>
    );
  }

  return (
    <>
      {meta?.dev_mode && <div className="dev-banner">Dev Mode</div>}
      <Shell
        user={user}
        onUser={(u) => {
          setUser(u);
          const token = getAuthToken();
          if (token) persistSession(token, JSON.stringify(u));
        }}
        onLogout={() => {
          setAuthToken(null);
          setUser(null);
          wipeSession();
        }}
      />
    </>
  );
}
