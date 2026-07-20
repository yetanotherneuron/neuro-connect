import { useEffect, useState } from "react";
import {
  banUser,
  claimGlobalAdmin,
  deleteAdminServer,
  listAdminUsers,
  logoutUser,
  unbanUser,
  updateProfile,
} from "../lib/api";
import { saveVoiceSettings, wipeSession } from "../lib/native";
import type { AdminUserInfo, ClientConfig, ServerInfo, UserPublic } from "../lib/types";
import { ProfileCard } from "./Avatar";
import { ConfirmDialog, PromptDialog } from "./Modal";
import { useToast } from "./Toast";
import "./SettingsView.css";

export function SettingsView({
  user,
  config,
  servers,
  onUser,
  onConfig,
  onServersRefresh,
  onLogout,
}: {
  user: UserPublic;
  config: ClientConfig;
  servers: ServerInfo[];
  onUser: (u: UserPublic) => void;
  onConfig?: (c: ClientConfig) => void;
  onServersRefresh: () => void;
  onLogout: () => void;
}) {
  const { pushToast } = useToast();
  const [displayName, setDisplayName] = useState(user.display_name);
  const [avatar, setAvatar] = useState(user.avatar_url || "");
  const [banner, setBanner] = useState(user.banner_url || "");
  const [adminUsers, setAdminUsers] = useState<AdminUserInfo[]>([]);
  const [claimSecret, setClaimSecret] = useState("");
  const [pushToTalk, setPushToTalk] = useState(config.push_to_talk);
  const [hotkeyPtt, setHotkeyPtt] = useState(config.hotkey_push_to_talk);
  const [hotkeyMute, setHotkeyMute] = useState(config.hotkey_mute);
  const [hotkeyDeafen, setHotkeyDeafen] = useState(config.hotkey_deafen);
  const [voiceSounds, setVoiceSounds] = useState(config.voice_sounds);
  const [banTarget, setBanTarget] = useState<AdminUserInfo | null>(null);
  const [deleteServer, setDeleteServer] = useState<ServerInfo | null>(null);

  async function save() {
    try {
      const u = await updateProfile({
        display_name: displayName,
        avatar_url: avatar,
        banner_url: banner,
      });
      onUser(u);
      pushToast("Profile saved", "success");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "save failed", "error");
    }
  }

  async function loadAdmin() {
    try {
      setAdminUsers(await listAdminUsers());
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "admin list failed", "error");
    }
  }

  useEffect(() => {
    if (user.is_global_admin) void loadAdmin();
  }, [user.is_global_admin]);

  return (
    <div className="settings app-fade">
      <h2>Settings</h2>
      {user.is_global_admin && <p className="admin-badge">You are Global Admin</p>}
      <div className="settings-preview">
        <ProfileCard
          user={{
            ...user,
            display_name: displayName,
            avatar_url: avatar || null,
            banner_url: banner || null,
          }}
        />
      </div>
      <div className="settings-grid">
        <label>
          Display name
          <input className="nc-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          Avatar URL
          <input
            className="nc-input"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://… (empty = default)"
          />
        </label>
        <label className="settings-span-2">
          Banner URL
          <input
            className="nc-input"
            value={banner}
            onChange={(e) => setBanner(e.target.value)}
            placeholder="https://… (empty = default)"
          />
        </label>
        <div className="settings-span-2">
          <button type="button" className="primary" onClick={() => void save()}>
            Save profile
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>Claim Global Admin</h3>
        <p className="muted">
          Only needed when the server set <code>global_admin_bootstrap_secret</code>.
        </p>
        <div className="settings-grid">
          <label className="settings-span-2">
            Bootstrap secret
            <input
              className="nc-input"
              value={claimSecret}
              onChange={(e) => setClaimSecret(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="primary"
          onClick={async () => {
            try {
              const u = await claimGlobalAdmin(claimSecret);
              onUser(u);
              pushToast("Global Admin claimed", "success");
              void loadAdmin();
            } catch (e) {
              pushToast(e instanceof Error ? e.message : "claim failed", "error");
            }
          }}
        >
          Claim
        </button>

        {user.is_global_admin && (
          <>
            <h3>Global Admin - users</h3>
            <button type="button" className="ghost sm" onClick={() => void loadAdmin()}>
              Refresh users
            </button>
            <ul className="admin-list">
              {adminUsers.map((a) => (
                <li key={a.user.id}>
                  <button type="button" className="admin-user-btn" onClick={() => undefined}>
                    @{a.user.username} - {a.user.display_name}
                    {a.user.is_global_admin ? " [GA]" : ""}
                    {a.is_banned ? " [BANNED]" : ""}
                  </button>
                  {!a.user.is_global_admin && a.user.id !== user.id && (
                    <span className="admin-actions">
                      {a.is_banned ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await unbanUser(a.user.id);
                            void loadAdmin();
                          }}
                        >
                          Unban
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="danger-inline"
                          onClick={() => setBanTarget(a)}
                        >
                          Ban
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <h3>Global Admin - servers</h3>
            <ul className="admin-list">
              {servers.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.name} ({s.invite_code})
                  </span>
                  <button
                    type="button"
                    className="danger-inline"
                    onClick={() => setDeleteServer(s)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="settings-section">
        <h3>Voice</h3>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={pushToTalk}
            onChange={(e) => setPushToTalk(e.target.checked)}
          />
          Push to talk (unchecked = open mic)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={voiceSounds}
            onChange={(e) => setVoiceSounds(e.target.checked)}
          />
          Join / leave sounds
        </label>
        <div className="settings-grid">
          <label>
            Push to talk key
            <input className="nc-input" value={hotkeyPtt} onChange={(e) => setHotkeyPtt(e.target.value)} />
          </label>
          <label>
            Mute hotkey
            <input className="nc-input" value={hotkeyMute} onChange={(e) => setHotkeyMute(e.target.value)} />
          </label>
          <label>
            Deafen hotkey
            <input
              className="nc-input"
              value={hotkeyDeafen}
              onChange={(e) => setHotkeyDeafen(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="ghost"
          onClick={async () => {
            try {
              const next = await saveVoiceSettings({
                push_to_talk: pushToTalk,
                hotkey_push_to_talk: hotkeyPtt,
                hotkey_mute: hotkeyMute,
                hotkey_deafen: hotkeyDeafen,
                voice_sounds: voiceSounds,
              });
              onConfig?.(next);
              window.dispatchEvent(new CustomEvent("nc-voice-config", { detail: next }));
              pushToast("Voice settings saved", "success");
            } catch (e) {
              pushToast(e instanceof Error ? e.message : "save failed", "error");
            }
          }}
        >
          Save voice settings
        </button>
      </div>

      <button
        type="button"
        className="danger"
        onClick={async () => {
          try {
            await logoutUser();
          } catch {
            /* offline logout still clears local session */
          }
          await wipeSession();
          onLogout();
        }}
      >
        Log out
      </button>

      {banTarget && (
        <PromptDialog
          title="Ban user"
          label="Reason"
          defaultValue="banned by global admin"
          confirmLabel="Ban"
          onCancel={() => setBanTarget(null)}
          onConfirm={(reason) => {
            void banUser(banTarget.user.id, reason || "banned by global admin").then(() => {
              setBanTarget(null);
              void loadAdmin();
            });
          }}
        />
      )}

      {deleteServer && (
        <ConfirmDialog
          title="Delete server"
          message={`Permanently delete ${deleteServer.name}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleteServer(null)}
          onConfirm={() => {
            void deleteAdminServer(deleteServer.id).then(() => {
              setDeleteServer(null);
              onServersRefresh();
            });
          }}
        />
      )}
    </div>
  );
}
