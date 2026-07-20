use crate::models::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserPublic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateServerRequest {
    pub name: String,
    pub description: Option<String>,
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinServerRequest {
    pub invite_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateChannelRequest {
    pub name: String,
    pub kind: ChannelKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameChannelRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
    pub attachment_url: Option<String>,
    pub attachment_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetRankRequest {
    pub user_id: Uuid,
    pub rank: Rank,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimAdminRequest {
    pub bootstrap_secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BanUserRequest {
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminUserInfo {
    pub user: UserPublic,
    pub is_banned: bool,
    pub banned_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerMeta {
    pub version: String,
    pub dev_mode: bool,
    pub global_admin_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiError {
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoicePeerInfo {
    pub user: UserPublic,
    pub muted: bool,
    pub deafened: bool,
    pub speaking: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum VoiceSignalPayload {
    Offer {
        sdp: String,
    },
    Answer {
        sdp: String,
    },
    Ice {
        candidate: String,
        sdp_mid: Option<String>,
        sdp_m_line_index: Option<u16>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateManifest {
    pub version: String,
    pub channel: String,
    pub platform: String,
    pub notes: String,
    pub filename: String,
    pub sha256: String,
    pub published_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsEvent {
    MessageCreated {
        message: MessageInfo,
    },
    MessageDeleted {
        message_id: Uuid,
        channel_id: Option<Uuid>,
        dm_id: Option<Uuid>,
    },
    MessageUpdated {
        message: MessageInfo,
    },
    MessageReactionUpdated {
        message_id: Uuid,
        channel_id: Option<Uuid>,
        dm_id: Option<Uuid>,
        reactions: Vec<ReactionInfo>,
    },
    MemberJoined {
        server_id: Uuid,
        member: MemberInfo,
    },
    MemberUpdated {
        server_id: Uuid,
        member: MemberInfo,
    },
    Presence {
        user_id: Uuid,
        online: bool,
    },
    VoiceState {
        channel_id: Uuid,
        peers: Vec<VoicePeerInfo>,
        #[serde(default)]
        screen_sharer: Option<Uuid>,
    },
    VoicePeerJoined {
        channel_id: Uuid,
        peer: VoicePeerInfo,
    },
    VoicePeerLeft {
        channel_id: Uuid,
        user_id: Uuid,
    },
    VoicePeerUpdated {
        channel_id: Uuid,
        peer: VoicePeerInfo,
    },
    VoiceSignal {
        channel_id: Uuid,
        from: Uuid,
        to: Uuid,
        payload: VoiceSignalPayload,
    },
    VoiceMoved {
        user_id: Uuid,
        from_channel_id: Option<Uuid>,
        to_channel_id: Uuid,
    },
    /// Screen share presence (one sharer per channel). Media is P2P via WebRTC.
    VoiceScreenShare {
        channel_id: Uuid,
        user_id: Uuid,
        sharing: bool,
    },
    VoiceError {
        message: String,
    },
    GameHostUpdated {
        host: GameHostInfo,
    },
    GameHostRemoved {
        host_id: Uuid,
    },
    MediaRelayStarted {
        relay: MediaRelayInfo,
    },
    MediaRelayStopped {
        relay_id: Uuid,
    },
    FriendRequestCreated {
        request: FriendRequestInfo,
    },
    FriendAccepted {
        user: UserPublic,
    },
    FriendRemoved {
        user_id: Uuid,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaRelayInfo {
    pub id: Uuid,
    /// Original direct URL the server is pulling from.
    pub source_url: String,
    /// Relative path clients use to play via the server (append auth token as query).
    pub stream_path: String,
    pub title: String,
    pub content_type: Option<String>,
    pub started_by: UserPublic,
    pub channel_id: Option<Uuid>,
    pub server_id: Option<Uuid>,
    pub started_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartMediaRelayRequest {
    pub url: String,
    #[serde(default)]
    pub title: String,
    pub channel_id: Option<Uuid>,
    pub server_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FriendshipStatus {
    Pending,
    Accepted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendRequestInfo {
    pub id: Uuid,
    pub from: UserPublic,
    pub to: UserPublic,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendEntry {
    pub user: UserPublic,
    pub online: bool,
    pub since: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendsSnapshot {
    pub friends: Vec<FriendEntry>,
    pub incoming: Vec<FriendRequestInfo>,
    pub outgoing: Vec<FriendRequestInfo>,
    pub blocked: Vec<UserPublic>,
    pub ignored: Vec<UserPublic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendRequestBody {
    /// Target username (preferred) or user id as string.
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum GameHostKind {
    /// Direct game IP:port join (no Steam emu).
    #[default]
    Direct,
    /// Goldberg Steam emu LAN lobby discovery (custom broadcasts + listen port).
    Goldberg,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameHostInfo {
    pub id: Uuid,
    /// Short code friends type/share (e.g. `N7K2Q9`).
    pub room_code: String,
    pub user: UserPublic,
    pub game_name: String,
    /// Reachable `IP:port` (Goldberg default listen port is 47584).
    pub address: String,
    pub note: String,
    #[serde(default)]
    pub kind: GameHostKind,
    /// Steam AppID when kind is Goldberg.
    pub app_id: Option<String>,
    /// Optional rich-presence / lobby launch args (e.g. `+connect_lobby 123`).
    pub connect_command: Option<String>,
    pub server_id: Option<Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGameHostRequest {
    pub game_name: String,
    pub address: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub kind: GameHostKind,
    pub app_id: Option<String>,
    pub connect_command: Option<String>,
    pub server_id: Option<Uuid>,
    /// Minutes until expiry (default 120, max 1440).
    pub ttl_minutes: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsClientMessage {
    VoiceJoin {
        channel_id: Uuid,
    },
    VoiceLeave,
    VoiceSignal {
        channel_id: Uuid,
        to: Uuid,
        payload: VoiceSignalPayload,
    },
    VoiceSetState {
        muted: bool,
        deafened: bool,
        speaking: bool,
    },
    VoiceMutePeer {
        user_id: Uuid,
        muted: bool,
    },
    VoiceMoveMember {
        user_id: Uuid,
        to_channel_id: Uuid,
    },
    VoiceScreenShare {
        channel_id: Uuid,
        sharing: bool,
    },
}
