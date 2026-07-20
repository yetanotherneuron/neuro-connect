import type { MemberInfo, Rank, UserPublic } from "../lib/types";
import { AvatarImage } from "./Avatar";
import { useContextMenu } from "./ContextMenu";

export function MemberPanel({
  members,
  myRank,
  localUserId,
  onOpenProfile,
  onOpenDm,
  onSetRank,
}: {
  members: MemberInfo[];
  myRank?: Rank;
  localUserId: string;
  onOpenProfile: (u: UserPublic) => void;
  onOpenDm: (u: UserPublic) => void;
  onSetRank: (member: MemberInfo, rank: Rank) => void;
}) {
  const { openContextMenu, contextMenuNode } = useContextMenu();

  return (
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
              onClick={() => onOpenProfile(m.user)}
              onContextMenu={(e) =>
                openContextMenu(
                  e,
                  [
                    { id: "profile", label: "View profile" },
                    {
                      id: "dm",
                      label: "Message",
                      disabled: m.user.id === localUserId,
                    },
                  ],
                  (id) => {
                    if (id === "profile") onOpenProfile(m.user);
                    if (id === "dm") onOpenDm(m.user);
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
              m.user.id !== localUserId && (
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
          </div>
        ))}
      </div>
      {contextMenuNode}
    </aside>
  );
}
