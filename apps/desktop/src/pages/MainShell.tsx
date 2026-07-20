import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@neuro-connect/ui";
import { ProfileCard } from "../components/Avatar";
import { ChannelSidebar, dmTitle } from "../components/ChannelSidebar";
import { ChatView } from "../components/ChatView";
import { FriendsHome } from "../components/FriendsHome";
import { GameHostsView } from "../components/GameHostsView";
import { MediaRelayBar } from "../components/MediaRelayBar";
import { MemberPanel } from "../components/MemberPanel";
import { ConfirmDialog, Modal, PromptDialog, SelectDialog } from "../components/Modal";
import { ServerRail } from "../components/ServerRail";
import { SettingsView } from "../components/SettingsView";
import { SharePicker } from "../components/SharePicker";
import { useToast } from "../components/Toast";
import { VoiceConnectedBar, VoicePanel } from "../components/VoicePanel";
import {
  blockUser,
  connectRealtime,
  createChannel,
  createGroupDm,
  createServer,
  deleteChannel,
  fetchFriends,
  joinServer,
  listChannels,
  listDms,
  listGameHosts,
  listMembers,
  listServers,
  markChannelRead,
  markDmRead,
  openDm,
  removeFriend,
  renameChannel,
  setMemberRank,
  type RealtimeClient,
} from "../lib/api";
import { VoiceSession } from "../lib/voice/VoiceSession";
import type {
  ChannelInfo,
  ClientConfig,
  DmThread,
  FriendsSnapshot,
  GameHostInfo,
  MediaRelayInfo,
  MemberInfo,
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
  | { kind: "hosts" }
  | { kind: "settings" }
  | { kind: "empty" };

type DialogState =
  | { type: "create-server" }
  | { type: "join-server" }
  | { type: "channel-name"; next: "create" }
  | { type: "channel-kind"; name: string }
  | { type: "rename-channel"; channel: ChannelInfo }
  | { type: "delete-channel"; channel: ChannelInfo }
  | { type: "group-dm" }
  | null;

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
  meta: _meta,
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
  const [dialog, setDialog] = useState<DialogState>(null);
  const [groupName, setGroupName] = useState("");
  const [groupSelected, setGroupSelected] = useState<Set<string>>(new Set());

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
  const [mediaRelay, setMediaRelay] = useState<MediaRelayInfo | null>(null);
  const [friendsSnap, setFriendsSnap] = useState<FriendsSnapshot | null>(null);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
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
    const list = friendsSnap?.friends || [];
    return list.map((f) => ({
      ...f,
      online: onlineIds.has(f.user.id) || f.online,
    }));
  }, [friendsSnap, onlineIds]);

  const serverUnread = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of channels) {
      if ((c.unread_count || 0) > 0) {
        map[c.server_id] = (map[c.server_id] || 0) + (c.unread_count || 0);
      }
    }
    return map;
  }, [channels]);

  async function refreshFriends() {
    try {
      const snap = await fetchFriends();
      setFriendsSnap(snap);
      setOnlineIds(new Set(snap.friends.filter((f) => f.online).map((f) => f.user.id)));
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "friends load failed", "error");
    }
  }

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
    await refreshFriends();
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
        try {
          const snap = await fetchFriends();
          setFriendsSnap(snap);
          setOnlineIds(new Set(snap.friends.filter((f) => f.online).map((f) => f.user.id)));
        } catch {
          /* friends optional on first load */
        }
        setNavMode("home");
        setView({ kind: "friends" });
      } catch (e) {
        pushToast(e instanceof Error ? e.message : "load failed", "error");
      }
    })();

    const rt = connectRealtime((raw) => {
      const ev = raw as {
        type?: string;
        host?: GameHostInfo;
        host_id?: string;
        relay?: MediaRelayInfo;
        relay_id?: string;
        user_id?: string;
        online?: boolean;
        message?: { channel_id?: string | null; dm_id?: string | null; author?: { id?: string } };
      };
      if (ev.type === "message_created") {
        window.dispatchEvent(new CustomEvent("nc-message", { detail: ev }));
        if (ev.message?.channel_id && ev.message.author?.id !== user.id) {
          setChannels((prev) =>
            prev.map((c) =>
              c.id === ev.message!.channel_id
                ? { ...c, unread_count: (c.unread_count || 0) + 1 }
                : c,
            ),
          );
        }
        if (ev.message?.dm_id && ev.message.author?.id !== user.id) {
          setDms((prev) =>
            prev.map((d) =>
              d.id === ev.message!.dm_id
                ? { ...d, unread_count: (d.unread_count || 0) + 1 }
                : d,
            ),
          );
        }
      }
      if (ev.type === "message_updated") {
        window.dispatchEvent(new CustomEvent("nc-message-updated", { detail: ev }));
      }
      if (ev.type === "message_reaction_updated") {
        window.dispatchEvent(new CustomEvent("nc-message-reaction", { detail: ev }));
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
      if (ev.type === "media_relay_started" && ev.relay) {
        setMediaRelay(ev.relay);
      }
      if (ev.type === "media_relay_stopped") {
        setMediaRelay(null);
      }
      if (ev.type === "presence" && ev.user_id) {
        setOnlineIds((prev) => {
          const next = new Set(prev);
          if (ev.online) next.add(ev.user_id!);
          else next.delete(ev.user_id!);
          return next;
        });
      }
      if (
        ev.type === "friend_request_created" ||
        ev.type === "friend_accepted" ||
        ev.type === "friend_removed"
      ) {
        void fetchFriends()
          .then((snap) => {
            setFriendsSnap(snap);
            setOnlineIds(new Set(snap.friends.filter((f) => f.online).map((f) => f.user.id)));
          })
          .catch(() => {
            /* ignore */
          });
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
  }, []);

  useEffect(() => {
    voiceRef.current?.setPushToTalk(config.push_to_talk);
  }, [config.push_to_talk]);

  useEffect(() => {
    if (view.kind === "channel") {
      void markChannelRead(view.id)
        .then(() => {
          setChannels((prev) =>
            prev.map((c) => (c.id === view.id ? { ...c, unread_count: 0 } : c)),
          );
        })
        .catch(() => {
          /* older servers without endpoint */
        });
    }
    if (view.kind === "dm") {
      void markDmRead(view.id)
        .then(() => {
          setDms((prev) => prev.map((d) => (d.id === view.id ? { ...d, unread_count: 0 } : d)));
        })
        .catch(() => {
          /* older servers */
        });
    }
  }, [view]);

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
      setView({ kind: "dm", id: dm.id, title: dmTitle(dm) });
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

  const canModerate =
    !!user.is_global_admin ||
    myRank === "owner" ||
    myRank === "admin" ||
    myRank === "moderator";

  const showMediaBar =
    (view.kind === "channel" || view.kind === "voice") && mediaRelay;

  const mainContent = (
    <>
      {showMediaBar && (
        <MediaRelayBar
          relay={mediaRelay}
          serverId={activeServer?.id}
          channelId={view.kind === "channel" || view.kind === "voice" ? view.id : null}
          localUserId={user.id}
          canModerate={canModerate}
          onRelayChange={setMediaRelay}
        />
      )}
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
          canMove={canModerate}
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
          onOpenSharePicker={() => setSharePickerOpen(true)}
          onStopScreenShare={() => void voiceRef.current?.stopScreenShare()}
          onOpenProfile={(uid) => {
            const peer =
              voicePeers.find((p) => p.user.id === uid)?.user ||
              members.find((m) => m.user.id === uid)?.user;
            if (peer) setProfileUser(peer);
          }}
        />
      )}
      {view.kind === "friends" && (
        <FriendsHome
          friends={friends}
          friendsSnap={friendsSnap}
          onRefreshFriends={refreshFriends}
          onOpenProfile={setProfileUser}
          onOpenDm={(u) => void handleOpenDm(u)}
        />
      )}
      {view.kind === "hosts" && (
        <GameHostsView
          gameHosts={gameHosts}
          localUserId={user.id}
          localDisplayName={user.display_name}
          activeServerId={activeServer?.id}
          canModerate={canModerate}
          onGameHostsChange={setGameHosts}
        />
      )}
      {view.kind === "settings" && (
        <SettingsView
          user={user}
          config={config}
          servers={servers}
          activeServer={activeServer}
          members={members}
          myRank={myRank}
          meta={_meta}
          onUser={onUser}
          onConfig={onConfig}
          onServersRefresh={() => void refreshServers()}
          onMembersRefresh={async () => {
            if (activeServer) setMembers(await listMembers(activeServer.id));
          }}
          onSetRank={(m, rank) => {
            if (!activeServer) return;
            void setMemberRank(activeServer.id, m.user.id, rank)
              .then(async () => setMembers(await listMembers(activeServer.id)))
              .catch((e) => pushToast(e instanceof Error ? e.message : "rank failed", "error"));
          }}
          onClose={() => setView(navMode === "home" ? { kind: "friends" } : { kind: "empty" })}
          onLogout={onLogout}
        />
      )}
      {view.kind === "empty" && (
        <div className="placeholder">
          <h2>Welcome to Neuro Connect</h2>
          <p className="muted">Pick Home for DMs, or select a server for channels.</p>
        </div>
      )}
    </>
  );

  return (
    <>
      <AppShell
        rail={
          <ServerRail
            navMode={navMode}
            servers={servers}
            activeServerId={activeServer?.id || null}
            serverUnread={serverUnread}
            onHome={() => void selectHome()}
            onSelectServer={(s) => void selectServer(s)}
            onCreateServer={() => setDialog({ type: "create-server" })}
            onJoinServer={() => setDialog({ type: "join-server" })}
          />
        }
        sidebar={
          <ChannelSidebar
            navMode={navMode}
            activeServer={activeServer}
            channels={channels}
            visibleDms={visibleDms}
            friends={friends}
            viewKind={view.kind}
            viewId={
              view.kind === "channel" || view.kind === "dm" || view.kind === "voice"
                ? view.id
                : undefined
            }
            voiceChannelId={voiceChannelId}
            user={user}
            canManageChannels={canManageChannels}
            voiceBar={
              voiceChannelId ? (
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
              ) : null
            }
            onOpenFriends={() => setView({ kind: "friends" })}
            onOpenHosts={() => setView({ kind: "hosts" })}
            onOpenDmView={(d) => setView({ kind: "dm", id: d.id, title: dmTitle(d) })}
            onCloseDm={closeDm}
            onOpenFriendDm={(u) => void handleOpenDm(u)}
            onOpenProfile={setProfileUser}
            onNewGroupDm={() => {
              setGroupName("");
              setGroupSelected(new Set());
              setDialog({ type: "group-dm" });
            }}
            onOpenChannel={(c) => setView({ kind: "channel", id: c.id, title: `# ${c.name}` })}
            onOpenVoice={(c) => setView({ kind: "voice", id: c.id, name: c.name })}
            onAddChannel={() => {
              if (!activeServer || !canManageChannels) {
                pushToast("Admin required to create channels", "error");
                return;
              }
              setDialog({ type: "channel-name", next: "create" });
            }}
            onRenameChannel={(c) => setDialog({ type: "rename-channel", channel: c })}
            onDeleteChannel={(c) => setDialog({ type: "delete-channel", channel: c })}
            onOpenSettings={() => setView({ kind: "settings" })}
            onRemoveFriend={(id) => {
              void removeFriend(id)
                .then(() => refreshFriends())
                .catch((err) =>
                  pushToast(err instanceof Error ? err.message : "failed", "error"),
                );
            }}
            onBlockFriend={(id) => {
              void blockUser(id)
                .then(() => refreshFriends())
                .catch((err) =>
                  pushToast(err instanceof Error ? err.message : "failed", "error"),
                );
            }}
          />
        }
        main={mainContent}
        aside={
          navMode === "server" ? (
            <MemberPanel
              members={members}
              myRank={myRank}
              localUserId={user.id}
              onOpenProfile={setProfileUser}
              onOpenDm={(u) => void handleOpenDm(u)}
              onSetRank={(m, rank) => {
                if (!activeServer) return;
                void setMemberRank(activeServer.id, m.user.id, rank)
                  .then(async () => setMembers(await listMembers(activeServer.id)))
                  .catch((e) =>
                    pushToast(e instanceof Error ? e.message : "rank failed", "error"),
                  );
              }}
            />
          ) : null
        }
      />

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

      <SharePicker
        open={sharePickerOpen}
        onClose={() => setSharePickerOpen(false)}
        onPickDisplay={() => void voiceRef.current?.startScreenShare()}
        mediaRelay={mediaRelay}
        serverId={activeServer?.id}
        channelId={voiceChannelId || (view.kind === "voice" ? view.id : null)}
        localUserId={user.id}
        canModerate={canModerate}
        onRelayChange={setMediaRelay}
      />

      {dialog?.type === "create-server" && (
        <PromptDialog
          title="Create server"
          label="Server name"
          confirmLabel="Create"
          onCancel={() => setDialog(null)}
          onConfirm={(name) => {
            setDialog(null);
            void createServer(name)
              .then(async (s) => {
                await refreshServers();
                await selectServer(s);
              })
              .catch((e) => pushToast(e instanceof Error ? e.message : "create failed", "error"));
          }}
        />
      )}
      {dialog?.type === "join-server" && (
        <PromptDialog
          title="Join server"
          label="Invite code"
          confirmLabel="Join"
          onCancel={() => setDialog(null)}
          onConfirm={(code) => {
            setDialog(null);
            void joinServer(code.trim())
              .then(async (s) => {
                await refreshServers();
                await selectServer(s);
              })
              .catch((e) => pushToast(e instanceof Error ? e.message : "join failed", "error"));
          }}
        />
      )}
      {dialog?.type === "channel-name" && (
        <PromptDialog
          title="New channel"
          label="Channel name"
          confirmLabel="Next"
          onCancel={() => setDialog(null)}
          onConfirm={(name) => setDialog({ type: "channel-kind", name })}
        />
      )}
      {dialog?.type === "channel-kind" && (
        <SelectDialog
          title="Channel type"
          label="Type"
          options={[
            { value: "text", label: "Text" },
            { value: "voice", label: "Voice" },
          ]}
          defaultValue="text"
          confirmLabel="Create"
          onCancel={() => setDialog(null)}
          onConfirm={(kindRaw) => {
            const name = dialog.name;
            setDialog(null);
            if (!activeServer) return;
            const kind = kindRaw === "voice" ? "voice" : "text";
            void createChannel(activeServer.id, name, kind)
              .then(async () => setChannels(await listChannels(activeServer.id)))
              .catch((e) => pushToast(e instanceof Error ? e.message : "channel failed", "error"));
          }}
        />
      )}
      {dialog?.type === "rename-channel" && (
        <PromptDialog
          title="Rename channel"
          label="Name"
          defaultValue={dialog.channel.name}
          confirmLabel="Rename"
          onCancel={() => setDialog(null)}
          onConfirm={(name) => {
            const ch = dialog.channel;
            setDialog(null);
            if (name === ch.name) return;
            void renameChannel(ch.id, name)
              .then(async () => {
                if (activeServer) setChannels(await listChannels(activeServer.id));
                if (view.kind === "channel" && view.id === ch.id) {
                  setView({ kind: "channel", id: ch.id, title: `# ${name}` });
                }
              })
              .catch((e) => pushToast(e instanceof Error ? e.message : "rename failed", "error"));
          }}
        />
      )}
      {dialog?.type === "delete-channel" && (
        <ConfirmDialog
          title="Delete channel"
          message={`Delete #${dialog.channel.name}?`}
          confirmLabel="Delete"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const ch = dialog.channel;
            setDialog(null);
            void deleteChannel(ch.id)
              .then(async () => {
                if (activeServer) setChannels(await listChannels(activeServer.id));
                if (view.kind === "channel" && view.id === ch.id) setView({ kind: "empty" });
                if (view.kind === "voice" && view.id === ch.id) setView({ kind: "empty" });
                if (voiceChannelId === ch.id) void leaveVoice();
              })
              .catch((e) => pushToast(e instanceof Error ? e.message : "delete failed", "error"));
          }}
        />
      )}
      {dialog?.type === "group-dm" && (
        <Modal title="New group DM" onClose={() => setDialog(null)} wide>
          <div className="nc-modal-fields">
            <label>
              Group name
              <input
                className="nc-input"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Friends"
              />
            </label>
            <div>
              <span className="muted">Select friends</span>
              <div className="nc-modal-list">
                {friends.length === 0 && (
                  <p className="muted" style={{ padding: 8 }}>
                    No friends yet
                  </p>
                )}
                {friends.map((f) => {
                  const selected = groupSelected.has(f.user.id);
                  return (
                    <button
                      key={f.user.id}
                      type="button"
                      className={`nc-modal-list-item${selected ? " selected" : ""}`}
                      onClick={() => {
                        setGroupSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.user.id)) next.delete(f.user.id);
                          else next.add(f.user.id);
                          return next;
                        });
                      }}
                    >
                      <input type="checkbox" readOnly checked={selected} />
                      {f.user.display_name}
                      <span className="muted">@{f.user.username}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="nc-modal-actions">
            <button type="button" className="ghost" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!groupName.trim() || groupSelected.size === 0}
              onClick={() => {
                const name = groupName.trim();
                const ids = [...groupSelected];
                setDialog(null);
                void createGroupDm(name, ids)
                  .then((g) => {
                    setDms((prev) => [g, ...prev.filter((d) => d.id !== g.id)]);
                    setView({ kind: "dm", id: g.id, title: dmTitle(g) });
                  })
                  .catch((e) =>
                    pushToast(e instanceof Error ? e.message : "group failed", "error"),
                  );
              }}
            >
              Create
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
