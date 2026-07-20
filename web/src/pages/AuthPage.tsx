import { useState, type FormEvent } from "react";
import { Button, Input } from "@neuro-connect/ui";

export function AuthPage({
  mode,
  brandName,
  serverUrl,
  showServerUrl,
  busy,
  error,
  onToggle,
  onServerUrl,
  onSubmit,
}: {
  mode: "login" | "register";
  brandName: string;
  serverUrl: string;
  showServerUrl: boolean;
  busy: boolean;
  error: string | null;
  onToggle: () => void;
  onServerUrl: (url: string) => void;
  onSubmit: (data: {
    username: string;
    password: string;
    displayName: string;
  }) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ username, password, displayName });
  }

  return (
    <div className="web-auth">
      <div className="web-auth__bg" />
      <form className="web-auth__card app-fade" onSubmit={handleSubmit}>
        <div className="web-auth__brand">
          <div className="web-auth__mark" aria-hidden />
          <h1>{brandName}</h1>
        </div>
        <p className="web-auth__lead">
          Chat on the web or Android. Connect to your Neuro Connect server.
        </p>

        {showServerUrl && (
          <label>
            Server URL
            <Input
              value={serverUrl}
              onChange={(e) => onServerUrl(e.target.value)}
              placeholder="http://127.0.0.1:7420"
              autoComplete="url"
            />
          </label>
        )}

        <label>
          Username
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            placeholder="english_only"
          />
        </label>

        {mode === "register" && (
          <label>
            Display name
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              placeholder="Display name"
            />
          </label>
        )}

        <label>
          Password
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>

        {error && <p className="web-auth__error">{error}</p>}

        <Button type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </Button>

        <button type="button" className="web-auth__toggle" onClick={onToggle}>
          {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
        </button>

        <p className="web-auth__note">
          Voice, Goldberg game hosting, and Tauri desktop features are not in this web MVP.
        </p>
      </form>
    </div>
  );
}
