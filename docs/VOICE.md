# Voice & screen share

Neuro Connect voice uses a **WebRTC mesh** (Opus audio). The server only does room membership and signaling over `/api/ws`. Media stays peer-to-peer.

## Join / leave

- Join a voice channel from the server sidebar.
- Mute, deafen, push-to-talk (client setting), and moderator move are supported.
- `GET /api/voice/status` lists live rooms.

## Screen share (+ desktop audio)

While connected to a voice channel:

1. Click **Share screen**.
2. Pick a window/screen in the system picker. On Windows (WebView2), enable **Share system audio** when available for desktop audio.
3. Peers see a video tile; your mic stays separate (not replaced by display audio).
4. Click **Stop sharing**, or close the picker / stop from the OS chrome.

### Rules (v1)

- **One sharer per channel.** If someone else is sharing, Share screen is disabled until they stop.
- Leaving the voice channel stops your share and clears the room’s sharer.
- Signaling: `voice_screen_share` client message → `voice_screen_share` event; `voice_state` includes optional `screen_sharer`.

### Limitations

- Mesh renegotiation: each peer still has a direct connection; large rooms will feel this more than an SFU.
- Desktop audio depends on the OS / WebView picker (not all platforms expose it).
- No SFU yet — screen share is mesh peer-to-peer.
- For shared music/video from a URL, use **media URL relay** (server proxies the file; see [SERVER_SETUP.md](SERVER_SETUP.md)).

## ICE / NAT

Default STUN servers are bundled. Hard NATs may need TURN — set `ice_servers` in the client config (see [CONFIGURATION.md](CONFIGURATION.md)).
