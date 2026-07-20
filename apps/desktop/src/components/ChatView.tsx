import { useEffect, useRef, useState } from "react";
import {
  deleteMessage,
  editMessage,
  listDmMessages,
  listMessages,
  reactMessage,
  sendDmMessage,
  sendMessage,
  uploadFile,
} from "../lib/api";
import type { MessageInfo, ReactionInfo, UserPublic } from "../lib/types";
import { useToast } from "./Toast";
import { MessageItem } from "./MessageItem";

const MAX_MB = 12;

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { pushToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
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
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const msg =
        mode === "channel"
          ? await sendMessage(targetId, content)
          : await sendDmMessage(targetId, content);
      setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
      setText("");
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
      const msg =
        mode === "channel"
          ? await sendMessage(targetId, text.trim(), { url: up.url, name: up.name })
          : await sendDmMessage(targetId, text.trim(), { url: up.url, name: up.name });
      setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
      setText("");
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

  async function handleEdit(msg: MessageInfo) {
    const next = prompt("Edit message", msg.content);
    if (next == null || next.trim() === msg.content) return;
    try {
      const updated = await editMessage(msg.id, next.trim());
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "edit failed", "error");
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

  return (
    <section className="chat app-fade">
      <header className="chat-header">
        <h2>{title}</h2>
        <span className="muted">Markdown · spoilers ||like this|| · reactions</span>
      </header>
      <div className="chat-messages" ref={listRef}>
        {messages.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            meId={me.id}
            canDelete={canDelete(m)}
            onDelete={() => void handleDelete(m.id)}
            onEdit={() => void handleEdit(m)}
            onReact={(emoji) => void handleReact(m.id, emoji)}
            onOpenProfile={onOpenProfile}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input">
        <button
          type="button"
          className="icon-btn"
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
        <button type="button" className="primary" disabled={sending} onClick={() => void handleSend()}>
          Send
        </button>
      </div>
    </section>
  );
}
