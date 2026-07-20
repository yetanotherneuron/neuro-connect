import type { VoicePeerInfo, VoiceSignalPayload, WsClientMessage, WsEvent } from "../types";
import type { RealtimeClient } from "../api";

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function parseIceServers(extra: string[] | undefined): RTCIceServer[] {
  const list = [...DEFAULT_ICE];
  for (const raw of extra || []) {
    const url = raw.trim();
    if (!url) continue;
    // turn:user:pass@host:3478
    if (url.startsWith("turn:") && url.includes("@")) {
      const without = url.slice("turn:".length);
      const at = without.lastIndexOf("@");
      const cred = without.slice(0, at);
      const host = without.slice(at + 1);
      const colon = cred.indexOf(":");
      if (colon > 0) {
        list.push({
          urls: `turn:${host}`,
          username: cred.slice(0, colon),
          credential: cred.slice(colon + 1),
        });
        continue;
      }
    }
    list.push({ urls: url });
  }
  return list;
}

export type ScreenShareState = {
  sharing: boolean;
  localSharing: boolean;
  sharerId: string | null;
  /** Remote (or local preview) video stream when someone is sharing. */
  videoStream: MediaStream | null;
};

export type VoiceSessionOptions = {
  localUserId: string;
  pushToTalk: boolean;
  voiceSounds: boolean;
  iceServers?: string[];
  onPeers: (peers: VoicePeerInfo[], channelId: string | null) => void;
  onError: (message: string) => void;
  onLocalState: (state: { muted: boolean; deafened: boolean; speaking: boolean; pttHeld: boolean }) => void;
  onScreenShare?: (state: ScreenShareState) => void;
};

export class VoiceSession {
  private realtime: RealtimeClient | null = null;
  private channelId: string | null = null;
  private localStream: MediaStream | null = null;
  private displayStream: MediaStream | null = null;
  private peers = new Map<string, VoicePeerInfo>();
  private pcs = new Map<string, RTCPeerConnection>();
  private audioEls = new Map<string, HTMLAudioElement>();
  private mutedByMe = new Set<string>();
  private localMuted = false;
  private localDeafened = false;
  private speaking = false;
  private pttHeld = false;
  private localSharing = false;
  private screenSharerId: string | null = null;
  private remoteVideoStream: MediaStream | null = null;
  private opts: VoiceSessionOptions;
  private makingOffer = new Set<string>();

  constructor(opts: VoiceSessionOptions) {
    this.opts = opts;
  }

  get activeChannelId() {
    return this.channelId;
  }

  get isSharing() {
    return this.localSharing;
  }

  attachRealtime(rt: RealtimeClient) {
    this.realtime = rt;
  }

  setPushToTalk(enabled: boolean) {
    this.opts.pushToTalk = enabled;
    this.applyMicGate();
  }

