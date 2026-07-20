import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@neuro-connect/ui";
import {
  listDmMessages,
  listMessages,
  sendDmMessage,
  sendMessage,
  type MessageInfo,
  type UserPublic,
} from "@neuro-connect/client-core";
import "./Chat.css";

export function Chat({
  mode,
  targetId,
  title,
  me,
}: {
  mode: "channel" | "dm";
  targetId: string;
  title: string;
  me: UserPublic;
}) {
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setError(null);
    void (async () => {
      try {
        const msgs =
          mode === "channel" ? await listMessages(targetId) : await listDmMessages(targetId);
        if (!cancelled) setMessages(msgs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load messages");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, targetId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const onCreated = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { message?: MessageInfo };
      const msg = detail.message;
      if (!msg) return;
      const match = mode === "channel" ? msg.channel_id === targetId : msg.dm_id === targetId;
      if (!match) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    window.addEventListener("nc-web-message", onCreated);
    return () => window.removeEventListener("nc-web-message", onCreated);
  }, [mode, targetId]);

  async function handleSend() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      const msg =
        mode === "channel"
          ? await sendMessage(targetId, content)
          : await sendDmMessage(targetId, content);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="web-chat">
      <header className="web-chat__head">
        <h2>{title}</h2>
      </header>
      <div className="web-chat__list">
        {error && <p className="web-chat__error">{error}</p>}
        {messages.length === 0 && !error && (
          <p className="muted web-chat__empty">No messages yet. Say hello.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="web-chat__msg">
            <div className="web-chat__meta">
              <strong>{m.author.display_name || m.author.username}</strong>
              <time dateTime={m.created_at}>
                {new Date(m.created_at).toLocaleString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })}
              </time>
              {m.author.id === me.id && <span className="muted">you</span>}
            </div>
            <p className="web-chat__body">{m.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        className="web-chat__composer"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message ${title}`}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !text.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
