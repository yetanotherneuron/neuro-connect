import { useEffect, useRef } from "react";
import { AvatarImage } from "../components/Avatar";
import { useContextMenu } from "../components/ContextMenu";
import type { ChannelInfo, VoicePeerInfo } from "../lib/types";
import "./VoicePanel.css";

export function VoicePanel({
  channelName,
  channelId,
  connected,
  connecting,
  peers,
  localUserId,
  localMuted,
  localDeafened,
  pttMode,
  pttHeld,
  canMove,
  voiceChannels,
  screenSharing,
  localScreenSharing,
  screenSharerId,
  screenStream,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onMutePeer,
  onMovePeer,
  onOpenProfile,
  onOpenSharePicker,
  onStopScreenShare,
}: {
  channelName: string;
  channelId: string;
  connected: boolean;
  connecting: boolean;
  peers: VoicePeerInfo[];
  localUserId: string;
  localMuted: boolean;
  localDeafened: boolean;
  pttMode: boolean;
  pttHeld: boolean;
  canMove: boolean;
  voiceChannels: ChannelInfo[];
  screenSharing: boolean;
  localScreenSharing: boolean;
  screenSharerId: string | null;
  screenStream: MediaStream | null;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onMutePeer: (userId: string, muted: boolean) => void;
  onMovePeer: (userId: string, toChannelId: string) => void;
  onOpenProfile: (userId: string) => void;
  onOpenSharePicker: () => void;
  onStopScreenShare: () => void;
}) {
  const { openContextMenu, contextMenuNode } = useContextMenu();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = screenStream;
    if (screenStream) {
      void el.play().catch(() => {
        /* autoplay may be blocked until gesture */
      });
    }
  }, [screenStream]);

  const sharer = screenSharerId
    ? peers.find((p) => p.user.id === screenSharerId)
    : null;
  const sharerLabel = localScreenSharing
    ? "You"
    : sharer?.user.display_name || "Someone";

  return (
    <div className="voice-panel app-fade">
      <header className="chat-header">
        <h2>◉ {channelName}</h2>
        <span className="muted">
          {connected
            ? `${peers.length} connected · ${pttMode ? "Push to talk" : "Open mic"}`
            : "Not connected"}
        </span>
      </header>

      {connected && screenSharing && screenStream && (
        <div className="voice-screen-share">
          <div className="voice-screen-label">
            <span className="voice-screen-dot" />
            {sharerLabel} is sharing screen
          </div>
          <video
            ref={videoRef}
            className="voice-screen-video"
            autoPlay
            playsInline
            muted={localScreenSharing}
          />
        </div>
      )}

      <div className="voice-peers">
        {!connected && (
          <p className="muted voice-empty">Join this channel to talk with others.</p>
        )}
        {connected &&
          peers.map((p) => {
            const isSelf = p.user.id === localUserId;
            const isSharing = screenSharerId === p.user.id;
            return (
              <button
                key={p.user.id}
                type="button"
                className={`voice-peer ${p.speaking ? "speaking" : ""} ${p.muted ? "muted-peer" : ""} ${isSharing ? "sharing" : ""}`}
                onClick={() => onOpenProfile(p.user.id)}
                onContextMenu={(e) => {
                  if (isSelf) return;
                  const otherVoice = voiceChannels.filter((c) => c.id !== channelId);
                  openContextMenu(
                    e,
                    [
                      { id: "mute", label: "Mute for me" },
                      { id: "unmute", label: "Unmute for me" },
                      ...otherVoice.map((c) => ({
                        id: `move:${c.id}`,
                        label: `Move to ${c.name}`,
                        disabled: !canMove,
                      })),
                    ],
                    (id) => {
                      if (id === "mute") onMutePeer(p.user.id, true);
                      if (id === "unmute") onMutePeer(p.user.id, false);
                      if (id.startsWith("move:")) onMovePeer(p.user.id, id.slice(5));
                    },
                  );
                }}
              >
                <AvatarImage user={p.user} size={56} />
                <div className="voice-peer-meta">
                  <strong>
                    {p.user.display_name}
                    {isSelf ? " (you)" : ""}
                  </strong>
                  <span className="muted">
                    {isSharing
                      ? "Sharing screen"
                      : p.deafened
                        ? "Deafened"
                        : p.muted
                          ? "Muted"
                          : p.speaking
                            ? "Speaking"
                            : "Idle"}
                  </span>
                </div>
              </button>
            );
          })}
      </div>

      <div className="voice-controls">
        {!connected ? (
          <button type="button" className="primary" disabled={connecting} onClick={onJoin}>
            {connecting ? "Connecting…" : "Join Voice"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={localMuted ? "danger" : "ghost"}
              onClick={onToggleMute}
              title="Mute"
            >
              {localMuted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              className={localDeafened ? "danger" : "ghost"}
              onClick={onToggleDeafen}
              title="Deafen"
            >
              {localDeafened ? "Undeafen" : "Deafen"}
            </button>
            {localScreenSharing ? (
              <button type="button" className="danger" onClick={onStopScreenShare}>
                Stop sharing
              </button>
            ) : (
              <button
                type="button"
                className="ghost"
                onClick={onOpenSharePicker}
                title="Share — Apps, Windows, or URL"
              >
                Share
              </button>
            )}
            {pttMode && (
              <span className={`ptt-indicator ${pttHeld ? "held" : ""}`}>
                PTT {pttHeld ? "OPEN" : "hold key"}
              </span>
            )}
            <button type="button" className="danger" onClick={onLeave}>
              Disconnect
            </button>
          </>
        )}
      </div>
      {contextMenuNode}
    </div>
  );
}

export function VoiceConnectedBar({
  channelName,
  muted,
  deafened,
  sharing,
  onMute,
  onDeafen,
  onLeave,
  onOpen,
}: {
  channelName: string;
  muted: boolean;
  deafened: boolean;
  sharing?: boolean;
  onMute: () => void;
  onDeafen: () => void;
  onLeave: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="voice-connected-bar">
      <button type="button" className="voice-bar-main" onClick={onOpen}>
        <span className="voice-bar-dot" />
        Voice connected — {channelName}
        {sharing ? " · Sharing" : ""}
      </button>
      <button type="button" className="ghost sm" onClick={onMute}>
        {muted ? "Unmute" : "Mute"}
      </button>
      <button type="button" className="ghost sm" onClick={onDeafen}>
        {deafened ? "Undeafen" : "Deafen"}
      </button>
      <button type="button" className="danger sm" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}
