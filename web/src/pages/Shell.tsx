import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, Button } from "@neuro-connect/ui";
import {
  connectRealtime,
  fetchFriends,
  listChannels,
  listDms,
  listServers,
  openDm,
  type ChannelInfo,
  type DmThread,
  type FriendEntry,
  type MessageInfo,
  type RealtimeClient,
  type ServerInfo,
  type UserPublic,
  type WsEvent,
} from "@neuro-connect/client-core";
import { Chat } from "../components/Chat";
import { Settings } from "../components/Settings";

type View =
  | { kind: "channel"; id: string; title: string }
  | { kind: "dm"; id: string; title: string }
  | { kind: "friends" }
  | { kind: "settings" }
  | { kind: "empty" };

function serverInitial(name: string) {
  return (name.trim()[0] || "?").toUpperCase();
}

function dmLabel(dm: DmThread) {
  if (dm.name) return dm.name;
  if (dm.peer) return dm.peer.display_name || dm.peer.username;
  return "Direct message";
}

export function Shell({
  user,
  onUser,
  onLogout,
}: {
  user: UserPublic;
  onUser: (u: UserPublic) => void;
  onLogout: () => void;
}) {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [activeServer, setActiveServer] = useState<ServerInfo | null>(null);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [dms, setDms] = useState<DmThread[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [view, setView] = useState<View>({ kind: "friends" });
  const [toast, setToast] = useState<string | null>(null);
  const [showNav, setShowNav] = useState(false);
  const realtimeRef = useRef<RealtimeClient | null>(null);

  const textChannels = useMemo(
    () => channels.filter((c) => c.kind === "text").sort((a, b) => a.position - b.position),
    [channels],
  );

  function showError(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  }

  async function loadHome() {
    setActiveServer(null);
    setChannels([]);
    setView({ kind: "friends" });
    try {
      const [dmList, snap] = await Promise.all([listDms(), fetchFriends()]);
      setDms(dmList);
      setFriends(snap.friends);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load home");
    }
  }

  async function selectServer(server: ServerInfo) {
    setActiveServer(server);
    setShowNav(true);
    try {
      const chs = await listChannels(server.id);
      setChannels(chs);
      const text = chs.find((c) => c.kind === "text");
      if (text) {
        setView({ kind: "channel", id: text.id, title: `# ${text.name}` });
        setShowNav(false);
      } else {
        setView({ kind: "empty" });
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load channels");
    }
  }

  async function openFriendDm(friend: FriendEntry) {
    try {
      const thread = await openDm(friend.user.id);
      setDms((prev) => (prev.some((d) => d.id === thread.id) ? prev : [thread, ...prev]));
      setActiveServer(null);
      setChannels([]);
      setView({ kind: "dm", id: thread.id, title: dmLabel(thread) });
      setShowNav(false);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to open DM");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listServers();
        if (!cancelled) setServers(list);
      } catch (e) {
        if (!cancelled) showError(e instanceof Error ? e.message : "Failed to load servers");
      }
      if (!cancelled) await loadHome();
    })();

    const rt = connectRealtime((raw) => {
      const data = raw as WsEvent;
      if (data.type === "message_created") {
        window.dispatchEvent(
          new CustomEvent("nc-web-message", { detail: { message: data.message as MessageInfo } }),
        );
      }
    });
    realtimeRef.current = rt;
    return () => {
      cancelled = true;
      rt?.close();
      realtimeRef.current = null;
    };
  }, []);

  if (view.kind === "settings") {
    return (
      <Settings
        user={user}
        onUser={onUser}
        onClose={() => setView(activeServer ? { kind: "empty" } : { kind: "friends" })}
        onLogout={onLogout}
      />
    );
  }

  const sidebarTitle = activeServer ? activeServer.name : "Home";

  return (
    <div className={`web-shell-wrap ${showNav ? "web-shell--show-nav" : ""}`} style={{ flex: 1, minHeight: 0, height: "100%" }}>
      <AppShell
        rail={
          <>
            <button
              type="button"
              className={`web-rail-btn web-rail-btn--home ${!activeServer ? "is-active" : ""}`}
              title="Home"
              onClick={() => {
                void loadHome();
                setShowNav(true);
              }}
            >
              NC
            </button>
            {servers.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`web-rail-btn ${activeServer?.id === s.id ? "is-active" : ""}`}
                title={s.name}
                onClick={() => void selectServer(s)}
              >
                {serverInitial(s.name)}
              </button>
            ))}
            <div className="web-rail-spacer" />
            <button
              type="button"
              className="web-rail-btn"
              title="Settings"
              onClick={() => setView({ kind: "settings" })}
            >
              …
            </button>
          </>
        }
        sidebar={
          <div className="web-sidebar">
            <div className="web-sidebar__head">{sidebarTitle}</div>
            <div className="web-sidebar__list">
              {activeServer ? (
                <>
                  <div className="web-sidebar__section">Text channels</div>
                  {textChannels.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`web-sidebar__item ${
                        view.kind === "channel" && view.id === c.id ? "is-active" : ""
                      }`}
                      onClick={() => {
                        setView({ kind: "channel", id: c.id, title: `# ${c.name}` });
                        setShowNav(false);
                      }}
                    >
                      # {c.name}
                    </button>
                  ))}
                  {textChannels.length === 0 && (
                    <p className="muted" style={{ padding: "8px 10px" }}>
                      No text channels
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="web-sidebar__section">Friends</div>
                  {friends.map((f) => (
                    <button
                      key={f.user.id}
                      type="button"
                      className="web-sidebar__item"
                      onClick={() => void openFriendDm(f)}
                    >
                      {f.user.display_name || f.user.username}
                      {f.online ? " · online" : ""}
                    </button>
                  ))}
                  {friends.length === 0 && (
                    <p className="muted" style={{ padding: "8px 10px" }}>
                      No friends yet
                    </p>
                  )}
                  <div className="web-sidebar__section">Direct messages</div>
                  {dms.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`web-sidebar__item ${
                        view.kind === "dm" && view.id === d.id ? "is-active" : ""
                      }`}
                      onClick={() => {
                        setView({ kind: "dm", id: d.id, title: dmLabel(d) });
                        setShowNav(false);
                      }}
                    >
                      {dmLabel(d)}
                    </button>
                  ))}
                </>
              )}
            </div>
            <div className="web-sidebar__foot">
              <span className="web-sidebar__user">{user.display_name || user.username}</span>
              <Button size="sm" variant="ghost" onClick={() => setView({ kind: "settings" })}>
                Settings
              </Button>
            </div>
          </div>
        }
        main={
          view.kind === "channel" || view.kind === "dm" ? (
            <Chat mode={view.kind} targetId={view.id} title={view.title} me={user} />
          ) : view.kind === "friends" ? (
            <div className="web-main-empty">
              <div>
                <h2 style={{ marginTop: 0 }}>Friends & DMs</h2>
                <p className="muted">
                  Pick a friend or DM from the sidebar, or open a server from the rail.
                </p>
                <Button variant="ghost" onClick={() => setShowNav(true)}>
                  Show sidebar
                </Button>
              </div>
            </div>
          ) : (
            <div className="web-main-empty">
              <p className="muted">Select a text channel to start chatting.</p>
            </div>
          )
        }
      />
      {toast && <div className="web-toast web-toast--error">{toast}</div>}
    </div>
  );
}
