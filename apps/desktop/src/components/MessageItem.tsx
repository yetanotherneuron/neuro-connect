import { useState } from "react";
import type { MessageInfo, UserPublic } from "../lib/types";
import { ResolveAssetUrl } from "../lib/api";
import { AvatarImage } from "./Avatar";
import { useContextMenu } from "./ContextMenu";
import { EmojiPickerPopover } from "./EmojiPicker";
import { RenderMarkdown } from "./Markdown";
import "./MessageItem.css";

const QUICK_EMOJI = ["👍", "❤️", "😂", "🎉", "🔥"];

export function MessageItem({
  message,
  meId,
  grouped,
  highlighted,
  canDelete,
  onDelete,
  onEdit,
  onReact,
  onReply,
  onJumpToReply,
  onOpenProfile,
}: {
  message: MessageInfo;
  meId: string;
  grouped?: boolean;
  highlighted?: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onReact: (emoji: string) => void;
  onReply?: () => void;
  onJumpToReply?: (id: string) => void;
  onOpenProfile?: (user: UserPublic) => void;
}) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const { openContextMenu, contextMenuNode } = useContextMenu();
  const isMine = message.author.id === meId;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div
      id={`msg-${message.id}`}
      className={`msg${grouped ? " grouped" : ""}${highlighted ? " msg-highlight" : ""}`}
      onContextMenu={(e) =>
        openContextMenu(
          e,
          [
            { id: "profile", label: "View profile" },
            { id: "reply", label: "Reply", disabled: !onReply },
            { id: "edit", label: "Edit message", disabled: !isMine },
            { id: "react", label: "Add 👍" },
            { id: "delete", label: "Delete message", danger: true, disabled: !canDelete },
          ],
          (id) => {
            if (id === "delete" && canDelete) onDelete();
            if (id === "edit" && isMine) onEdit();
            if (id === "reply") onReply?.();
            if (id === "react") onReact("👍");
            if (id === "profile") onOpenProfile?.(message.author);
          },
        )
      }
    >
      <div className="msg-avatar-slot">
        {!grouped && (
          <button
            type="button"
            className="msg-avatar-btn"
            onClick={() => onOpenProfile?.(message.author)}
          >
            <AvatarImage user={message.author} size={36} />
          </button>
        )}
      </div>
      <div className="msg-body">
        <div className="msg-toolbar">
          {QUICK_EMOJI.slice(0, 3).map((e) => (
            <button key={e} type="button" title={e} onClick={() => onReact(e)}>
              {e}
            </button>
          ))}
          <button type="button" title="More emoji" onClick={() => setPickerOpen((v) => !v)}>
            +
          </button>
          {onReply && (
            <button type="button" title="Reply" onClick={onReply}>
              ↩
            </button>
          )}
          {isMine && (
            <button type="button" title="Edit" onClick={onEdit}>
              ✎
            </button>
          )}
          {canDelete && (
            <button type="button" className="danger" title="Delete" onClick={onDelete}>
              ×
            </button>
          )}
        </div>
        {pickerOpen && (
          <EmojiPickerPopover
            onPick={(emoji) => {
              onReact(emoji);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
        {!grouped && (
          <div className="msg-meta">
            <button
              type="button"
              className="msg-name"
              onClick={() => onOpenProfile?.(message.author)}
            >
              <strong>{message.author.display_name}</strong>
            </button>
            <span className="msg-user">@{message.author.username}</span>
            <span className="msg-time">{time}</span>
            {message.edited_at && <span className="msg-edited">(edited)</span>}
          </div>
        )}
        {message.reply_to && (
          <button
            type="button"
            className="msg-reply-bar"
            onClick={() => onJumpToReply?.(message.reply_to!.id)}
            title="Jump to replied message"
          >
            <strong>{message.reply_to.author_display_name}</strong>
            <span>{message.reply_to.content || "(attachment)"}</span>
          </button>
        )}
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
              <button
                key={e}
                type="button"
                className="msg-react-add"
                onClick={() => onReact(e)}
                title={e}
              >
                {e}
              </button>
            ))}
            <button
              type="button"
              className="msg-react-add"
              title="More"
              onClick={() => setPickerOpen(true)}
            >
              +
            </button>
          </div>
        </div>
      </div>
      {contextMenuNode}
    </div>
  );
}
