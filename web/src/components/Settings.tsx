import { useState } from "react";
import { Button, Input, SettingsShell } from "@neuro-connect/ui";
import { logoutUser, updateProfile, type UserPublic } from "@neuro-connect/client-core";
import { wipeSession } from "../lib/session";
import "./Settings.css";

export function Settings({
  user,
  onUser,
  onClose,
  onLogout,
}: {
  user: UserPublic;
  onUser: (u: UserPublic) => void;
  onClose: () => void;
  onLogout: () => void;
}) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [avatar, setAvatar] = useState(user.avatar_url || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateProfile({
        display_name: displayName.trim() || user.display_name,
        avatar_url: avatar.trim() || undefined,
      });
      onUser(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await logoutUser();
    } catch {
      /* still clear local session */
    }
    wipeSession();
    onLogout();
  }

  return (
    <SettingsShell
      title="Settings"
      onClose={onClose}
      nav={
        <button type="button" className="nc-settings-nav-item active">
          My Account
        </button>
      }
    >
      <div className="web-settings">
        <p className="muted">
          Signed in as <strong>@{user.username}</strong>
        </p>
        <label>
          Display name
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          Avatar URL
          <Input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://…"
          />
        </label>
        {error && <p className="web-settings__error">{error}</p>}
        {saved && <p className="web-settings__ok">Profile saved.</p>}
        <div className="web-settings__actions">
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
          <Button variant="danger" onClick={() => void handleLogout()}>
            Log out
          </Button>
        </div>
        <p className="muted web-settings__note">
          Web / Android MVP — voice and Goldberg are desktop-only for now.
        </p>
      </div>
    </SettingsShell>
  );
}
