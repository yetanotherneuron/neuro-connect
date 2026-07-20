import type { MessageInfo, UserPublic } from "../lib/types";
import { AvatarImage } from "./Avatar";
import { useContextMenu } from "./ContextMenu";
import { RenderMarkdown } from "./Markdown";
import { ResolveAssetUrl } from "../lib/api";

const QUICK_EMOJI = ["👍", "❤️", "😂", "🎉", "🔥"];

export function MessageItem({
  message,
  meId,
  canDelete,
  onDelete,
  onEdit,
  onReact,
  onOpenProfile,
}: {
  message: MessageInfo;
  meId: string;
  canDelete: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onReact: (emoji: string) => void;
  onOpenProfile?: (user: UserPublic) => void;
}) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const { openContextMenu, contextMenuNode } = useContextMenu();
  const isMine = message.author.id === meId;

  return (
    <div
      className="msg"
      onContextMenu={(e) =>
        openContextMenu(
          e,
          [
            { id: "profile", label: "View profile" },
            { id: "edit", label: "Edit message", disabled: !isMine },
            { id: "react", label: "Add 👍" },
            { id: "delete", label: "Delete message", danger: true, disabled: !canDelete },
          ],
          (id) => {
            if (id === "delete" && canDelete) onDelete();
            if (id === "edit" && isMine) onEdit();
            if (id === "react") onReact("👍");
            if (id === "profile") onOpenProfile?.(message.author);
          },
        )
      }
    >
      <button type="button" className="msg-avatar-btn" onClick={() => onOpenProfile?.(message.author)}>
        <AvatarImage user={message.author} size={36} />
      </button>
      <div className="msg-body">
        <div className="msg-meta">
          <button type="button" className="msg-name" onClick={() => onOpenProfile?.(message.author)}>
            <strong>{message.author.display_name}</strong>
          </button>
          <span className="msg-user">@{message.author.username}</span>
          <span className="msg-time">{time}</span>
          {message.edited_at && <span className="msg-edited">(edited)</span>}
        </div>
        {message.content && <RenderMarkdown content={message.content} />}
        {message.attachment_url && (
          <a
            className="msg-file"
            href={ResolveAssetUrl(message.attachment_url)}
            target="_blank"
            rel="noreferrer"
          >
            {message.attachment_name || "attachment"}
          </a>
        )}
        <div className="msg-reactions">
          {(message.reactions || []).map((r) => (
            <button
              key={r.emoji}
              type="button"
              className={`msg-reaction ${r.reacted_by_me ? "mine" : ""}`}
              onClick={() => onReact(r.emoji)}
            >
              {r.emoji} {r.count}
            </button>
          ))}
          <div className="msg-react-quick">
            {QUICK_EMOJI.map((e) => (
              <button key={e} type="button" className="msg-react-add" onClick={() => onReact(e)} title={e}>
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
      {contextMenuNode}
    </div>
  );
}
