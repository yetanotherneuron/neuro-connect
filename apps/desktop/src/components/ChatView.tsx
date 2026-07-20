import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteMessage,
  editMessage,
  listDmMessages,
  listMessages,
  reactMessage,
  searchChannelMessages,
  searchDmMessages,
  sendDmMessage,
  sendMessage,
  uploadFile,
} from "../lib/api";
import type { MessageInfo, ReactionInfo, UserPublic } from "../lib/types";
import { EmojiPickerPopover } from "./EmojiPicker";
import { PromptDialog } from "./Modal";
import { MessageItem } from "./MessageItem";
import { useToast } from "./Toast";
import "./ChatView.css";

const MAX_MB = 12;

function sameAuthorGroup(prev: MessageInfo | undefined, curr: MessageInfo): boolean {
  if (!prev) return false;
  if (prev.author.id !== curr.author.id) return false;
  const a = new Date(prev.created_at).getTime();
  const b = new Date(curr.created_at).getTime();
  return b - a < 5 * 60 * 1000;
}

export function ChatView({
  mode,
  targetId,
  me,
  title,
  onOpenProfile,
}: {
  mode: "channel" | "dm";
  targetId: string;
  me: UserPublic;
  title: string;
  onOpenProfile?: (user: UserPublic) => void;
}) {
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editTarget, setEditTarget] = useState<MessageInfo | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<MessageInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageInfo | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { pushToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setReplyTo(null);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchHits([]);
    (async () => {
      try {
        const msgs =
          mode === "channel" ? await listMessages(targetId) : await listDmMessages(targetId);
        if (!cancelled) setMessages(msgs);
      } catch (e) {
        if (!cancelled) pushToast(e instanceof Error ? e.message : "failed to load", "error");
      }
    })();

    const onMsg = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { message?: MessageInfo; type?: string };
      const msg = detail.message;
      if (!msg) return;
      const match =
        mode === "channel" ? msg.channel_id === targetId : msg.dm_id === targetId;
      if (!match) return;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msg.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = msg;
          return next;
        }
        return [...prev, msg];
      });
    };
    const onDel = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        message_id?: string;
        channel_id?: string;
        dm_id?: string;
      };
      const match =
        mode === "channel" ? detail.channel_id === targetId : detail.dm_id === targetId;
      if (match && detail.message_id) {
        setMessages((prev) => prev.filter((m) => m.id !== detail.message_id));
      }
    };
    const onReact = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        message_id?: string;
        channel_id?: string | null;
        dm_id?: string | null;
        reactions?: ReactionInfo[];
      };
      const match =
        mode === "channel" ? detail.channel_id === targetId : detail.dm_id === targetId;
      if (!match || !detail.message_id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === detail.message_id ? { ...m, reactions: detail.reactions || [] } : m,
        ),
      );
    };
    window.addEventListener("nc-message", onMsg);
    window.addEventListener("nc-message-deleted", onDel);
    window.addEventListener("nc-message-updated", onMsg);
    window.addEventListener("nc-message-reaction", onReact);
    return () => {
      cancelled = true;
      window.removeEventListener("nc-message", onMsg);
      window.removeEventListener("nc-message-deleted", onDel);
      window.removeEventListener("nc-message-updated", onMsg);
      window.removeEventListener("nc-message-reaction", onReact);
    };
  }, [mode, targetId, pushToast]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [messages]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      setSearching(true);
      const run =
        mode === "channel"
          ? searchChannelMessages(targetId, searchQuery.trim())
          : searchDmMessages(targetId, searchQuery.trim());
      void run
        .then(setSearchHits)
        .catch((e) => pushToast(e instanceof Error ? e.message : "search failed", "error"))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [searchQuery, mode, targetId, pushToast]);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const replyId = replyTo?.id;
      const msg =
        mode === "channel"
          ? await sendMessage(targetId, content, undefined, replyId)
          : await sendDmMessage(targetId, content, undefined, replyId);
      setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
      setText("");
      setReplyTo(null);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "send failed", "error");
    } finally {
      setSending(false);
    }
  }

  async function handleFile(file: File) {
    if (file.size > MAX_MB * 1024 * 1024) {
      pushToast(`File over ${MAX_MB} MB - paste a direct link instead.`, "error");
      return;
    }
    setUploading(true);
    try {
      const up = await uploadFile(file);
      const replyId = replyTo?.id;
      const msg =
        mode === "channel"
          ? await sendMessage(targetId, text.trim(), { url: up.url, name: up.name }, replyId)
          : await sendDmMessage(targetId, text.trim(), { url: up.url, name: up.name }, replyId);
      setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
      setText("");
      setReplyTo(null);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMessage(id);
      setMessages((m) => m.filter((x) => x.id !== id));
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "delete failed", "error");
    }
  }

  async function handleReact(id: string, emoji: string) {
    try {
      const updated = await reactMessage(id, emoji);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "react failed", "error");
    }
  }

  function canDelete(msg: MessageInfo) {
    if (me.is_global_admin) return true;
    if (mode === "dm") return true;
    return msg.author.id === me.id;
  }

  function jumpToLatest() {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setShowJump(false);
  }

  function jumpToMessage(id: string) {
    setHighlightId(id);
    const el = document.getElementById(`msg-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setHighlightId(null), 1400);
  }

  const grouped = useMemo(() => {
    return messages.map((m, i) => ({
      message: m,
      grouped: sameAuthorGroup(messages[i - 1], m),
    }));
  }, [messages]);

  return (
    <section className="chat app-fade">
      <header className="chat-header">
        <div className="chat-header-main">
          <h2>{title}</h2>
          <span className="muted">Markdown · spoilers ||like this|| · reactions</span>
        </div>
        <div className="chat-header-actions">
          {searchOpen ? (
            <div className="chat-search-wrap">
              <input
                className="nc-input"
                value={searchQuery}
                placeholder="Search messages…"
                autoFocus
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="button"
                className="ghost sm"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                  setSearchHits([]);
                }}
              >
                Close
              </button>
            </div>
          ) : (
            <button type="button" className="ghost sm" onClick={() => setSearchOpen(true)}>
              Search
            </button>
          )}
        </div>
      </header>
      <div className="chat-body">
        <div className="chat-messages" ref={listRef}>
          {grouped.map(({ message: m, grouped: isGrouped }) => (
            <MessageItem
              key={m.id}
              message={m}
              meId={me.id}
              grouped={isGrouped}
              highlighted={highlightId === m.id}
              canDelete={canDelete(m)}
              onDelete={() => void handleDelete(m.id)}
              onEdit={() => setEditTarget(m)}
              onReact={(emoji) => void handleReact(m.id, emoji)}
              onReply={() => setReplyTo(m)}
              onJumpToReply={jumpToMessage}
              onOpenProfile={onOpenProfile}
            />
          ))}
          <div ref={bottomRef} />
        </div>
        {searchOpen && (
          <aside className="chat-search-panel">
            <h3>{searching ? "Searching…" : `Results (${searchHits.length})`}</h3>
            <div className="chat-search-results">
              {!searchQuery.trim() && <p className="muted">Type to search this chat.</p>}
              {searchQuery.trim() && searchHits.length === 0 && !searching && (
                <p className="muted">No matches</p>
              )}
              {searchHits.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="chat-search-hit"
                  onClick={() => jumpToMessage(hit.id)}
                >
                  <strong>{hit.author.display_name}</strong>
                  <span>{hit.content || hit.attachment_name || "(attachment)"}</span>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
      {showJump && (
        <button type="button" className="chat-jump-bar" onClick={jumpToLatest}>
          Jump to latest
        </button>
      )}
      <div className="chat-composer">
        {replyTo && (
          <div className="chat-reply-strip">
            <div className="chat-reply-strip-text">
              <strong>Replying to {replyTo.author.display_name}</strong>
              <span className="muted">
                {replyTo.content || replyTo.attachment_name || "(attachment)"}
              </span>
            </div>
            <button
              type="button"
              className="ghost sm"
              title="Cancel reply"
              onClick={() => setReplyTo(null)}
            >
              ×
            </button>
          </div>
        )}
        <div className="chat-composer-inner">
          <button
            type="button"
            className="icon-btn sm"
            title="Upload (max 12 MB)"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            +
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <textarea
            className="nc-input"
            value={text}
            placeholder={`Message ${title}`}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="chat-composer-emoji">
            <button
              type="button"
              className="icon-btn sm"
              title="Emoji"
              onClick={() => setEmojiOpen((v) => !v)}
            >
              ☺
            </button>
            {emojiOpen && (
              <EmojiPickerPopover
                onPick={(emoji) => {
                  setText((t) => t + emoji);
                  setEmojiOpen(false);
                }}
                onClose={() => setEmojiOpen(false)}
              />
            )}
          </div>
          <button type="button" className="primary sm" disabled={sending} onClick={() => void handleSend()}>
            Send
          </button>
        </div>
      </div>

      {editTarget && (
        <PromptDialog
          title="Edit message"
          label="Content"
          defaultValue={editTarget.content}
          confirmLabel="Save"
          onCancel={() => setEditTarget(null)}
          onConfirm={(next) => {
            const msg = editTarget;
            setEditTarget(null);
            if (next.trim() === msg.content) return;
            void editMessage(msg.id, next.trim())
              .then((updated) => {
                setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
              })
              .catch((e) => pushToast(e instanceof Error ? e.message : "edit failed", "error"));
          }}
        />
      )}
    </section>
  );
}