  handleEvent(raw: unknown) {
    const ev = raw as WsEvent;
    if (!ev || typeof ev !== "object" || !("type" in ev)) return;

    switch (ev.type) {
      case "voice_state":
        if (this.channelId && ev.channel_id !== this.channelId) return;
        this.channelId = ev.channel_id;
        this.peers.clear();
        for (const p of ev.peers) {
          this.peers.set(p.user.id, p);
          if (p.user.id !== this.opts.localUserId) {
            void this.ensurePeer(p.user.id, this.opts.localUserId < p.user.id);
          }
        }
        this.screenSharerId = ev.screen_sharer ?? null;
        if (!this.screenSharerId) {
          this.clearRemoteVideo();
        }
        this.emitPeers();
        this.emitScreenShare();
        break;
      case "voice_peer_joined":
        if (this.channelId && ev.channel_id !== this.channelId) return;
        this.peers.set(ev.peer.user.id, ev.peer);
        if (ev.peer.user.id !== this.opts.localUserId) {
          void this.ensurePeer(ev.peer.user.id, this.opts.localUserId < ev.peer.user.id);
        }
        this.emitPeers();
        this.playSound("join");
        break;
      case "voice_peer_left":
        if (this.channelId && ev.channel_id !== this.channelId) return;
        this.peers.delete(ev.user_id);
        this.teardownPeer(ev.user_id);
        if (this.screenSharerId === ev.user_id) {
          this.screenSharerId = null;
          this.clearRemoteVideo();
          this.emitScreenShare();
        }
        this.emitPeers();
        this.playSound("leave");
        break;
      case "voice_peer_updated":
        if (this.channelId && ev.channel_id !== this.channelId) return;
        this.peers.set(ev.peer.user.id, ev.peer);
        this.emitPeers();
        break;
      case "voice_signal":
        if (ev.to !== this.opts.localUserId) return;
        if (this.channelId && ev.channel_id !== this.channelId) return;
        void this.onSignal(ev.from, ev.payload);
        break;
      case "voice_moved":
        if (ev.user_id === this.opts.localUserId) {
          void this.join(ev.to_channel_id);
        }
        break;
      case "voice_screen_share":
        if (this.channelId && ev.channel_id !== this.channelId) return;
        if (ev.sharing) {
          this.screenSharerId = ev.user_id;
          if (ev.user_id === this.opts.localUserId) {
            this.localSharing = true;
          }
        } else {
          if (this.screenSharerId === ev.user_id) {
            this.screenSharerId = null;
          }
          if (ev.user_id === this.opts.localUserId) {
            this.localSharing = false;
          }
          if (ev.user_id !== this.opts.localUserId) {
            this.clearRemoteVideo();
          }
        }
        this.emitScreenShare();
        break;
      case "voice_error":
        this.opts.onError(ev.message);
        break;
      default:
        break;
    }
  }

  async join(channelId: string) {
    if (!this.realtime) {
      this.opts.onError("Realtime not connected");
      return;
    }
    if (this.channelId === channelId) return;
    if (this.channelId) {
      await this.leave(false);
    }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch {
      this.opts.onError("Microphone permission denied");
      return;
    }
    this.channelId = channelId;
    this.localMuted = this.opts.pushToTalk;
    this.applyMicGate();
    this.send({ type: "voice_join", channel_id: channelId });
    this.publishLocalState();
    this.emitLocalState();
    this.playSound("join");
  }

  async leave(notify = true) {
    await this.stopScreenShareTracks(notify);
    if (notify && this.channelId) {
      this.send({ type: "voice_leave" });
    }
    for (const id of [...this.pcs.keys()]) {
      this.teardownPeer(id);
    }
    this.peers.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.channelId = null;
    this.speaking = false;
    this.pttHeld = false;
    this.screenSharerId = null;
    this.clearRemoteVideo();
    this.emitPeers();
    this.emitLocalState();
    this.emitScreenShare();
    if (notify) this.playSound("leave");
  }

