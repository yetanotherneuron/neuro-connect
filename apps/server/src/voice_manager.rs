use crate::server_core::require_member;
use crate::state::AppState;
use axum::{extract::State, Json};
use neuro_shared::*;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct VoicePeer {
    pub muted: bool,
    pub deafened: bool,
    pub speaking: bool,
    pub mutual_mutes: HashSet<Uuid>,
}

#[derive(Debug, Default)]
pub struct VoiceRoom {
    pub peers: HashMap<Uuid, VoicePeer>,
    /// At most one active screen sharer per channel.
    pub screen_sharer: Option<Uuid>,
}

impl VoicePeer {
    fn new() -> Self {
        Self {
            muted: false,
            deafened: false,
            speaking: false,
            mutual_mutes: HashSet::new(),
        }
    }

    fn to_info(&self, user: UserPublic) -> VoicePeerInfo {
        VoicePeerInfo {
            user,
            muted: self.muted,
            deafened: self.deafened,
            speaking: self.speaking,
        }
    }
}

pub async fn voice_status(State(state): State<AppState>) -> Json<Value> {
    let rooms: Vec<Value> = state
        .voice_rooms
        .iter()
        .map(|entry| {
            let channel_id = *entry.key();
            let peers: Vec<Value> = entry
                .peers
                .iter()
                .filter_map(|(uid, peer)| {
                    let user = state.db.get_user(*uid).ok().flatten()?;
                    Some(json!({
                        "user_id": uid,
                        "username": user.username,
                        "display_name": user.display_name,
                        "muted": peer.muted,
                        "deafened": peer.deafened,
                        "speaking": peer.speaking,
                    }))
                })
                .collect();
            json!({
                "channel_id": channel_id,
                "peers": peers,
            })
        })
        .collect();

    Json(json!({
        "status": "ready",
        "ready": true,
        "codec": "opus",
        "modes": ["push_to_talk", "voice_activity"],
        "rooms": rooms,
        "message": "WebRTC mesh voice rooms are active (server signaling only)."
    }))
}

pub fn handle_client_message(state: &AppState, uid: Uuid, msg: WsClientMessage) {
    match msg {
        WsClientMessage::VoiceJoin { channel_id } => {
            if let Err(message) = voice_join(state, uid, channel_id) {
                state.publish(WsEvent::VoiceError { message });
            }
        }
        WsClientMessage::VoiceLeave => {
            voice_leave(state, uid, true);
        }
        WsClientMessage::VoiceSignal {
            channel_id,
            to,
            payload,
        } => {
            if let Err(message) = voice_signal(state, uid, channel_id, to, payload) {
                state.publish(WsEvent::VoiceError { message });
            }
        }
        WsClientMessage::VoiceSetState {
            muted,
            deafened,
            speaking,
        } => {
            if let Err(message) = voice_set_state(state, uid, muted, deafened, speaking) {
                state.publish(WsEvent::VoiceError { message });
            }
        }
        WsClientMessage::VoiceMutePeer { user_id, muted } => {
            if let Err(message) = voice_mute_peer(state, uid, user_id, muted) {
                state.publish(WsEvent::VoiceError { message });
            }
        }
        WsClientMessage::VoiceMoveMember {
            user_id,
            to_channel_id,
        } => {
            if let Err(message) = voice_move_member(state, uid, user_id, to_channel_id) {
                state.publish(WsEvent::VoiceError { message });
            }
        }
        WsClientMessage::VoiceScreenShare {
            channel_id,
            sharing,
        } => {
            if let Err(message) = voice_screen_share(state, uid, channel_id, sharing) {
                state.publish(WsEvent::VoiceError { message });
            }
        }
    }
}

