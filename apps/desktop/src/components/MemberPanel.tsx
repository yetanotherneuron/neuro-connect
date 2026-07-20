import type { MemberInfo, Rank, UserPublic } from "../lib/types";
import { AvatarImage } from "./Avatar";
import { useContextMenu } from "./ContextMenu";

const SETTABLE_RANKS: Rank[] = ["admin", "moderator", "member"];

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
  const canSetRank = myRank === "owner" || myRank === "admin";

  return (
    <aside className="member-panel">
      <div className="panel-head">
        <strong>Members</strong>
      </div>
      <div className="panel-scroll">
        {members.map((m) => {
          const canEdit =
            canSetRank && m.rank !== "owner" && m.user.id !== localUserId;

          return (
            <div key={m.user.id} className="member-row">
              <button
                type="button"
                className="member-name"
                onClick={() => onOpenProfile(m.user)}
                onContextMenu={(e) => {
                  const items = [
                    { id: "profile", label: "View profile" },
                    {
                      id: "dm",
                      label: "Message",
                      disabled: m.user.id === localUserId,
                    },
                    ...(canEdit
                      ? SETTABLE_RANKS.map((r) => ({
                          id: `rank:${r}`,
                          label: `Set rank: ${r}`,
                          disabled: m.rank === r,
                        }))
                      : []),
                  ];
                  openContextMenu(e, items, (id) => {
                    if (id === "profile") onOpenProfile(m.user);
                    if (id === "dm") onOpenDm(m.user);
                    if (id.startsWith("rank:")) {
                      onSetRank(m, id.slice(5) as Rank);
                    }
                  });
                }}
              >
                <AvatarImage user={m.user} size={28} />
                <span>
                  {m.user.display_name}
                  <span className="rank">{m.rank}</span>
                </span>
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="rank-chip"
                  title="Right-click member or use menu to set rank"
                  onClick={(e) => {
                    openContextMenu(
                      e,
                      SETTABLE_RANKS.map((r) => ({
                        id: `rank:${r}`,
                        label: `Set rank: ${r}`,
                        disabled: m.rank === r,
                      })),
                      (id) => {
                        if (id.startsWith("rank:")) {
                          onSetRank(m, id.slice(5) as Rank);
                        }
                      },
                    );
                  }}
                >
                  {m.rank}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {contextMenuNode}
    </aside>
  );
}
