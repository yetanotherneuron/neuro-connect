import { useEffect, useMemo, useRef, useState } from "react";
import { AvatarImage, ProfileCard } from "../components/Avatar";
import { ChatView } from "../components/ChatView";
import { useContextMenu } from "../components/ContextMenu";
import { useToast } from "../components/Toast";
import { VoiceConnectedBar, VoicePanel } from "../components/VoicePanel";
import {
  banUser,
  claimGlobalAdmin,
  connectRealtime,
  createChannel,
  createGameHost,
  createServer,
  deleteAdminServer,
  deleteChannel,
  deleteGameHost,
  joinServer,
  listAdminUsers,
  listChannels,
  listDms,
  listGameHosts,
  listMembers,
  listServers,
  logoutUser,
  openDm,
  renameChannel,
  setMemberRank,
  unbanUser,
  updateProfile,
  type RealtimeClient,
} from "../lib/api";
import { wipeSession, saveVoiceSettings, localIpv4 } from "../lib/native";
import { VoiceSession } from "../lib/voice/VoiceSession";
import type {
  AdminUserInfo,
  ChannelInfo,
  ClientConfig,
  DmThread,
  GameHostInfo,
  MemberInfo,
  Rank,
  ServerInfo,
  ServerMeta,
  UserPublic,
  VoicePeerInfo,
} from "../lib/types";
import "./MainShell.css";

type NavMode = "home" | "server";

type View =
  | { kind: "channel"; id: string; title: string }
  | { kind: "dm"; id: string; title: string }
  | { kind: "voice"; id: string; name: string }
  | { kind: "friends" }
  | { kind: "settings" }
  | { kind: "empty" };

const HIDDEN_DMS_KEY = "nc-hidden-dms";