pub fn voice_leave(state: &AppState, uid: Uuid, publish: bool) {
    let Some(channel_id) = state.voice_user_channel.remove(&uid).map(|e| e.1) else {
        return;
    };
    let mut cleared_share = false;
    if let Some(mut room) = state.voice_rooms.get_mut(&channel_id) {
        room.peers.remove(&uid);
        if room.screen_sharer == Some(uid) {
            room.screen_sharer = None;
            cleared_share = true;
        }
        let empty = room.peers.is_empty();
        drop(room);
        if empty {
            state.voice_rooms.remove(&channel_id);
        }
    }
    if publish {
        if cleared_share {
            state.publish(WsEvent::VoiceScreenShare {
                channel_id,
                user_id: uid,
                sharing: false,
            });
        }
        state.publish(WsEvent::VoicePeerLeft {
            channel_id,
            user_id: uid,
        });
    }
}

fn voice_join(state: &AppState, uid: Uuid, channel_id: Uuid) -> Result<(), String> {
    let channel = state
        .db
        .get_channel(channel_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "channel not found".to_string())?;
    if channel.kind != ChannelKind::Voice {
        return Err("not a voice channel".into());
    }
    require_member(state, channel.server_id, uid).map_err(|(_, e)| e.0.error.clone())?;

    // Leave any previous room first.
    if let Some(prev) = state.voice_user_channel.get(&uid).map(|e| *e) {
        if prev == channel_id {
            // Already in this room — resend snapshot.
            send_snapshot(state, uid, channel_id)?;
            return Ok(());
        }
        voice_leave(state, uid, true);
    }

    let user = state
        .db
        .get_user(uid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "user not found".to_string())?;

    let peer = VoicePeer::new();
    let info = peer.to_info(user.clone());
    state
        .voice_rooms
        .entry(channel_id)
        .or_default()
        .peers
        .insert(uid, peer);
    state.voice_user_channel.insert(uid, channel_id);

    state.publish(WsEvent::VoicePeerJoined {
        channel_id,
        peer: info,
    });
    send_snapshot(state, uid, channel_id)?;
    Ok(())
}

fn send_snapshot(state: &AppState, uid: Uuid, channel_id: Uuid) -> Result<(), String> {
    let room = state
        .voice_rooms
        .get(&channel_id)
        .ok_or_else(|| "room not found".to_string())?;
    let screen_sharer = room.screen_sharer;
    let peers: Vec<VoicePeerInfo> = room
        .peers
        .iter()
        .filter_map(|(peer_id, peer)| {
            let user = state.db.get_user(*peer_id).ok().flatten()?;
            Some(peer.to_info(user))
        })
        .collect();
    drop(room);

    // Snapshot is useful to the joining client; broadcast is fine (clients filter).
    let _ = uid;
    state.publish(WsEvent::VoiceState {
        channel_id,
        peers,
        screen_sharer,
    });
    Ok(())
}

fn voice_screen_share(
    state: &AppState,
    uid: Uuid,
    channel_id: Uuid,
    sharing: bool,
) -> Result<(), String> {
    let from_ch = state
        .voice_user_channel
        .get(&uid)
        .map(|e| *e)
        .ok_or_else(|| "not in a voice channel".to_string())?;
    if from_ch != channel_id {
        return Err("not in that voice channel".into());
    }
    let mut room = state
        .voice_rooms
        .get_mut(&channel_id)
        .ok_or_else(|| "room not found".to_string())?;
    if sharing {
        if let Some(current) = room.screen_sharer {
            if current != uid {
                return Err("someone else is already sharing their screen".into());
            }
        }
        room.screen_sharer = Some(uid);
    } else if room.screen_sharer == Some(uid) {
        room.screen_sharer = None;
    } else if room.screen_sharer.is_some() {
        return Err("you are not the active screen sharer".into());
    }
    drop(room);
    state.publish(WsEvent::VoiceScreenShare {
        channel_id,
        user_id: uid,
        sharing,
    });
    Ok(())
}

