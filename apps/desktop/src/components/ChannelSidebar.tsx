import type { ReactNode } from "react";
import type { ChannelInfo, DmThread, FriendEntry, ServerInfo, UserPublic } from "../lib/types";
import { AvatarImage } from "./Avatar";
import { useContextMenu } from "./ContextMenu";

function dmTitle(d: DmThread) {
  if (d.kind === "group" || d.name) return d.name || "Group";
  return `@ ${d.peer?.display_name || "DM"}`;
}

export function ChannelSidebar({
  navMode,
  activeServer,
  channels,
  visibleDms,
  friends,
  viewKind,
  viewId,
  voiceChannelId,
  user,
  canManageChannels,
  voiceBar,
  onOpenFriends,
  onOpenHosts,
  onOpenDmView,
  onCloseDm,
  onOpenFriendDm,
  onOpenProfile,
  onNewGroupDm,
  onOpenChannel,
  onOpenVoice,
  onAddChannel,
  onRenameChannel,
  onDeleteChannel,
  onOpenSettings,
  onRemoveFriend,
  onBlockFriend,
}: {
  navMode: "home" | "server";
  activeServer: ServerInfo | null;
  channels: ChannelInfo[];
  visibleDms: DmThread[];
  friends: FriendEntry[];
  viewKind: string;
  viewId?: string;
  voiceChannelId: string | null;
  user: UserPublic;
  canManageChannels: boolean;
  voiceBar?: ReactNode;
  onOpenFriends: () => void;
  onOpenHosts: () => void;
  onOpenDmView: (d: DmThread) => void;
  onCloseDm: (id: string) => void;
  onOpenFriendDm: (u: UserPublic) => void;
  onOpenProfile: (u: UserPublic) => void;
  onNewGroupDm: () => void;
  onOpenChannel: (c: ChannelInfo) => void;
  onOpenVoice: (c: ChannelInfo) => void;
  onAddChannel: () => void;
  onRenameChannel: (c: ChannelInfo) => void;
  onDeleteChannel: (c: ChannelInfo) => void;
  onOpenSettings: () => void;
  onRemoveFriend: (id: string) => void;
  onBlockFriend: (id: string) => void;
}) {
  const { openContextMenu, contextMenuNode } = useContextMenu();

  return (
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
              {visibleDms.map((d) => {
                const unread = d.unread_count || 0;
                return (
                  <div key={d.id} className="nav-row">
                    <button
                      type="button"
                      className={`nav-item with-avatar ${viewKind === "dm" && viewId === d.id ? "active" : ""} ${unread ? "unread" : ""}`}
                      onClick={() => onOpenDmView(d)}
                      onContextMenu={(e) =>
                        openContextMenu(
                          e,
                          [
                            { id: "profile", label: "View profile", disabled: !d.peer },
                            { id: "close", label: "Close DM", danger: true },
                          ],
                          (id) => {
                            if (id === "profile" && d.peer) onOpenProfile(d.peer);
                            if (id === "close") onCloseDm(d.id);
                          },
                        )
                      }
                    >
                      {unread > 0 && <span className="unread-pill" aria-hidden />}
                      {d.peer ? (
                        <AvatarImage user={d.peer} size={24} />
                      ) : (
                        <span className="group-dm-icon">#</span>
                      )}
                      <span>{dmTitle(d)}</span>
                      {unread > 0 && (
                        <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="nav-close"
                      title="Close DM"
                      onClick={() => onCloseDm(d.id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button type="button" className="nav-item muted" onClick={onNewGroupDm}>
                + New group DM
              </button>
            </div>
            <div className="panel-section">
              <button
                type="button"
                className={`nav-item ${viewKind === "friends" ? "active" : ""}`}
                onClick={onOpenFriends}
              >
                Friends
              </button>
              <button
                type="button"
                className={`nav-item ${viewKind === "hosts" ? "active" : ""}`}
                onClick={onOpenHosts}
              >
                Game Hosts
              </button>
            </div>
            <div className="panel-section">
              <div className="section-label">
                Friends
                <button type="button" onClick={onOpenFriends}>
                  All
                </button>
              </div>
              {friends.length === 0 && <p className="panel-empty">No friends yet</p>}
              {friends.slice(0, 12).map((f) => (
                <button
                  key={f.user.id}
                  type="button"
                  className={`nav-item with-avatar ${f.online ? "online" : ""}`}
                  onClick={() => onOpenFriendDm(f.user)}
                  onContextMenu={(e) =>
                    openContextMenu(
                      e,
                      [
                        { id: "message", label: "Message" },
                        { id: "profile", label: "View profile" },
                        { id: "remove", label: "Remove friend", danger: true },
                        { id: "block", label: "Block", danger: true },
                      ],
                      (id) => {
                        if (id === "message") onOpenFriendDm(f.user);
                        if (id === "profile") onOpenProfile(f.user);
                        if (id === "remove") onRemoveFriend(f.user.id);
                        if (id === "block") onBlockFriend(f.user.id);
                      },
                    )
                  }
                >
                  <AvatarImage user={f.user} size={24} />
                  <span>
                    {f.user.display_name}
                    {f.online ? " · online" : ""}
                  </span>
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
                <button type="button" onClick={onAddChannel}>
                  +
                </button>
              </div>
              {channels
                .filter((c) => c.kind === "text")
                .map((c) => {
                  const unread = c.unread_count || 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`nav-item ${viewKind === "channel" && viewId === c.id ? "active" : ""} ${unread ? "unread" : ""}`}
                      onClick={() => onOpenChannel(c)}
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
                            if (id === "rename") onRenameChannel(c);
                            if (id === "delete") onDeleteChannel(c);
                          },
                        )
                      }
                    >
                      {unread > 0 && <span className="unread-pill" aria-hidden />}
                      # {c.name}
                      {unread > 0 && (
                        <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>
                      )}
                    </button>
                  );
                })}
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
                    onClick={() => onOpenVoice(c)}
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
                          if (id === "rename") onRenameChannel(c);
                          if (id === "delete") onDeleteChannel(c);
                        },
                      )
                    }
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
        {voiceBar}
        <div className="user-chip-row">
          <button type="button" className="user-chip" onClick={() => onOpenProfile(user)}>
            <AvatarImage user={user} size={32} />
            <div>
              <strong>
                {user.display_name}
                {user.is_global_admin && <span className="admin-badge"> GA</span>}
              </strong>
              <div className="muted">@{user.username}</div>
            </div>
          </button>
          <button type="button" className="icon-btn sm" title="Settings" onClick={onOpenSettings}>
            ⚙
          </button>
        </div>
      </div>
      {contextMenuNode}
    </aside>
  );
}

export { dmTitle };
