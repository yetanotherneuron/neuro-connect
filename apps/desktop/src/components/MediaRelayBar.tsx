import { useEffect, useRef, useState } from "react";
import {
  fetchMediaStatus,
  mediaStreamUrl,
  startMediaRelay,
  stopMediaRelay,
} from "../lib/api";
import type { MediaRelayInfo } from "../lib/types";
import { useToast } from "./Toast";
import "./MediaRelayBar.css";

function isVideo(ct: string | null | undefined, title: string) {
  const c = (ct || "").toLowerCase();
  if (c.startsWith("video/")) return true;
  const t = title.toLowerCase();
  return [".mp4", ".webm", ".mkv", ".mov", ".m3u8"].some((ext) => t.endsWith(ext));
}

export function MediaRelayBar({
  relay,
  serverId,
  channelId,
  localUserId,
  canModerate,
  onRelayChange,
}: {
  relay: MediaRelayInfo | null;
  serverId?: string | null;
  channelId?: string | null;
  localUserId: string;
  canModerate: boolean;
  onRelayChange: (relay: MediaRelayInfo | null) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const { pushToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const st = await fetchMediaStatus();
        if (!cancelled && st.relay) onRelayChange(st.relay);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onRelayChange]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !relay) return;
    el.src = mediaStreamUrl(relay.stream_path);
    void el.play().catch(() => {
      /* user gesture may be required */
    });
  }, [relay]);

  async function handleStart() {
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const info = await startMediaRelay({
        url: trimmed,
        channel_id: channelId || null,
        server_id: serverId || null,
      });
      onRelayChange(info);
      setUrl("");
      pushToast("Media relay started", "success");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "failed to start relay", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (busy) return;
    setBusy(true);
    try {
      await stopMediaRelay();
      onRelayChange(null);
      pushToast("Media relay stopped", "success");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "failed to stop", "error");
    } finally {
      setBusy(false);
    }
  }

  const canStop =
    !!relay &&
    (relay.started_by.id === localUserId || canModerate);

  return (
    <div className="media-relay-bar">
      {relay ? (
        <div className="media-relay-active">
          <div className="media-relay-meta">
            <strong>{relay.title}</strong>
            <span className="muted">
              via server · started by {relay.started_by.display_name}
            </span>
          </div>
          {isVideo(relay.content_type, relay.title) ? (
            <video
              ref={(el) => {
                mediaRef.current = el;
              }}
              className="media-relay-player video"
              controls
              playsInline
            />
          ) : (
            <audio
              ref={(el) => {
                mediaRef.current = el;
              }}
              className="media-relay-player"
              controls
            />
          )}
          {canStop && (
            <button type="button" className="danger sm" disabled={busy} onClick={() => void handleStop()}>
              Stop relay
            </button>
          )}
        </div>
      ) : (
        <div className="media-relay-form">
          <label className="media-relay-label" htmlFor="media-relay-url">
            Stream media via server
          </label>
          <div className="media-relay-row">
            <input
              id="media-relay-url"
              className="nc-input"
              type="url"
              placeholder="https://…/track.mp3 or video.mp4"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleStart();
              }}
            />
            <button
              type="button"
              className="primary sm"
              disabled={busy || !url.trim()}
              onClick={() => void handleStart()}
            >
              {busy ? "…" : "Relay"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