fn voice_signal(
    state: &AppState,
    from: Uuid,
    channel_id: Uuid,
    to: Uuid,
    payload: VoiceSignalPayload,
) -> Result<(), String> {
    let from_ch = state
        .voice_user_channel
        .get(&from)
        .map(|e| *e)
        .ok_or_else(|| "not in a voice channel".to_string())?;
    let to_ch = state
        .voice_user_channel
        .get(&to)
        .map(|e| *e)
        .ok_or_else(|| "target not in a voice channel".to_string())?;
    if from_ch != channel_id || to_ch != channel_id {
        return Err("peers are not in the same voice channel".into());
    }
    state.publish(WsEvent::VoiceSignal {
        channel_id,
        from,
        to,
        payload,
    });
    Ok(())
}

fn voice_set_state(
    state: &AppState,
    uid: Uuid,
    muted: bool,
    deafened: bool,
    speaking: bool,
) -> Result<(), String> {
    let channel_id = state
        .voice_user_channel
        .get(&uid)
        .map(|e| *e)
        .ok_or_else(|| "not in a voice channel".to_string())?;
    let mut room = state
        .voice_rooms
        .get_mut(&channel_id)
        .ok_or_else(|| "room not found".to_string())?;
    let peer = room
        .peers
        .get_mut(&uid)
        .ok_or_else(|| "peer not found".to_string())?;
    peer.muted = muted;
    peer.deafened = deafened;
    peer.speaking = speaking && !muted;
    let info = {
        let user = state
            .db
            .get_user(uid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "user not found".to_string())?;
        peer.to_info(user)
    };
    drop(room);
    state.publish(WsEvent::VoicePeerUpdated {
        channel_id,
        peer: info,
    });
    Ok(())
}

fn voice_mute_peer(state: &AppState, actor: Uuid, target: Uuid, muted: bool) -> Result<(), String> {
    let channel_id = state
        .voice_user_channel
        .get(&actor)
        .map(|e| *e)
        .ok_or_else(|| "not in a voice channel".to_string())?;
    let target_ch = state
        .voice_user_channel
        .get(&target)
        .map(|e| *e)
        .ok_or_else(|| "target not in a voice channel".to_string())?;
    if channel_id != target_ch {
        return Err("peers are not in the same voice channel".into());
    }
    let mut room = state
        .voice_rooms
        .get_mut(&channel_id)
        .ok_or_else(|| "room not found".to_string())?;
    if let Some(peer) = room.peers.get_mut(&actor) {
        if muted {
            peer.mutual_mutes.insert(target);
        } else {
            peer.mutual_mutes.remove(&target);
        }
    }
    if let Some(peer) = room.peers.get_mut(&target) {
        if muted {
            peer.mutual_mutes.insert(actor);
        } else {
            peer.mutual_mutes.remove(&actor);
        }
    }
    drop(room);
    // Clients also apply local mute; this is informational.
    let _ = muted;
    Ok(())
}

fn voice_move_member(
    state: &AppState,
    actor: Uuid,
    target: Uuid,
    to_channel_id: Uuid,
) -> Result<(), String> {
    let from_channel_id = state.voice_user_channel.get(&target).map(|e| *e);
    let to_channel = state
        .db
        .get_channel(to_channel_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "destination channel not found".to_string())?;
    if to_channel.kind != ChannelKind::Voice {
        return Err("destination is not a voice channel".into());
    }
    let rank =
        require_member(state, to_channel.server_id, actor).map_err(|(_, e)| e.0.error.clone())?;
    if !rank.can_moderate() {
        return Err("insufficient permissions to move members".into());
    }
    require_member(state, to_channel.server_id, target).map_err(|(_, e)| e.0.error.clone())?;

    voice_leave(state, target, true);
    voice_join(state, target, to_channel_id)?;
    state.publish(WsEvent::VoiceMoved {
        user_id: target,
        from_channel_id,
        to_channel_id,
    });
    Ok(())
}
