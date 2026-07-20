import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  GOLDBERG_DEFAULT_PORT,
  goldbergApplyBroadcasts,
  goldbergImportAssets,
  goldbergPrepareGame,
  goldbergStatus,
  localIpv4,
  type GoldbergStatus,
} from "../lib/native";
import {
  acceptFriendRequest,
  blockUser,
  createGameHost,
  declineFriendRequest,
  deleteGameHost,
  ignoreUser,
  lookupGameHostCode,
  removeFriend,
  sendFriendRequest,
  unblockUser,
  unignoreUser,
} from "../lib/api";
import type {
  FriendEntry,
  FriendRequestInfo,
  FriendsSnapshot,
  GameHostInfo,
  MediaRelayInfo,
  UserPublic,
} from "../lib/types";
import { AvatarImage } from "./Avatar";
import { MediaRelayBar } from "./MediaRelayBar";
import { useToast } from "./Toast";
import "./FriendsHome.css";

export type FriendsTab =
  | "online"
  | "all"
  | "pending"
  | "blocked"
  | "add"
  | "stream"
  | "hosts";

const TABS: { id: FriendsTab; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "blocked", label: "Blocked" },
  { id: "add", label: "Add Friend" },
  { id: "stream", label: "Stream" },
  { id: "hosts", label: "Game Hosts" },
];

function hostIp(address: string): string {
  return address.split(":")[0]?.trim() || address.trim();
}

