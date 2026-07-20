import type { ServerInfo } from "../lib/types";

export function ServerRail({
  navMode,
  servers,
  activeServerId,
  serverUnread,
  onHome,
  onSelectServer,
  onCreateServer,
  onJoinServer,
}: {
  navMode: "home" | "server";
  servers: ServerInfo[];
  activeServerId: string | null;
  serverUnread?: Record<string, number>;
  onHome: () => void;
  onSelectServer: (s: ServerInfo) => void;
  onCreateServer: () => void;
  onJoinServer: () => void;
}) {
  return (
    <aside className="server-rail">
      <button
        type="button"
        className={`server-btn home ${navMode === "home" ? "active" : ""}`}
        title="Home"
        onClick={onHome}
      >
        NC
      </button>
      <div className="rail-sep" />
      {servers.map((s) => {
        const unread = serverUnread?.[s.id] || 0;
        return (
          <button
            key={s.id}
            type="button"
            className={`server-btn ${navMode === "server" && activeServerId === s.id ? "active" : ""}`}
            title={s.name}
            onClick={() => onSelectServer(s)}
          >
            {unread > 0 && <span className="unread-pill" aria-hidden />}
            {s.name.slice(0, 2).toUpperCase()}
          </button>
        );
      })}
      <button type="button" className="server-btn add" title="Create server" onClick={onCreateServer}>
        +
      </button>
      <button type="button" className="server-btn add" title="Join server" onClick={onJoinServer}>
        ↓
      </button>
    </aside>
  );
}
