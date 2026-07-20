use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Rank {
    Owner,
    Admin,
    Moderator,
    Member,
}

impl Rank {
    pub fn as_str(&self) -> &'static str {
        match self {
            Rank::Owner => "owner",
            Rank::Admin => "admin",
            Rank::Moderator => "moderator",
            Rank::Member => "member",
        }
    }

    pub fn from_str_rank(value: &str) -> Option<Self> {
        match value {
            "owner" => Some(Rank::Owner),
            "admin" => Some(Rank::Admin),
            "moderator" => Some(Rank::Moderator),
            "member" => Some(Rank::Member),
            _ => None,
        }
    }

    pub fn level(&self) -> u8 {
        match self {
            Rank::Owner => 4,
            Rank::Admin => 3,
            Rank::Moderator => 2,
            Rank::Member => 1,
        }
    }

    pub fn can_moderate(&self) -> bool {
        self.level() >= Rank::Moderator.level()
    }

    pub fn can_admin(&self) -> bool {
        self.level() >= Rank::Admin.level()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChannelKind {
    Text,
    Voice,
}

impl ChannelKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ChannelKind::Text => "text",
            ChannelKind::Voice => "voice",
        }
    }

    pub fn from_str_kind(value: &str) -> Option<Self> {
        match value {
            "text" => Some(ChannelKind::Text),
            "voice" => Some(ChannelKind::Voice),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPublic {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub is_global_admin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub icon_url: Option<String>,
    pub owner_id: Uuid,
    pub invite_code: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelInfo {
    pub id: Uuid,
    pub server_id: Uuid,
    pub name: String,
    pub kind: ChannelKind,
    pub position: i32,
    #[serde(default)]
    pub unread_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberInfo {
    pub user: UserPublic,
    pub rank: Rank,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageInfo {
    pub id: Uuid,
    pub channel_id: Option<Uuid>,
    pub dm_id: Option<Uuid>,
    pub author: UserPublic,
    pub content: String,
    pub attachment_url: Option<String>,
    pub attachment_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub edited_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub reactions: Vec<ReactionInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmThread {
    pub id: Uuid,
    /// Present for 1:1 DMs.
    #[serde(default)]
    pub peer: Option<UserPublic>,
    /// Present for group DMs.
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default = "default_dm_kind")]
    pub kind: String,
    #[serde(default)]
    pub members: Vec<UserPublic>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub unread_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkReadRequest {
    #[serde(default)]
    pub message_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default = "default_search_limit")]
    pub limit: i64,
}

fn default_search_limit() -> i64 {
    25
}

fn default_dm_kind() -> String {
    "direct".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGroupDmRequest {
    pub name: String,
    pub member_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditMessageRequest {
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionRequest {
    pub emoji: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionInfo {
    pub emoji: String,
    pub count: i64,
    pub reacted_by_me: bool,
}

pub const MAX_UPLOAD_BYTES: u64 = 12 * 1024 * 1024;
pub const MAX_IMAGE_BYTES: u64 = 4 * 1024 * 1024;