export function FriendsHome({
  friends,
  friendsSnap,
  gameHosts,
  mediaRelay,
  localUserId,
  localDisplayName,
  activeServerId,
  canModerate,
  onRefreshFriends,
  onOpenProfile,
  onOpenDm,
  onRelayChange,
  onGameHostsChange,
}: {
  friends: FriendEntry[];
  friendsSnap: FriendsSnapshot | null;
  gameHosts: GameHostInfo[];
  mediaRelay: MediaRelayInfo | null;
  localUserId: string;
  localDisplayName: string;
  activeServerId?: string | null;
  canModerate: boolean;
  onRefreshFriends: () => Promise<void>;
  onOpenProfile: (u: UserPublic) => void;
  onOpenDm: (u: UserPublic) => void;
  onRelayChange: (r: MediaRelayInfo | null) => void;
  onGameHostsChange: (hosts: GameHostInfo[]) => void;
}) {
  const [tab, setTab] = useState<FriendsTab>("online");
  const [friendUsername, setFriendUsername] = useState("");
  const [hostMode, setHostMode] = useState<"direct" | "goldberg">("goldberg");
  const [gameForm, setGameForm] = useState({
    game_name: "",
    address: "",
    note: "",
    app_id: "",
    connect_command: "",
  });
  const [joinCode, setJoinCode] = useState("");
  const [lastPostedCode, setLastPostedCode] = useState<string | null>(null);
  const [gb, setGb] = useState<GoldbergStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const { pushToast } = useToast();

  useEffect(() => {
    void localIpv4().then((ip) => {
      if (!ip) return;
      setGameForm((f) => {
        const port = hostMode === "goldberg" ? GOLDBERG_DEFAULT_PORT : 24642;
        if (!f.address) return { ...f, address: `${ip}:${port}` };
        return f;
      });
    });
  }, []);

  useEffect(() => {
    void localIpv4().then((ip) => {
      if (!ip) return;
      setGameForm((f) => {
        const port = hostMode === "goldberg" ? GOLDBERG_DEFAULT_PORT : 24642;
        const curIp = hostIp(f.address);
        if (!f.address || curIp === ip) {
          return { ...f, address: `${ip}:${port}` };
        }
        return f;
      });
    });
  }, [hostMode]);

  useEffect(() => {
    if (tab !== "hosts") return;
    void goldbergStatus()
      .then(setGb)
      .catch(() => setGb(null));
  }, [tab]);

  const online = useMemo(() => friends.filter((f) => f.online), [friends]);
  const pendingCount =
    (friendsSnap?.incoming.length || 0) + (friendsSnap?.outgoing.length || 0);

  async function run(action: () => Promise<void>, ok?: string) {
    try {
      await action();
      await onRefreshFriends();
      if (ok) pushToast(ok, "success");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "failed", "error");
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      pushToast(`${label} copied`, "success");
    } catch {
      pushToast("Copy failed", "error");
    }
  }

  async function joinWithCode() {
    const code = joinCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      const host = await lookupGameHostCode(code);
      onGameHostsChange([host, ...gameHosts.filter((h) => h.id !== host.id)]);
      const share = host.room_code || code.toUpperCase();
      if (host.kind === "goldberg") {
        await goldbergApplyBroadcasts([host.address]);
        pushToast(
          `Room ${share}: LAN peers set to ${hostIp(host.address)}. Start your prepared game.`,
          "success",
        );
      } else {
        await copyText("Address", host.address);
        pushToast(`Room ${share}: paste ${host.address} in the game join box`, "success");
      }
      if (host.connect_command) {
        await copyText("Connect command", host.connect_command);
      }
      setJoinCode("");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "join failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function postHost() {
    setBusy(true);
    try {
      const host = await createGameHost({
        game_name: gameForm.game_name.trim(),
        address: gameForm.address.trim(),
        note: gameForm.note.trim() || undefined,
        kind: hostMode,
        app_id: hostMode === "goldberg" ? gameForm.app_id.trim() : undefined,
        connect_command: gameForm.connect_command.trim() || undefined,
        server_id: activeServerId,
      });
      onGameHostsChange([host, ...gameHosts.filter((h) => h.id !== host.id)]);
      setLastPostedCode(host.room_code);
      setGameForm((f) => ({ ...f, game_name: "", note: "", connect_command: "" }));
      await copyText("Room code", host.room_code);
      pushToast(`Room code ${host.room_code} — give this to friends`, "success");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="friends-home app-fade">
      <header className="friends-home-header">
        <h2>Friends</h2>
        <nav className="friends-tabs" aria-label="Friends sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`friends-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "pending" && pendingCount > 0 ? (
                <span className="friends-tab-badge">{pendingCount}</span>
              ) : null}
              {t.id === "online" ? (
                <span className="friends-tab-count">{online.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <div className="friends-home-body">
        {tab === "online" && (
          <FriendList
            empty="No friends online."
            entries={online}
            onOpenProfile={onOpenProfile}
            actions={(f) => (
              <>
                <button type="button" className="primary sm" onClick={() => onOpenDm(f.user)}>
                  Message
                </button>
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => void run(() => removeFriend(f.user.id).then(() => undefined))}
                >
                  Remove
                </button>
              </>
            )}
          />
        )}

        {tab === "all" && (
          <FriendList
            empty="No friends yet — use Add Friend."
            entries={friends}
            onOpenProfile={onOpenProfile}
            actions={(f) => (
              <>
                <button type="button" className="primary sm" onClick={() => onOpenDm(f.user)}>
                  Message
                </button>
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() =>
                    void run(() => ignoreUser(f.user.id).then(() => undefined), "Ignored")
                  }
                >
                  Ignore
                </button>
                <button
                  type="button"
                  className="danger sm"
                  onClick={() =>
                    void run(() => removeFriend(f.user.id).then(() => undefined), "Removed")
                  }
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="danger sm"
                  onClick={() =>
                    void run(() => blockUser(f.user.id).then(() => undefined), "Blocked")
                  }
                >
                  Block
                </button>
              </>
            )}
          />
        )}

        {tab === "pending" && (
          <div className="friends-panel">
            <h3 className="friends-panel-title">Incoming</h3>
            {(friendsSnap?.incoming.length || 0) === 0 && (
              <p className="muted friends-empty">No incoming requests.</p>
            )}
            {friendsSnap?.incoming.map((r: FriendRequestInfo) => (
              <div key={r.id} className="friend-row">
                <button type="button" className="friend-main" onClick={() => onOpenProfile(r.from)}>
                  <AvatarImage user={r.from} size={36} />
                  <div>
                    <strong>{r.from.display_name}</strong>
                    <div className="muted">@{r.from.username}</div>
                  </div>
                </button>
                <div className="friend-actions">
                  <button
                    type="button"
                    className="primary sm"
                    onClick={() =>
                      void run(
                        () => acceptFriendRequest(r.id).then(() => undefined),
                        "Friend added",
                      )
                    }
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() =>
                      void run(() => declineFriendRequest(r.id).then(() => undefined))
                    }
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}

            <h3 className="friends-panel-title">Outgoing</h3>
            {(friendsSnap?.outgoing.length || 0) === 0 && (
              <p className="muted friends-empty">No outgoing requests.</p>
            )}
            {friendsSnap?.outgoing.map((r) => (
              <div key={r.id} className="friend-row">
                <button type="button" className="friend-main" onClick={() => onOpenProfile(r.to)}>
                  <AvatarImage user={r.to} size={36} />
                  <div>
                    <strong>{r.to.display_name}</strong>
                    <div className="muted">Pending · @{r.to.username}</div>
                  </div>
                </button>
                <div className="friend-actions">
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() =>
                      void run(() => declineFriendRequest(r.id).then(() => undefined), "Cancelled")
                    }
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "blocked" && (
          <div className="friends-panel">
            {(friendsSnap?.blocked.length || 0) === 0 &&
              (friendsSnap?.ignored.length || 0) === 0 && (
                <p className="muted friends-empty">No blocked or ignored users.</p>
              )}
            {(friendsSnap?.blocked.length || 0) > 0 && (
              <>
                <h3 className="friends-panel-title">Blocked</h3>
                {friendsSnap!.blocked.map((u) => (
                  <div key={u.id} className="friend-row">
                    <button type="button" className="friend-main" onClick={() => onOpenProfile(u)}>
                      <AvatarImage user={u} size={36} />
                      <div>
                        <strong>{u.display_name}</strong>
                        <div className="muted">@{u.username}</div>
                      </div>
                    </button>
                    <div className="friend-actions">
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() =>
                          void run(() => unblockUser(u.id).then(() => undefined), "Unblocked")
                        }
                      >
                        Unblock
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
            {(friendsSnap?.ignored.length || 0) > 0 && (
              <>
                <h3 className="friends-panel-title">Ignored</h3>
                {friendsSnap!.ignored.map((u) => (
                  <div key={u.id} className="friend-row">
                    <button type="button" className="friend-main" onClick={() => onOpenProfile(u)}>
                      <AvatarImage user={u} size={36} />
                      <div>
                        <strong>{u.display_name}</strong>
                        <div className="muted">@{u.username}</div>
                      </div>
                    </button>
                    <div className="friend-actions">
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() =>
                          void run(() => unignoreUser(u.id).then(() => undefined), "Unignored")
                        }
                      >
                        Unignore
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === "add" && (
          <div className="friends-panel friends-add">
            <p className="muted">You can add friends with their Neuro Connect username.</p>
            <div className="friends-add-row">
              <input
                className="nc-input"
                placeholder="Enter a username"
                value={friendUsername}
                onChange={(e) => setFriendUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void run(async () => {
                      await sendFriendRequest(friendUsername.trim());
                      setFriendUsername("");
                      setTab("pending");
                    }, "Friend request sent");
                  }
                }}
              />
              <button
                type="button"
                className="primary"
                disabled={!friendUsername.trim()}
                onClick={() =>
                  void run(async () => {
                    await sendFriendRequest(friendUsername.trim());
                    setFriendUsername("");
                    setTab("pending");
                  }, "Friend request sent")
                }
              >
                Send Friend Request
              </button>
            </div>
          </div>
        )}

        {tab === "stream" && (
          <div className="friends-panel">
            <p className="muted friends-empty">
              Paste a direct audio/video URL. The server relays it so everyone plays from one source.
            </p>
            <MediaRelayBar
              relay={mediaRelay}
              serverId={activeServerId}
              channelId={null}
              localUserId={localUserId}
              canModerate={canModerate}
              onRelayChange={onRelayChange}
            />
          </div>
        )}

        {tab === "hosts" && (
          <div className="friends-panel">
            <p className="muted friends-empty">
              Host a LAN / Steam-LAN room. Friends join with your <strong>room code</strong> — not by
              guessing ports.
            </p>

            <div className="game-join-code">
              <h3 className="friends-panel-title">Join with room code</h3>
              <div className="friends-add-row">
                <input
                  className="nc-input"
                  placeholder="e.g. N7K2Q9"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void joinWithCode();
                  }}
                />
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !joinCode.trim()}
                  onClick={() => void joinWithCode()}
                >
                  Join room
                </button>
              </div>
            </div>

            <h3 className="friends-panel-title">Host a room</h3>
            <div className="host-mode-toggle">
              <button
                type="button"
                className={hostMode === "goldberg" ? "primary sm" : "ghost sm"}
                onClick={() => setHostMode("goldberg")}
              >
                Steam LAN (Goldberg)
              </button>
              <button
                type="button"
                className={hostMode === "direct" ? "primary sm" : "ghost sm"}
                onClick={() => setHostMode("direct")}
              >
                Direct IP:port
              </button>
            </div>

            {hostMode === "goldberg" && (
              <div className="goldberg-box">
                <p className="muted">
                  {gb?.note ||
                    "Import a Goldberg Steam Emulator release once, then prepare the game folder."}
                </p>
                <div className="friend-actions" style={{ justifyContent: "flex-start" }}>
                  <button
                    type="button"
                    className="ghost sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const s = await goldbergImportAssets();
                        setGb(s);
                        pushToast(
                          s.ready ? "Goldberg assets imported" : s.note,
                          s.ready ? "success" : "error",
                        );
                      } catch (e) {
                        if (String(e).includes("cancelled")) return;
                        pushToast(e instanceof Error ? e.message : "import failed", "error");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {gb?.ready ? "Re-import Goldberg" : "Import Goldberg release"}
                  </button>
                  <button
                    type="button"
                    className="primary sm"
                    disabled={busy || !gb?.ready || !gameForm.app_id.trim()}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const prep = await goldbergPrepareGame(
                          gameForm.app_id.trim(),
                          localDisplayName || "Player",
                        );
                        setGameForm((f) => ({
                          ...f,
                          address: f.address.includes(":")
                            ? `${hostIp(f.address)}:${prep.listen_port}`
                            : `${hostIp(f.address) || "127.0.0.1"}:${prep.listen_port}`,
                          game_name: f.game_name || `App ${prep.app_id}`,
                        }));
                        pushToast(
                          `Prepared ${prep.arch} game (port ${prep.listen_port}). Start the game, then Host a room.`,
                          "success",
                        );
                      } catch (e) {
                        if (String(e).includes("cancelled")) return;
                        pushToast(e instanceof Error ? e.message : "prepare failed", "error");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Prepare game folder
                  </button>
                </div>
              </div>
            )}

            <div className="game-host-form compact">
              <input
                className="nc-input"
                placeholder="Game name"
                value={gameForm.game_name}
                onChange={(e) => setGameForm((f) => ({ ...f, game_name: e.target.value }))}
              />
              {hostMode === "goldberg" && (
                <input
                  className="nc-input"
                  placeholder="Steam AppID (steamdb.info)"
                  value={gameForm.app_id}
                  onChange={(e) => setGameForm((f) => ({ ...f, app_id: e.target.value }))}
                />
              )}
              <input
                className="nc-input"
                placeholder={
                  hostMode === "goldberg"
                    ? `Your LAN IP:${GOLDBERG_DEFAULT_PORT}`
                    : "IP:port friends should use"
                }
                value={gameForm.address}
                onChange={(e) => setGameForm((f) => ({ ...f, address: e.target.value }))}
              />
              <input
                className="nc-input"
                placeholder="Note (optional)"
                value={gameForm.note}
                onChange={(e) => setGameForm((f) => ({ ...f, note: e.target.value }))}
              />
              <input
                className="nc-input"
                placeholder="Optional +connect_lobby … (rich presence)"
                value={gameForm.connect_command}
                onChange={(e) => setGameForm((f) => ({ ...f, connect_command: e.target.value }))}
              />
              <button
                type="button"
                className="primary sm"
                disabled={
                  busy ||
                  !gameForm.game_name.trim() ||
                  !gameForm.address.trim() ||
                  (hostMode === "goldberg" && !gameForm.app_id.trim())
                }
                onClick={() => void postHost()}
              >
                Host a room
              </button>
            </div>

            {lastPostedCode && (
              <div className="room-code-banner">
                <span className="muted">Give friends this code:</span>
                <strong className="room-code-value">{lastPostedCode}</strong>
                <button
                  type="button"
                  className="primary sm"
                  onClick={() => void copyText("Room code", lastPostedCode)}
                >
                  Copy code
                </button>
              </div>
            )}

            {gameHosts.length === 0 && <p className="muted friends-empty">No active game rooms.</p>}
            {gameHosts.map((h) => (
              <div key={h.id} className="friend-row">
                <div className="friend-main static">
                  <div>
                    <strong>{h.game_name}</strong>
                    <div className="room-code-inline">
                      Code <kbd>{h.room_code}</kbd>
                      {h.kind === "goldberg" ? " · Steam LAN" : " · Direct"}
                    </div>
                    <div className="muted">
                      {h.address} · {h.user.display_name}
                      {h.app_id ? ` · app ${h.app_id}` : ""}
                      {h.note ? ` · ${h.note}` : ""}
                    </div>
                  </div>
                </div>
                <div className="friend-actions">
                  <button
                    type="button"
                    className="primary sm"
                    onClick={() => void copyText("Room code", h.room_code)}
                  >
                    Copy code
                  </button>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={async () => {
                      try {
                        if (h.kind === "goldberg") {
                          await goldbergApplyBroadcasts([h.address]);
                          pushToast(`LAN peers set to ${hostIp(h.address)}`, "success");
                        } else {
                          await copyText("Address", h.address);
                        }
                        if (h.connect_command) {
                          await copyText("Connect command", h.connect_command);
                        }
                      } catch (e) {
                        pushToast(e instanceof Error ? e.message : "failed", "error");
                      }
                    }}
                  >
                    {h.kind === "goldberg" ? "Apply LAN" : "Copy IP"}
                  </button>
                  {(h.user.id === localUserId || canModerate) && (
                    <button
                      type="button"
                      className="danger sm"
                      onClick={async () => {
                        try {
                          await deleteGameHost(h.id);
                          onGameHostsChange(gameHosts.filter((x) => x.id !== h.id));
                          if (lastPostedCode === h.room_code) setLastPostedCode(null);
                        } catch (e) {
                          pushToast(e instanceof Error ? e.message : "failed", "error");
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FriendList({
  entries,
  empty,
  onOpenProfile,
  actions,
}: {
  entries: FriendEntry[];
  empty: string;
  onOpenProfile: (u: UserPublic) => void;
  actions: (f: FriendEntry) => ReactNode;
}) {
  if (entries.length === 0) {
    return <p className="muted friends-empty">{empty}</p>;
  }
  return (
    <div className="friends-panel">
      {entries.map((f) => (
        <div key={f.user.id} className="friend-row">
          <button type="button" className="friend-main" onClick={() => onOpenProfile(f.user)}>
            <span className={`presence-dot ${f.online ? "on" : ""}`} />
            <AvatarImage user={f.user} size={36} />
            <div>
              <strong>{f.user.display_name}</strong>
              <div className="muted">
                {f.online ? "Online" : "Offline"} · @{f.user.username}
              </div>
            </div>
          </button>
          <div className="friend-actions">{actions(f)}</div>
        </div>
      ))}
    </div>
  );
}
