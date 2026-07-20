import { useMemo, useState, type ReactNode } from "react";
import {
  acceptFriendRequest,
  blockUser,
  declineFriendRequest,
  ignoreUser,
  removeFriend,
  sendFriendRequest,
  unblockUser,
  unignoreUser,
} from "../lib/api";
import type {
  FriendEntry,
  FriendRequestInfo,
  FriendsSnapshot,
  UserPublic,
} from "../lib/types";
import { AvatarImage } from "./Avatar";
import { useToast } from "./Toast";
import "./FriendsHome.css";

export type FriendsTab = "online" | "all" | "pending" | "blocked" | "add";

const TABS: { id: FriendsTab; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "blocked", label: "Blocked" },
  { id: "add", label: "Add Friend" },
];

export function FriendsHome({
  friends,
  friendsSnap,
  onRefreshFriends,
  onOpenProfile,
  onOpenDm,
}: {
  friends: FriendEntry[];
  friendsSnap: FriendsSnapshot | null;
  onRefreshFriends: () => Promise<void>;
  onOpenProfile: (u: UserPublic) => void;
  onOpenDm: (u: UserPublic) => void;
}) {
  const [tab, setTab] = useState<FriendsTab>("online");
  const [friendUsername, setFriendUsername] = useState("");
  const { pushToast } = useToast();

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
