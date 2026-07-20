export type Rank = "owner" | "admin" | "moderator" | "member";
export type ChannelKind = "text" | "voice";

export interface UserPublic {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  banner_url?: string | null;
  created_at: string;
  is_global_admin?: boolean;
}

export interface AdminUserInfo {
  user: UserPublic;
  is_banned: boolean;
  banned_reason?: string | null;
}

export interface ServerMeta {
  version: string;
  dev_mode: boolean;
  global_admin_enabled: boolean;
}

export interface ServerInfo {
  id: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  owner_id: string;
  invite_code: string;
  created_at: string;
}

export interface ChannelInfo {
  id: string;
  server_id: string;
  name: string;
  kind: ChannelKind;
  position: number;
}

export interface MemberInfo {
  user: UserPublic;
  rank: Rank;
  joined_at: string;
}

export interface MessageInfo {
  id: string;
  channel_id?: string | null;
  dm_id?: string | null;
  author: UserPublic;
  content: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  created_at: string;
  edited_at?: string | null;
}

export interface DmThread {
  id: string;
  peer: UserPublic;
  updated_at: string;
}

export interface AuthResponse {
  token: string;
  user: UserPublic;
}

export interface ClientConfig {
  server_url: string;
  push_to_talk: boolean;
  hotkey_push_to_talk: string;
  hotkey_mute: string;
  hotkey_deafen: string;
  voice_sounds: boolean;
  dev_mode_ui?: boolean;
  ice_servers?: string[];
}

export interface VoicePeerInfo {
  user: UserPublic;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
}

export type VoiceSignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | {
      kind: "ice";
      candidate: string;
      sdp_mid?: string | null;
      sdp_m_line_index?: number | null;
    };

export type WsClientMessage =
  | { type: "voice_join"; channel_id: string }
  | { type: "voice_leave" }
  | {
      type: "voice_signal";
      channel_id: string;
      to: string;
      payload: VoiceSignalPayload;
    }
  | {
      type: "voice_set_state";
      muted: boolean;
      deafened: boolean;
      speaking: boolean;
    }
  | { type: "voice_mute_peer"; user_id: string; muted: boolean }
  | {
      type: "voice_move_member";
      user_id: string;
      to_channel_id: string;
    }
  | {
      type: "voice_screen_share";
      channel_id: string;
      sharing: boolean;
    };

export type WsEvent =
  | { type: "message_created"; message: MessageInfo }
  | {
      type: "message_deleted";
      message_id: string;
      channel_id?: string | null;
      dm_id?: string | null;
    }
  | { type: "member_joined"; server_id: string; member: MemberInfo }
  | { type: "member_updated"; server_id: string; member: MemberInfo }
  | { type: "presence"; user_id: string; online: boolean }
  | {
      type: "voice_state";
      channel_id: string;
      peers: VoicePeerInfo[];
      screen_sharer?: string | null;
    }
  | { type: "voice_peer_joined"; channel_id: string; peer: VoicePeerInfo }
  | { type: "voice_peer_left"; channel_id: string; user_id: string }
  | { type: "voice_peer_updated"; channel_id: string; peer: VoicePeerInfo }
  | {
      type: "voice_signal";
      channel_id: string;
      from: string;
      to: string;
      payload: VoiceSignalPayload;
    }
  | {
      type: "voice_moved";
      user_id: string;
      from_channel_id?: string | null;
      to_channel_id: string;
    }
  | {
      type: "voice_screen_share";
      channel_id: string;
      user_id: string;
      sharing: boolean;
    }
  | { type: "voice_error"; message: string }
  | { type: "game_host_updated"; host: GameHostInfo }
  | { type: "game_host_removed"; host_id: string };

export interface GameHostInfo {
  id: string;
  user: UserPublic;
  game_name: string;
  address: string;
  note: string;
  server_id?: string | null;
  created_at: string;
  expires_at: string;
}

export interface UpdateManifest {
  version: string;
  channel: string;
  platform: string;
  notes: string;
  filename: string;
  sha256: string;
  published_at: string;
}
