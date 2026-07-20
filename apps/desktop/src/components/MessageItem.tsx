import type { MessageInfo, UserPublic } from "../lib/types";
import { AvatarImage } from "./Avatar";
import { useContextMenu } from "./ContextMenu";
import { RenderMarkdown } from "./Markdown";
import { ResolveAssetUrl } from "../lib/api";

export function MessageItem({
  message,
  canDelete,
  onDelete,
  onOpenProfile,
}: {
  message: MessageInfo;
  canDelete: boolean;
  onDelete: () => void;
  onOpenProfile?: (user: UserPublic) => void;
}) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const { openContextMenu, contextMenuNode } = useContextMenu();

  return (
    <div
      className="msg"
      onContextMenu={(e) =>
        openContextMenu(
          e,
          [
            { id: "profile", label: "View profile" },
            { id: "delete", label: "Delete message", danger: true, disabled: !canDelete },
          ],
          (id) => {
            if (id === "delete" && canDelete) onDelete();
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
      </div>
      {contextMenuNode}
    </div>
  );
}