  async startScreenShare() {
    if (!this.channelId || !this.localStream) {
      this.opts.onError("Join a voice channel before sharing your screen");
      return;
    }
    if (this.localSharing) return;
    if (this.screenSharerId && this.screenSharerId !== this.opts.localUserId) {
      this.opts.onError("Someone else is already sharing their screen");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      });
    } catch {
      this.opts.onError("Screen share permission denied or unavailable");
      return;
    }

    this.displayStream = stream;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener("ended", () => {
        void this.stopScreenShare();
      });
    }

    this.send({
      type: "voice_screen_share",
      channel_id: this.channelId,
      sharing: true,
    });
    this.localSharing = true;
    this.screenSharerId = this.opts.localUserId;
    this.emitScreenShare();

    await this.addDisplayTracksToPeers();
  }

  async stopScreenShare() {
    await this.stopScreenShareTracks(true);
  }

  setMuted(muted: boolean) {
    this.localMuted = muted;
    if (muted) this.speaking = false;
    this.applyMicGate();
    this.publishLocalState();
    this.emitLocalState();
  }

  toggleMute() {
    this.setMuted(!this.localMuted);
  }

  setDeafened(deafened: boolean) {
    this.localDeafened = deafened;
    if (deafened) {
      this.localMuted = true;
      this.speaking = false;
    }
    for (const el of this.audioEls.values()) {
      el.muted = deafened;
    }
    this.applyMicGate();
    this.publishLocalState();
    this.emitLocalState();
  }

  toggleDeafen() {
    this.setDeafened(!this.localDeafened);
  }

  setPttHeld(held: boolean) {
    this.pttHeld = held;
    if (this.opts.pushToTalk && !this.localMuted) {
      // PTT only gates when muted-by-PTT mode (push_to_talk true means mic off until held)
    }
    this.applyMicGate();
    const speaking = this.isMicOpen();
    if (speaking !== this.speaking) {
      this.speaking = speaking;
      this.publishLocalState();
    }
    this.emitLocalState();
  }

  mutePeerLocally(userId: string, muted: boolean) {
    if (muted) this.mutedByMe.add(userId);
    else this.mutedByMe.delete(userId);
    const el = this.audioEls.get(userId);
    if (el) el.muted = this.localDeafened || muted;
    this.send({ type: "voice_mute_peer", user_id: userId, muted });
  }

  moveMember(userId: string, toChannelId: string) {
    this.send({ type: "voice_move_member", user_id: userId, to_channel_id: toChannelId });
  }

  destroy() {
    void this.leave(true);
  }

  private async stopScreenShareTracks(notify: boolean) {
    const wasSharing = this.localSharing || !!this.displayStream;
    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) {
        track.stop();
      }
      for (const [remoteId, pc] of this.pcs) {
        for (const sender of pc.getSenders()) {
          const track = sender.track;
          if (!track) continue;
          if (track.kind === "video" || this.isDisplayAudioTrack(track)) {
            try {
              pc.removeTrack(sender);
            } catch {
              /* ignore */
            }
            void this.renegotiate(remoteId);
          }
        }
      }
      this.displayStream = null;
    }
    if (wasSharing && this.localSharing) {
      this.localSharing = false;
      if (this.screenSharerId === this.opts.localUserId) {
        this.screenSharerId = null;
      }
      if (notify && this.channelId) {
        this.send({
          type: "voice_screen_share",
          channel_id: this.channelId,
          sharing: false,
        });
      }
      this.emitScreenShare();
    }
  }

  private isDisplayAudioTrack(track: MediaStreamTrack) {
    if (track.kind !== "audio" || !this.displayStream) return false;
    return this.displayStream.getAudioTracks().some((t) => t.id === track.id);
  }

  private async addDisplayTracksToPeers() {
    if (!this.displayStream) return;
    for (const [remoteId, pc] of this.pcs) {
      for (const track of this.displayStream.getTracks()) {
        const already = pc.getSenders().some((s) => s.track?.id === track.id);
        if (!already) {
          pc.addTrack(track, this.displayStream);
        }
      }
      await this.renegotiate(remoteId);
    }
  }

  private isMicOpen() {
    if (this.localMuted || this.localDeafened) return false;
    if (this.opts.pushToTalk) return this.pttHeld;
    return true;
  }

  private applyMicGate() {
    const open = this.isMicOpen();
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = open;
    });
  }

  private publishLocalState() {
    this.send({
      type: "voice_set_state",
      muted: this.localMuted || (this.opts.pushToTalk && !this.pttHeld),
      deafened: this.localDeafened,
      speaking: this.isMicOpen(),
    });
  }

  private emitLocalState() {
    this.opts.onLocalState({
      muted: this.localMuted || (this.opts.pushToTalk && !this.pttHeld),
      deafened: this.localDeafened,
      speaking: this.isMicOpen(),
      pttHeld: this.pttHeld,
    });
  }

  private emitPeers() {
    this.opts.onPeers([...this.peers.values()], this.channelId);
  }

  private emitScreenShare() {
    const videoStream = this.localSharing
      ? this.displayStream
      : this.remoteVideoStream;
    this.opts.onScreenShare?.({
      sharing: !!this.screenSharerId,
      localSharing: this.localSharing,
      sharerId: this.screenSharerId,
      videoStream,
    });
  }

  private clearRemoteVideo() {
    this.remoteVideoStream = null;
  }

  private send(msg: WsClientMessage) {
    this.realtime?.send(msg);
  }

  private async ensurePeer(remoteId: string, polite: boolean) {
    if (this.pcs.has(remoteId) || !this.localStream || !this.channelId) return;
    const pc = new RTCPeerConnection({ iceServers: parseIceServers(this.opts.iceServers) });
    this.pcs.set(remoteId, pc);

    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }
    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) {
        pc.addTrack(track, this.displayStream);
      }
    }

    pc.onicecandidate = (ev) => {
      if (!ev.candidate || !this.channelId) return;
      const c = ev.candidate;
      this.send({
        type: "voice_signal",
        channel_id: this.channelId,
        to: remoteId,
        payload: {
          kind: "ice",
          candidate: c.candidate,
          sdp_mid: c.sdpMid,
          sdp_m_line_index: c.sdpMLineIndex ?? undefined,
        },
      });
    };

    pc.ontrack = (ev) => {
      if (ev.track.kind === "video") {
        const stream = ev.streams[0] || new MediaStream([ev.track]);
        this.remoteVideoStream = stream;
        if (!this.screenSharerId) {
          this.screenSharerId = remoteId;
        }
        this.emitScreenShare();
        ev.track.addEventListener("ended", () => {
          if (this.remoteVideoStream === stream) {
            this.clearRemoteVideo();
            this.emitScreenShare();
          }
        });
        return;
      }

      let el = this.audioEls.get(remoteId);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        this.audioEls.set(remoteId, el);
      }
      // Merge audio tracks onto one element stream when possible
      const existing = el.srcObject;
      if (existing instanceof MediaStream) {
        const has = existing.getTracks().some((t) => t.id === ev.track.id);
        if (!has) existing.addTrack(ev.track);
      } else {
        el.srcObject = ev.streams[0] || new MediaStream([ev.track]);
      }
      el.muted = this.localDeafened || this.mutedByMe.has(remoteId);
    };

    pc.onnegotiationneeded = async () => {
      // Initial offers are created below for the polite peer.
      // Screen-share track adds call renegotiate() explicitly.
      if (!polite || !this.channelId || this.makingOffer.has(remoteId)) return;
      await this.renegotiate(remoteId);
    };

    if (polite) {
      await this.renegotiate(remoteId);
    }
  }

  private async renegotiate(remoteId: string) {
    const pc = this.pcs.get(remoteId);
    if (!pc || !this.channelId) return;
    if (this.makingOffer.has(remoteId)) return;
    try {
      this.makingOffer.add(remoteId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send({
        type: "voice_signal",
        channel_id: this.channelId,
        to: remoteId,
        payload: { kind: "offer", sdp: offer.sdp || "" },
      });
    } catch (e) {
      console.warn("voice negotiation failed", e);
    } finally {
      this.makingOffer.delete(remoteId);
    }
  }

  private async onSignal(from: string, payload: VoiceSignalPayload) {
    await this.ensurePeer(from, this.opts.localUserId < from);
    const pc = this.pcs.get(from);
    if (!pc || !this.channelId) return;

    if (payload.kind === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({
        type: "voice_signal",
        channel_id: this.channelId,
        to: from,
        payload: { kind: "answer", sdp: answer.sdp || "" },
      });
    } else if (payload.kind === "answer") {
      await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
    } else if (payload.kind === "ice") {
      try {
        await pc.addIceCandidate({
          candidate: payload.candidate,
          sdpMid: payload.sdp_mid ?? undefined,
          sdpMLineIndex: payload.sdp_m_line_index ?? undefined,
        });
      } catch {
        /* ignore late ICE */
      }
    }
  }

  private teardownPeer(remoteId: string) {
    const pc = this.pcs.get(remoteId);
    pc?.close();
    this.pcs.delete(remoteId);
    const el = this.audioEls.get(remoteId);
    if (el) {
      el.srcObject = null;
      this.audioEls.delete(remoteId);
    }
  }

  private playSound(kind: "join" | "leave") {
    if (!this.opts.voiceSounds) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = kind === "join" ? 660 : 420;
      gain.gain.value = 0.04;
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      void ctx.close();
    } catch {
      /* ignore */
    }
  }
}
