import { useEffect, useState, type ReactNode } from "react";
import { SettingsShell } from "@neuro-connect/ui";
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
import type {
  AdminUserInfo,
  ClientConfig,
  MemberInfo,
  Rank,
  ServerInfo,
  ServerMeta,
  UserPublic,
} from "../lib/types";
import { ProfileCard } from "./Avatar";
import { ConfirmDialog, PromptDialog } from "./Modal";
import { useToast } from "./Toast";
import "./SettingsView.css";

type SettingsSection = "user" | "voice" | "appearance" | "server" | "members" | "admin";

const SECTION_TITLES: Record<SettingsSection, string> = {
  user: "My Account",
  voice: "Voice & Video",
  appearance: "Appearance",
  server: "Server",
  members: "Members",
  admin: "Admin",
};

export function SettingsView({
  user,
  config,
  servers,
  activeServer,
  members,
  myRank,
  meta,
  onUser,
  onConfig,
  onServersRefresh,
  onMembersRefresh,
  onSetRank,
  onClose,
  onLogout,
}: {
  user: UserPublic;
  config: ClientConfig;
  servers: ServerInfo[];
  activeServer: ServerInfo | null;
  members: MemberInfo[];
  myRank?: Rank;
  meta: ServerMeta | null;
  onUser: (u: UserPublic) => void;
  onConfig?: (c: ClientConfig) => void;
  onServersRefresh: () => void;
  onMembersRefresh: () => Promise<void>;
  onSetRank: (member: MemberInfo, rank: Rank) => void;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { pushToast } = useToast();
  const [section, setSection] = useState<SettingsSection>("user");
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

  const canManageServer =
    myRank === "owner" || myRank === "admin" || Boolean(user.is_global_admin);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nav = (
    <>
      <span className="nc-settings-nav-label">User settings</span>
      <NavItem id="user" label="My Account" active={section} onSelect={setSection} />
      <NavItem id="voice" label="Voice & Video" active={section} onSelect={setSection} />
      <NavItem id="appearance" label="Appearance" active={section} onSelect={setSection} />
      {activeServer && (
        <>
          <span className="nc-settings-nav-label">Server settings</span>
          <NavItem id="server" label="Overview" active={section} onSelect={setSection} />
          <NavItem id="members" label="Members" active={section} onSelect={setSection} />
        </>
      )}
      <span className="nc-settings-nav-label">Admin</span>
      <NavItem id="admin" label="Admin" active={section} onSelect={setSection} />
    </>
  );

  let body: ReactNode = null;

  if (section === "user") {
    body = (
      <div className="settings-section-body">
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
            <input
              className="nc-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
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
          <h3>Session</h3>
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
        </div>
      </div>
    );
  } else if (section === "voice") {
    body = (
      <div className="settings-section-body">
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
            <input
              className="nc-input"
              value={hotkeyPtt}
              onChange={(e) => setHotkeyPtt(e.target.value)}
            />
          </label>
          <label>
            Mute hotkey
            <input
              className="nc-input"
              value={hotkeyMute}
              onChange={(e) => setHotkeyMute(e.target.value)}
            />
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
    );
  } else if (section === "appearance") {
    body = (
      <div className="settings-section-body">
        <p className="muted">Theme follows the Neuro Connect desktop palette.</p>
        <div className="settings-grid">
          <label>
            Server URL
            <input className="nc-input" value={config.server_url} readOnly />
          </label>
          {meta && (
            <label>
              Server version
              <input className="nc-input" value={meta.version} readOnly />
            </label>
          )}
        </div>
        {meta?.dev_mode && (
          <p className="admin-badge" style={{ marginTop: 12 }}>
            Dev mode enabled on server
          </p>
        )}
      </div>
    );
  } else if (section === "server") {
    body = (
      <div className="settings-section-body">
        {!activeServer ? (
          <p className="muted">Select a server to manage it.</p>
        ) : (
          <>
            <div className="settings-grid">
              <label>
                Name
                <input className="nc-input" value={activeServer.name} readOnly />
              </label>
              <label>
                Invite code
                <input className="nc-input" value={activeServer.invite_code} readOnly />
              </label>
              <label className="settings-span-2">
                Your rank
                <input className="nc-input" value={myRank || "—"} readOnly />
              </label>
            </div>
            {!canManageServer && (
              <p className="muted" style={{ marginTop: 12 }}>
                Only owners and admins can change server settings.
              </p>
            )}
          </>
        )}
      </div>
    );
  } else if (section === "members") {
    body = (
      <div className="settings-section-body">
        {!activeServer ? (
          <p className="muted">Select a server to manage members.</p>
        ) : (
          <>
            <div className="settings-section-actions">
              <button type="button" className="ghost sm" onClick={() => void onMembersRefresh()}>
                Refresh
              </button>
            </div>
            <ul className="admin-list">
              {members.map((m) => (
                <li key={m.user.id}>
                  <span>
                    {m.user.display_name}{" "}
                    <span className="muted">@{m.user.username}</span>{" "}
                    <span className="rank">{m.rank}</span>
                  </span>
                  {canManageServer &&
                    m.rank !== "owner" &&
                    m.user.id !== user.id && (
                      <select
                        className="nc-select"
                        value={m.rank}
                        onChange={(e) => onSetRank(m, e.target.value as Rank)}
                      >
                        <option value="admin">admin</option>
                        <option value="moderator">moderator</option>
                        <option value="member">member</option>
                      </select>
                    )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  } else if (section === "admin") {
    body = (
      <div className="settings-section-body">
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
            <div className="settings-section">
              <h3>Global Admin — users</h3>
              <button type="button" className="ghost sm" onClick={() => void loadAdmin()}>
                Refresh users
              </button>
              <ul className="admin-list">
                {adminUsers.map((a) => (
                  <li key={a.user.id}>
                    <button type="button" className="admin-user-btn" onClick={() => undefined}>
                      @{a.user.username} — {a.user.display_name}
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
            </div>

            <div className="settings-section">
              <h3>Global Admin — servers</h3>
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
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <SettingsShell nav={nav} title={SECTION_TITLES[section]} onClose={onClose}>
        {body}
      </SettingsShell>

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
    </>
  );
}

function NavItem({
  id,
  label,
  active,
  onSelect,
}: {
  id: SettingsSection;
  label: string;
  active: SettingsSection;
  onSelect: (id: SettingsSection) => void;
}) {
  return (
    <button
      type="button"
      className={`nc-settings-nav-item${active === id ? " active" : ""}`}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );
}
