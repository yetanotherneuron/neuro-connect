import { useState } from "react";
import { Modal } from "./Modal";
import { MediaRelayBar } from "./MediaRelayBar";
import type { MediaRelayInfo } from "../lib/types";
import "./SharePicker.css";

type ShareTab = "apps" | "windows" | "url";

export function SharePicker({
  open,
  onClose,
  onPickDisplay,
  mediaRelay,
  serverId,
  channelId,
  localUserId,
  canModerate,
  onRelayChange,
}: {
  open: boolean;
  onClose: () => void;
  onPickDisplay: () => void;
  mediaRelay: MediaRelayInfo | null;
  serverId?: string | null;
  channelId?: string | null;
  localUserId: string;
  canModerate: boolean;
  onRelayChange: (r: MediaRelayInfo | null) => void;
}) {
  const [tab, setTab] = useState<ShareTab>("windows");

  if (!open) return null;

  return (
    <Modal title="Share" onClose={onClose} wide>
      <div className="share-picker">
        <nav className="share-tabs" aria-label="Share source">
          {(
            [
              ["apps", "Apps"],
              ["windows", "Windows"],
              ["url", "URL"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`share-tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {(tab === "apps" || tab === "windows") && (
          <div className="share-panel">
            <p className="muted">
              {tab === "apps"
                ? "Share a specific application window. The OS picker lets you choose the app."
                : "Share a monitor or window. Optional desktop audio is available when the OS provides it."}
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                onPickDisplay();
                onClose();
              }}
            >
              Open system picker
            </button>
          </div>
        )}

        {tab === "url" && (
          <div className="share-panel">
            <p className="muted">
              Paste a direct audio/video URL. The server relays it so everyone plays from one source.
            </p>
            <MediaRelayBar
              relay={mediaRelay}
              serverId={serverId}
              channelId={channelId}
              localUserId={localUserId}
              canModerate={canModerate}
              onRelayChange={onRelayChange}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