function loadHiddenDms(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_DMS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveHiddenDms(ids: Set<string>) {
  localStorage.setItem(HIDDEN_DMS_KEY, JSON.stringify([...ids]));
}

function matchesHotkey(e: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey.split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return false;
  const key = parts[parts.length - 1];
  const needCtrl = parts.includes("ctrl") || parts.includes("control");
  const needShift = parts.includes("shift");
  const needAlt = parts.includes("alt");
  if (!!e.ctrlKey !== needCtrl) return false;
  if (!!e.shiftKey !== needShift) return false;
  if (!!e.altKey !== needAlt) return false;
  return e.key.toLowerCase() === key.toLowerCase();
}

export function MainShell({
  user,
  config,
  meta,
  onLogout,
  onUser,
  onConfig,
}: {
  user: UserPublic;
  config: ClientConfig;
  meta: ServerMeta | null;
  onLogout: () => void;
  onUser: (u: UserPublic) => void;
  onConfig?: (c: ClientConfig) => void;
}) {
  const { pushToast } = useToast();
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [navMode, setNavMode] = useState<NavMode>("home");
  const [activeServer, setActiveServer] = useState<ServerInfo | null>(null);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [dms, setDms] = useState<DmThread[]>([]);
  const [hiddenDms, setHiddenDms] = useState<Set<string>>(() => loadHiddenDms());
  const [view, setView] = useState<View>({ kind: "friends" });
  const [profileUser, setProfileUser] = useState<UserPublic | null>(null);
  const { openContextMenu, contextMenuNode } = useContextMenu();

  const [voicePeers, setVoicePeers] = useState<VoicePeerInfo[]>([]);
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [localVoice, setLocalVoice] = useState({
    muted: true,
    deafened: false,
    speaking: false,
    pttHeld: false,
  });
  const [screenShare, setScreenShare] = useState({
    sharing: false,
    localSharing: false,
    sharerId: null as string | null,
    videoStream: null as MediaStream | null,
  });
  const [gameHosts, setGameHosts] = useState<GameHostInfo[]>([]);
  const [gameForm, setGameForm] = useState({ game_name: "", address: "", note: "" });
  const voiceRef = useRef<VoiceSession | null>(null);
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const myRank = useMemo(() => {
    return members.find((m) => m.user.id === user.id)?.rank;
  }, [members, user.id]);

  const visibleDms = useMemo(
    () => dms.filter((d) => !hiddenDms.has(d.id)),
    [dms, hiddenDms],
  );

  const friends = useMemo(() => {
    const map = new Map<string, UserPublic>();
    for (const d of dms) map.set(d.peer.id, d.peer);
    for (const m of members) {
      if (m.user.id !== user.id) map.set(m.user.id, m.user);
    }
    return [...map.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [dms, members, user.id]);

  async function refreshServers() {
    const list = await listServers();
    setServers(list);
    if (activeServer) {
      const fresh = list.find((s) => s.id === activeServer.id);
      if (fresh) setActiveServer(fresh);
    }
  }

  async function selectHome() {
    setNavMode("home");
    setActiveServer(null);
    setChannels([]);
    setMembers([]);
    setView({ kind: "friends" });
    setDms(await listDms());
  }

  async function selectServer(server: ServerInfo) {
    setNavMode("server");
    setActiveServer(server);
    const [chs, mems] = await Promise.all([listChannels(server.id), listMembers(server.id)]);
    setChannels(chs);
    setMembers(mems);
    const text = chs.find((c) => c.kind === "text");
    if (text) setView({ kind: "channel", id: text.id, title: `# ${text.name}` });
    else setView({ kind: "empty" });
  }

  useEffect(() => {
    const session = new VoiceSession({
      localUserId: user.id,
      pushToTalk: configRef.current.push_to_talk,
      voiceSounds: configRef.current.voice_sounds,
      iceServers: configRef.current.ice_servers,
      onPeers: (peers, channelId) => {
        setVoicePeers(peers);
        setVoiceChannelId(channelId);
        setVoiceConnecting(false);
        if (!channelId) {
          setScreenShare({
            sharing: false,
            localSharing: false,
            sharerId: null,
            videoStream: null,
          });
        }
      },
      onError: (message) => pushToast(message, "error"),
      onLocalState: setLocalVoice,
      onScreenShare: setScreenShare,
    });
    voiceRef.current = session;

    void (async () => {
      try {
        await refreshServers();
        setDms(await listDms());
        setGameHosts(await listGameHosts());
        setNavMode("home");
        setView({ kind: "friends" });
        const ip = await localIpv4();
        if (ip) {
          setGameForm((f) => (f.address ? f : { ...f, address: `${ip}:24642` }));
        }
      } catch (e) {
        pushToast(e instanceof Error ? e.message : "load failed", "error");
      }
    })();

    const rt = connectRealtime((raw) => {
      const ev = raw as { type?: string; host?: GameHostInfo; host_id?: string };
      if (ev.type === "message_created") {
        window.dispatchEvent(new CustomEvent("nc-message", { detail: ev }));
      }
      if (ev.type === "message_deleted") {
        window.dispatchEvent(new CustomEvent("nc-message-deleted", { detail: ev }));
      }
      if (ev.type === "game_host_updated" && ev.host) {
        setGameHosts((prev) => {
          const rest = prev.filter((h) => h.id !== ev.host!.id);
          return [ev.host!, ...rest];
        });
      }
      if (ev.type === "game_host_removed" && ev.host_id) {
        setGameHosts((prev) => prev.filter((h) => h.id !== ev.host_id));
      }
      session.handleEvent(raw);
    });
    realtimeRef.current = rt;
    if (rt) session.attachRealtime(rt);

    const onHotkey = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string; pressed?: boolean };
      if (!voiceRef.current?.activeChannelId) return;
      if (detail.action === "mute") voiceRef.current.toggleMute();
      if (detail.action === "deafen") voiceRef.current.toggleDeafen();
      if (detail.action === "ptt") voiceRef.current.setPttHeld(!!detail.pressed);
    };
    window.addEventListener("nc-voice-hotkey", onHotkey);

    // Focused-window keyboard fallback (also works in browser dev).
    const onKeyDown = (e: KeyboardEvent) => {
      if (!voiceRef.current?.activeChannelId) return;
      const cfg = configRef.current;
      if (matchesHotkey(e, cfg.hotkey_push_to_talk) && !e.repeat) {
        e.preventDefault();
        voiceRef.current.setPttHeld(true);
      }
      if (matchesHotkey(e, cfg.hotkey_mute) && !e.repeat) {
        e.preventDefault();
        voiceRef.current.toggleMute();
      }
      if (matchesHotkey(e, cfg.hotkey_deafen) && !e.repeat) {
        e.preventDefault();
        voiceRef.current.toggleDeafen();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!voiceRef.current?.activeChannelId) return;
      if (matchesHotkey(e, configRef.current.hotkey_push_to_talk)) {
        voiceRef.current.setPttHeld(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let unlistenTauri: (() => void) | undefined;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenTauri = await listen<{ action?: string; pressed?: boolean }>(
          "nc-voice-hotkey",
          (ev) => {
            window.dispatchEvent(
              new CustomEvent("nc-voice-hotkey", { detail: ev.payload }),
            );
          },
        );
      } catch {
        /* not in Tauri */
      }
    })();

    return () => {
      window.removeEventListener("nc-voice-hotkey", onHotkey);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      unlistenTauri?.();
      session.destroy();
      rt?.close();
      voiceRef.current = null;
      realtimeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    voiceRef.current?.setPushToTalk(config.push_to_talk);
  }, [config.push_to_talk]);

  async function joinVoice(channelId: string) {
    setVoiceConnecting(true);
    try {
      await voiceRef.current?.join(channelId);
    } catch (e) {
      setVoiceConnecting(false);
      pushToast(e instanceof Error ? e.message : "voice join failed", "error");
    }
  }

  async function leaveVoice() {
    await voiceRef.current?.leave();
    setVoicePeers([]);
    setVoiceChannelId(null);
  }

  const voiceChannelName = useMemo(() => {
    if (!voiceChannelId) return "";
    return channels.find((c) => c.id === voiceChannelId)?.name || "Voice";
  }, [channels, voiceChannelId]);

  async function handleCreateServer() {
    const name = prompt("Server name");
    if (!name) return;
    try {
      const s = await createServer(name);
      await refreshServers();
      await selectServer(s);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "create failed", "error");
    }
  }

  async function handleJoin() {
    const code = prompt("Invite code");
    if (!code) return;
    try {
      const s = await joinServer(code.trim());
      await refreshServers();
      await selectServer(s);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "join failed", "error");
    }
  }

  async function handleAddChannel() {
    if (!activeServer || (myRank !== "owner" && myRank !== "admin" && !user.is_global_admin)) {
      pushToast("Admin required to create channels", "error");
      return;
    }
    const name = prompt("Channel name");
    if (!name) return;
    const kindRaw = prompt('Channel type: "text" or "voice"', "text");
    if (!kindRaw) return;
    const kind = kindRaw.trim().toLowerCase() === "voice" ? "voice" : "text";
    try {
      await createChannel(activeServer.id, name, kind);
      setChannels(await listChannels(activeServer.id));
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "channel failed", "error");
    }
  }

  async function handleRenameChannel(ch: ChannelInfo) {
    const name = prompt("Rename channel", ch.name);
    if (!name || name === ch.name) return;
    try {
      await renameChannel(ch.id, name);
      if (activeServer) setChannels(await listChannels(activeServer.id));
      if (view.kind === "channel" && view.id === ch.id) {
        setView({ kind: "channel", id: ch.id, title: `# ${name}` });
      }
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "rename failed", "error");
    }
  }

  async function handleDeleteChannel(ch: ChannelInfo) {
    if (!confirm(`Delete #${ch.name}?`)) return;
    try {
      await deleteChannel(ch.id);
      if (activeServer) setChannels(await listChannels(activeServer.id));
      if (view.kind === "channel" && view.id === ch.id) setView({ kind: "empty" });
      if (view.kind === "voice" && view.id === ch.id) setView({ kind: "empty" });
      if (voiceChannelId === ch.id) void leaveVoice();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "delete failed", "error");
    }
  }

  async function handleRank(member: MemberInfo, rank: Rank) {
    if (!activeServer) return;
    try {
      await setMemberRank(activeServer.id, member.user.id, rank);
      setMembers(await listMembers(activeServer.id));
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "rank failed", "error");
    }
  }

  async function handleOpenDm(peer: UserPublic) {
    try {
      const dm = await openDm(peer.id);
      const next = new Set(hiddenDms);
      next.delete(dm.id);
      setHiddenDms(next);
      saveHiddenDms(next);
      setDms(await listDms());
      setNavMode("home");
      setActiveServer(null);
      setChannels([]);
      setView({ kind: "dm", id: dm.id, title: `@ ${dm.peer.display_name}` });
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "dm failed", "error");
    }
  }

  function closeDm(id: string) {
    const next = new Set(hiddenDms);
    next.add(id);
    setHiddenDms(next);
    saveHiddenDms(next);
    if (view.kind === "dm" && view.id === id) setView({ kind: "friends" });
  }

  const canManageChannels =
    myRank === "owner" || myRank === "admin" || Boolean(user.is_global_admin);

  return (
    <div className="shell">
      <aside className="server-rail">
        <button
          type="button"
          className={`server-btn home ${navMode === "home" ? "active" : ""}`}
          title="Home"
          onClick={() => void selectHome()}
        >
          NC
        </button>
        <div className="rail-sep" />
        {servers.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`server-btn ${navMode === "server" && activeServer?.id === s.id ? "active" : ""}`}
            title={s.name}
            onClick={() => void selectServer(s)}
          >
            {s.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <button type="button" className="server-btn add" title="Create server" onClick={() => void handleCreateServer()}>
          +
        </button>
        <button type="button" className="server-btn add" title="Join server" onClick={() => void handleJoin()}>
          ↓
        </button>
      </aside>

      <aside className="channel-panel">
        {navMode === "home" ? (
          <>
            <div className="panel-head">
              <strong>Home</strong>
              <span className="muted">Friends & direct messages</span>
            </div>
            <div className="panel-scroll">
              <div className="panel-section">
                <div className="section-label">Direct messages</div>
                {visibleDms.length === 0 && <p className="panel-empty">No open DMs</p>}
                {visibleDms.map((d) => (
                  <div key={d.id} className="nav-row">
                    <button
                      type="button"
                      className={`nav-item with-avatar ${view.kind === "dm" && view.id === d.id ? "active" : ""}`}
                      onClick={() => setView({ kind: "dm", id: d.id, title: `@ ${d.peer.display_name}` })}
                      onContextMenu={(e) =>
                        openContextMenu(
                          e,
                          [
                            { id: "profile", label: "View profile" },
                            { id: "close", label: "Close DM", danger: true },
                          ],
                          (id) => {
                            if (id === "profile") setProfileUser(d.peer);
                            if (id === "close") closeDm(d.id);
                          },
                        )
                      }
                    >
                      <AvatarImage user={d.peer} size={24} />
                      <span>{d.peer.display_name}</span>
                    </button>
                    <button type="button" className="nav-close" title="Close DM" onClick={() => closeDm(d.id)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="panel-section">
                <div className="section-label">
                  Friends
                  <button type="button" onClick={() => setView({ kind: "friends" })}>
                    All
                  </button>
                </div>
                {friends.slice(0, 12).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="nav-item with-avatar"
                    onClick={() => void handleOpenDm(f)}
                    onContextMenu={(e) =>
                      openContextMenu(
                        e,
                        [
                          { id: "message", label: "Message" },
                          { id: "profile", label: "View profile" },
                        ],
                        (id) => {
                          if (id === "message") void handleOpenDm(f);
                          if (id === "profile") setProfileUser(f);
                        },
                      )
                    }
                  >
                    <AvatarImage user={f} size={24} />
                    <span>{f.display_name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="panel-head">
              <strong>{activeServer?.name || "Server"}</strong>
              {activeServer && (
                <span className="invite" title="Invite code">
                  {activeServer.invite_code}
                </span>
              )}
            </div>
            <div className="panel-scroll">
              <div className="panel-section">
                <div className="section-label">
                  Text
                  <button type="button" onClick={() => void handleAddChannel()}>
                    +
                  </button>
                </div>
                {channels
                  .filter((c) => c.kind === "text")
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`nav-item ${view.kind === "channel" && view.id === c.id ? "active" : ""}`}
                      onClick={() => setView({ kind: "channel", id: c.id, title: `# ${c.name}` })}
                      onContextMenu={(e) =>
                        openContextMenu(
                          e,
                          [
                            {
                              id: "rename",
                              label: "Rename channel",
                              disabled: !canManageChannels,
                            },
                            {
                              id: "delete",
                              label: "Delete channel",
                              danger: true,
                              disabled: !canManageChannels,
                            },
                          ],
                          (id) => {
                            if (id === "rename") void handleRenameChannel(c);
                            if (id === "delete") void handleDeleteChannel(c);
                          },
                        )
                      }
                    >
                      # {c.name}
                    </button>
                  ))}
              </div>
              <div className="panel-section">
                <div className="section-label">Voice</div>
                {channels
                  .filter((c) => c.kind === "voice")
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`nav-item ${voiceChannelId === c.id ? "active" : ""}`}
                      onClick={() => setView({ kind: "voice", id: c.id, name: c.name })}
                      onContextMenu={(e) => {
                        const canManageChannels =
                          myRank === "owner" || myRank === "admin" || !!user.is_global_admin;
                        openContextMenu(
                          e,
                          [
                            {
                              id: "rename",
                              label: "Rename channel",
                              disabled: !canManageChannels,
                            },
                            {
                              id: "delete",
                              label: "Delete channel",
                              danger: true,
                              disabled: !canManageChannels,
                            },
                          ],
                          (id) => {
                            if (id === "rename") void handleRenameChannel(c);
                            if (id === "delete") void handleDeleteChannel(c);
                          },
                        );
                      }}
                    >
                      ◉ {c.name}
                      {voiceChannelId === c.id ? " · live" : ""}
                    </button>
                  ))}
                {channels.filter((c) => c.kind === "voice").length === 0 && (
                  <p className="panel-empty muted">No voice channels yet</p>
                )}
              </div>
            </div>
          </>
        )}
        <div className="user-footer">
          {voiceChannelId && (
            <VoiceConnectedBar
              channelName={voiceChannelName}
              muted={localVoice.muted}
              deafened={localVoice.deafened}
              sharing={screenShare.localSharing}
              onMute={() => voiceRef.current?.toggleMute()}
              onDeafen={() => voiceRef.current?.toggleDeafen()}
              onLeave={() => void leaveVoice()}
              onOpen={() =>
                setView({
                  kind: "voice",
                  id: voiceChannelId,
                  name: voiceChannelName,
                })
              }
            />
          )}
          <div className="user-chip-row">
            <button type="button" className="user-chip" onClick={() => setProfileUser(user)}>
              <AvatarImage user={user} size={32} />
              <div>
                <strong>
                  {user.display_name}
                  {user.is_global_admin && <span className="admin-badge"> GA</span>}
                </strong>
                <div className="muted">@{user.username}</div>
              </div>
            </button>
            <button type="button" className="icon-btn sm" title="Settings" onClick={() => setView({ kind: "settings" })}>
              ⚙
            </button>
          </div>
        </div>
      </aside>

      <main className="main-pane">
        {view.kind === "channel" && (
          <ChatView
            mode="channel"
            targetId={view.id}
            me={user}
            title={view.title}
            onOpenProfile={setProfileUser}
          />
        )}
        {view.kind === "dm" && (
          <ChatView
            mode="dm"
            targetId={view.id}
            me={user}
            title={view.title}
            onOpenProfile={setProfileUser}
          />
        )}
        {view.kind === "voice" && (
          <VoicePanel
            channelName={view.name}
            channelId={view.id}
            connected={voiceChannelId === view.id}
            connecting={voiceConnecting && voiceChannelId !== view.id}
            peers={voiceChannelId === view.id ? voicePeers : []}
            localUserId={user.id}
            localMuted={localVoice.muted}
            localDeafened={localVoice.deafened}
            pttMode={config.push_to_talk}
            pttHeld={localVoice.pttHeld}
            canMove={myRank === "owner" || myRank === "admin" || myRank === "moderator" || !!user.is_global_admin}
            voiceChannels={channels.filter((c) => c.kind === "voice")}
            screenSharing={voiceChannelId === view.id && screenShare.sharing}
            localScreenSharing={voiceChannelId === view.id && screenShare.localSharing}
            screenSharerId={voiceChannelId === view.id ? screenShare.sharerId : null}
            screenStream={voiceChannelId === view.id ? screenShare.videoStream : null}
            onJoin={() => void joinVoice(view.id)}
            onLeave={() => void leaveVoice()}
            onToggleMute={() => voiceRef.current?.toggleMute()}
            onToggleDeafen={() => voiceRef.current?.toggleDeafen()}
            onMutePeer={(uid, muted) => voiceRef.current?.mutePeerLocally(uid, muted)}
            onMovePeer={(uid, to) => voiceRef.current?.moveMember(uid, to)}
            onStartScreenShare={() => void voiceRef.current?.startScreenShare()}
            onStopScreenShare={() => void voiceRef.current?.stopScreenShare()}
            onOpenProfile={(uid) => {
              const peer = voicePeers.find((p) => p.user.id === uid)?.user
                || members.find((m) => m.user.id === uid)?.user;
              if (peer) setProfileUser(peer);
            }}
          />
        )}
        {view.kind === "friends" && (
          <div className="friends-view app-fade">
            <header className="chat-header">
              <h2>Home</h2>
              <span className="muted">Friends and game hosts on this server</span>
            </header>
            <div className="friends-list">
              <h3 className="home-section-title">Friends</h3>
              {friends.length === 0 && (
                <p className="muted">Join a server or open a DM to see people here.</p>
              )}
              {friends.map((f) => (
                <div key={f.id} className="friend-row">
                  <button type="button" className="friend-main" onClick={() => setProfileUser(f)}>
                    <AvatarImage user={f} size={40} />
                    <div>
                      <strong>{f.display_name}</strong>
                      <div className="muted">@{f.username}</div>
                    </div>
                  </button>
                  <button type="button" className="primary sm" onClick={() => void handleOpenDm(f)}>
                    Message
                  </button>
                </div>
              ))}

              <h3 className="home-section-title">Game Hosts</h3>
              <p className="muted home-hint">
                Post a LAN / IP game address so friends can join (e.g. Stardew Valley).
              </p>
              <div className="game-host-form">
                <input
                  className="nc-input"
                  placeholder="Game name"
                  value={gameForm.game_name}
                  onChange={(e) => setGameForm((f) => ({ ...f, game_name: e.target.value }))}
                />
                <input
                  className="nc-input"
                  placeholder="IP:port"
                  value={gameForm.address}
                  onChange={(e) => setGameForm((f) => ({ ...f, address: e.target.value }))}
                />
                <input
                  className="nc-input"
                  placeholder="Note (optional)"
                  value={gameForm.note}
                  onChange={(e) => setGameForm((f) => ({ ...f, note: e.target.value }))}
                />
                <button
                  type="button"
                  className="primary sm"
                  onClick={async () => {
                    try {
                      const host = await createGameHost({
                        game_name: gameForm.game_name,
                        address: gameForm.address,
                        note: gameForm.note,
                        server_id: activeServer?.id,
                      });
                      setGameHosts((prev) => [host, ...prev.filter((h) => h.id !== host.id)]);
                      setGameForm((f) => ({ ...f, game_name: "", note: "" }));
                      pushToast("Game host posted", "success");
                    } catch (e) {
                      pushToast(e instanceof Error ? e.message : "failed", "error");
                    }
                  }}
                >
                  Host a game
                </button>
              </div>
              {gameHosts.length === 0 && <p className="muted">No active game hosts.</p>}
              {gameHosts.map((h) => (
                <div key={h.id} className="game-host-row">
                  <div>
                    <strong>{h.game_name}</strong>
                    <div className="muted">
                      {h.address} · {h.user.display_name}
                      {h.note ? ` · ${h.note}` : ""}
                    </div>
                  </div>
                  <div className="game-host-actions">
                    <button
                      type="button"
                      className="ghost sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(h.address);
                          pushToast("Address copied", "success");
                        } catch {
                          pushToast(h.address, "info");
                        }
                      }}
                    >
                      Copy
                    </button>
                    {(h.user.id === user.id || user.is_global_admin) && (
                      <button
                        type="button"
                        className="danger sm"
                        onClick={async () => {
                          try {
                            await deleteGameHost(h.id);
                            setGameHosts((prev) => prev.filter((x) => x.id !== h.id));
                          } catch (e) {
                            pushToast(e instanceof Error ? e.message : "delete failed", "error");
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
          </div>
        )}
        {view.kind === "settings" && (
          <SettingsView
            user={user}
            config={config}
            servers={servers}
            onUser={onUser}
            onConfig={onConfig}
            onServersRefresh={() => void refreshServers()}
            onLogout={async () => {
              try {
                await logoutUser();
              } catch {
                /* offline logout still clears local session */
              }
              await wipeSession();
              onLogout();
            }}
          />
        )}
        {view.kind === "empty" && (
          <div className="placeholder">
            <h2>Welcome to Neuro Connect</h2>
            <p className="muted">Pick Home for DMs, or select a server for channels.</p>
          </div>
        )}
      </main>

      {navMode === "server" && (
        <aside className="member-panel">
          <div className="panel-head">
            <strong>Members</strong>
          </div>
          <div className="panel-scroll">
            {members.map((m) => (
              <div key={m.user.id} className="member-row">
                <button
                  type="button"
                  className="member-name"
                  onClick={() => setProfileUser(m.user)}
                  onContextMenu={(e) =>
                    openContextMenu(
                      e,
                      [
                        { id: "profile", label: "View profile" },
                        {
                          id: "dm",
                          label: "Message",
                          disabled: m.user.id === user.id,
                        },
                      ],
                      (id) => {
                        if (id === "profile") setProfileUser(m.user);
                        if (id === "dm") void handleOpenDm(m.user);
                      },
                    )
                  }
                >
                  <AvatarImage user={m.user} size={28} />
                  <span>
                    {m.user.display_name}
                    <span className="rank">{m.rank}</span>
                  </span>
                </button>
                {(myRank === "owner" || myRank === "admin") &&
                  m.rank !== "owner" &&
                  m.user.id !== user.id && (
                    <select
                      className="nc-select"
                      value={m.rank}
                      onChange={(e) => void handleRank(m, e.target.value as Rank)}
                    >
                      <option value="admin">admin</option>
                      <option value="moderator">moderator</option>
                      <option value="member">member</option>
                    </select>
                  )}
              </div>
            ))}
          </div>
        </aside>
      )}

      {profileUser && (
        <div className="profile-overlay" onClick={() => setProfileUser(null)}>
          <div className="profile-popover" onClick={(e) => e.stopPropagation()}>
            <ProfileCard user={profileUser} />
            <div className="profile-actions">
              {profileUser.id !== user.id && (
                <button
                  type="button"
                  className="primary sm"
                  onClick={() => {
                    void handleOpenDm(profileUser);
                    setProfileUser(null);
                  }}
                >
                  Message
                </button>
              )}
              <button type="button" className="ghost sm" onClick={() => setProfileUser(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {contextMenuNode}
    </div>
  );
}

function SettingsView({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <label>
        Banner URL
        <input
          className="nc-input"
          value={banner}
          onChange={(e) => setBanner(e.target.value)}
          placeholder="https://… (empty = default)"
        />
      </label>
      <button type="button" className="primary" onClick={() => void save()}>
        Save profile
      </button>

      <h3>Claim Global Admin</h3>
      <p className="muted">
        Only needed when the server set <code>global_admin_bootstrap_secret</code>.
      </p>
      <label>
        Bootstrap secret
        <input
          className="nc-input"
          value={claimSecret}
          onChange={(e) => setClaimSecret(e.target.value)}
        />
      </label>
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
          <button type="button" onClick={() => void loadAdmin()}>
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
                        onClick={async () => {
                          const reason = prompt("Ban reason") || "banned by global admin";
                          await banUser(a.user.id, reason);
                          void loadAdmin();
                        }}
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
                  onClick={async () => {
                    if (!confirm(`Delete server ${s.name}?`)) return;
                    await deleteAdminServer(s.id);
                    onServersRefresh();
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

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

      <button type="button" className="danger" onClick={() => void onLogout()}>
        Log out
      </button>
    </div>
  );
}
