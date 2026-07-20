import { useState } from "react";
import { browseLanServers, type LanPeer } from "../lib/native";
import "./AuthPage.css";

export function AuthPage({
  mode,
  onToggle,
  onSubmit,
  serverUrl,
  onServerUrl,
  busy,
  showDevHints = false,
  brandName = "Neuro Connect",
  showServerUrl = true,
}: {
  mode: "login" | "register";
  onToggle: () => void;
  onSubmit: (data: {
    username: string;
    password: string;
    displayName: string;
  }) => void;
  serverUrl: string;
  onServerUrl: (url: string) => void;
  busy: boolean;
  showDevHints?: boolean;
  brandName?: string;
  showServerUrl?: boolean;
}) {
  const [lanBusy, setLanBusy] = useState(false);
  const [lanPeers, setLanPeers] = useState<LanPeer[]>([]);
  const [lanError, setLanError] = useState<string | null>(null);

  async function findOnLan() {
    setLanBusy(true);
    setLanError(null);
    try {
      const peers = await browseLanServers(3000);
      setLanPeers(peers);
      if (peers.length === 0) {
        setLanError("No Neuro Connect servers found on this LAN.");
      }
    } catch (e) {
      setLanError(e instanceof Error ? e.message : "LAN browse failed");
    } finally {
      setLanBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-bg" />
      <form
        className="auth-card app-fade"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          onSubmit({
            username: String(fd.get("username") || ""),
            password: String(fd.get("password") || ""),
            displayName: String(fd.get("displayName") || ""),
          });
        }}
      >
        <div className="brand">
          <div className="brand-mark" />
          <h1>{brandName}</h1>
        </div>
        <p className="lead">
          Lightweight communities. Private by default. Works offline on your LAN.
        </p>

        {showDevHints && (
          <div className="dev-hint">
            Dev Mode seed account: <code>devuser</code> / <code>devpass12</code>
            <br />
            Or click Register to create a new username (English only).
          </div>
        )}

        {showServerUrl && (
          <>
            <label>
              Server URL
              <input
                className="nc-input"
                name="server"
                value={serverUrl}
                onChange={(e) => onServerUrl(e.target.value)}
                placeholder="http://127.0.0.1:7420"
              />
            </label>
            <div className="lan-find">
              <button
                type="button"
                className="ghost wide"
                disabled={lanBusy || busy}
                onClick={() => void findOnLan()}
              >
                {lanBusy ? "Searching LAN…" : "Find on LAN"}
              </button>
              {lanError && <p className="lan-error muted">{lanError}</p>}
              {lanPeers.length > 0 && (
                <ul className="lan-peer-list">
                  {lanPeers.map((p) => (
                    <li key={p.url}>
                      <button
                        type="button"
                        className="lan-peer"
                        onClick={() => onServerUrl(p.url)}
                      >
                        <strong>{p.name}</strong>
                        <span className="muted">{p.url}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        <label>
          Username
          <input
            className="nc-input"
            name="username"
            required
            autoComplete="username"
            placeholder="english_only"
            defaultValue={showDevHints ? "devuser" : undefined}
          />
        </label>
        {mode === "register" && (
          <label>
            Display name
            <input
              className="nc-input"
              name="displayName"
              required
              placeholder="نام نمایشی / any language"
            />
          </label>
        )}
        <label>
          Password
          <input
            className="nc-input"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            minLength={8}
            defaultValue={showDevHints ? "devpass12" : undefined}
          />
        </label>

        <button className="primary wide" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
        <button type="button" className="linkish" onClick={onToggle}>
          {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
        </button>
      </form>
    </div>
  );
}
