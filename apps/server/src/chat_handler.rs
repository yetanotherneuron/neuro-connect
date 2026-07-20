use crate::auth_api::{api_err, extract_user_id};
use crate::server_core::require_member;
use crate::state::AppState;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Multipart, Path, Query, State,
    },
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use futures_util::{SinkExt, StreamExt};
use neuro_shared::*;
use serde::Deserialize;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct LimitQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    50
}

pub async fn list_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Query(q): Query<LimitQuery>,
) -> Result<Json<Vec<MessageInfo>>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let channel = state
        .db
        .get_channel(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "channel not found"))?;
    require_member(&state, channel.server_id, uid)?;
    let msgs = state
        .db
        .list_channel_messages(id, q.limit.clamp(1, 200))
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let msgs = state
        .db
        .attach_reactions(msgs, uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(msgs))
}

pub async fn send_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<SendMessageRequest>,
) -> Result<Json<MessageInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let channel = state
        .db
        .get_channel(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "channel not found"))?;
    if channel.kind != ChannelKind::Text {
        return Err(api_err(StatusCode::BAD_REQUEST, "not a text channel"));
    }
    require_member(&state, channel.server_id, uid)?;
    if body.content.trim().is_empty() && body.attachment_url.is_none() {
        return Err(api_err(StatusCode::BAD_REQUEST, "empty message"));
    }
    if let Some(reply_id) = body.reply_to_id {
        let (target, _, target_channel, _) = state
            .db
            .get_message(reply_id)
            .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
            .ok_or_else(|| api_err(StatusCode::BAD_REQUEST, "reply target not found"))?;
        let _ = target;
        if target_channel != Some(id) {
            return Err(api_err(
                StatusCode::BAD_REQUEST,
                "reply target must be in the same channel",
            ));
        }
    }
    let msg = state
        .db
        .insert_message(
            Some(id),
            None,
            uid,
            body.content.trim(),
            body.attachment_url.as_deref(),
            body.attachment_name.as_deref(),
            body.reply_to_id,
        )
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    state.publish(WsEvent::MessageCreated {
        message: msg.clone(),
    });
    crate::activity_log::activity(
        "message",
        &format!(
            "channel={} author=@{} chars={}",
            id,
            msg.author.username,
            msg.content.chars().count()
        ),
    );
    Ok(Json(msg))
}

pub async fn delete_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let (msg, author_id, channel_id, dm_id) = state
        .db
        .get_message(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "message not found"))?;

    let allowed = if state
        .db
        .is_global_admin(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    {
        true
    } else if let Some(dm) = dm_id {
        state
            .db
            .is_dm_member(dm, uid)
            .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    } else if let Some(cid) = channel_id {
        let channel = state
            .db
            .get_channel(cid)
            .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
            .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "channel not found"))?;
        let rank = require_member(&state, channel.server_id, uid)?;
        uid == author_id || rank.can_moderate()
    } else {
        false
    };

    if !allowed {
        return Err(api_err(StatusCode::FORBIDDEN, "cannot delete this message"));
    }

    let _ = msg;
    state
        .db
        .delete_message(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    state.publish(WsEvent::MessageDeleted {
        message_id: id,
        channel_id,
        dm_id,
    });
    Ok(StatusCode::NO_CONTENT)
}

pub async fn edit_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<EditMessageRequest>,
) -> Result<Json<MessageInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let content = body.content.trim();
    if content.is_empty() {
        return Err(api_err(StatusCode::BAD_REQUEST, "empty message"));
    }
    let msg = state
        .db
        .edit_message(id, uid, content)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    state.publish(WsEvent::MessageUpdated {
        message: msg.clone(),
    });
    Ok(Json(msg))
}

pub async fn react_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<ReactionRequest>,
) -> Result<Json<MessageInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let (msg, _author, channel_id, dm_id) = state
        .db
        .get_message(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "message not found"))?;
    if let Some(cid) = channel_id {
        let channel = state
            .db
            .get_channel(cid)
            .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
            .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "channel not found"))?;
        require_member(&state, channel.server_id, uid)?;
    } else if let Some(did) = dm_id {
        require_dm_participant(&state, did, uid)?;
    } else {
        return Err(api_err(StatusCode::BAD_REQUEST, "invalid message"));
    }
    let _ = msg;
    let updated = state
        .db
        .toggle_reaction(id, uid, &body.emoji)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    state.publish(WsEvent::MessageReactionUpdated {
        message_id: id,
        channel_id,
        dm_id,
        reactions: updated.reactions.clone(),
    });
    Ok(Json(updated))
}

pub async fn list_dms(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<DmThread>>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let dms = state
        .db
        .list_dms(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let dms = state
        .db
        .attach_dm_unreads(uid, dms)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(dms))
}

pub async fn open_dm(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<DmThread>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    if uid == user_id {
        return Err(api_err(StatusCode::BAD_REQUEST, "cannot dm yourself"));
    }
    if state
        .db
        .is_blocked_either(uid, user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    {
        return Err(api_err(
            StatusCode::FORBIDDEN,
            "cannot message this user (blocked)",
        ));
    }
    let _peer = state
        .db
        .get_user(user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "user not found"))?;
    let dm_id = state
        .db
        .open_or_get_dm(uid, user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let thread = state
        .db
        .get_dm_thread(dm_id, uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::INTERNAL_SERVER_ERROR, "dm missing"))?;
    Ok(Json(thread))
}

pub async fn create_group_dm(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateGroupDmRequest>,
) -> Result<Json<DmThread>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let thread = state
        .db
        .create_group_dm(uid, &body.name, &body.member_ids)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    Ok(Json(thread))
}

pub async fn list_dm_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(dm_id): Path<Uuid>,
    Query(q): Query<LimitQuery>,
) -> Result<Json<Vec<MessageInfo>>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_dm_participant(&state, dm_id, uid)?;
    let msgs = state
        .db
        .list_dm_messages(dm_id, q.limit.clamp(1, 200))
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let msgs = state
        .db
        .attach_reactions(msgs, uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(msgs))
}

pub async fn send_dm_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(dm_id): Path<Uuid>,
    Json(body): Json<SendMessageRequest>,
) -> Result<Json<MessageInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_dm_participant(&state, dm_id, uid)?;
    if let Ok(Some(thread)) = state.db.get_dm_thread(dm_id, uid) {
        if thread.kind != "group" {
            if let Some(peer) = thread.peer {
                if state
                    .db
                    .is_blocked_either(uid, peer.id)
                    .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
                {
                    return Err(api_err(
                        StatusCode::FORBIDDEN,
                        "cannot message this user (blocked)",
                    ));
                }
            }
        }
    }
    if body.content.trim().is_empty() && body.attachment_url.is_none() {
        return Err(api_err(StatusCode::BAD_REQUEST, "empty message"));
    }
    if let Some(reply_id) = body.reply_to_id {
        let (target, _, _, target_dm) = state
            .db
            .get_message(reply_id)
            .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
            .ok_or_else(|| api_err(StatusCode::BAD_REQUEST, "reply target not found"))?;
        let _ = target;
        if target_dm != Some(dm_id) {
            return Err(api_err(
                StatusCode::BAD_REQUEST,
                "reply target must be in the same DM",
            ));
        }
    }
    let msg = state
        .db
        .insert_message(
            None,
            Some(dm_id),
            uid,
            body.content.trim(),
            body.attachment_url.as_deref(),
            body.attachment_name.as_deref(),
            body.reply_to_id,
        )
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    state.publish(WsEvent::MessageCreated {
        message: msg.clone(),
    });
    Ok(Json(msg))
}

fn require_dm_participant(
    state: &AppState,
    dm_id: Uuid,
    user_id: Uuid,
) -> Result<(), (StatusCode, Json<ApiError>)> {
    let ok = state
        .db
        .is_dm_member(dm_id, user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    if ok {
        Ok(())
    } else {
        Err(api_err(StatusCode::FORBIDDEN, "not a dm participant"))
    }
}

pub async fn upload_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    let _uid = extract_user_id(&headers, &state)?;
    let max_bytes = state.cfg.max_upload_mb * 1024 * 1024;

    let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?
    else {
        return Err(api_err(StatusCode::BAD_REQUEST, "no file provided"));
    };
    let name = field.file_name().unwrap_or("file.bin").to_string();
    let data = field
        .bytes()
        .await
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    if data.len() as u64 > max_bytes {
        return Err(api_err(
            StatusCode::PAYLOAD_TOO_LARGE,
            &format!(
                "file exceeds {} MB limit - paste a direct link for larger files",
                state.cfg.max_upload_mb
            ),
        ));
    }
    let path_name = PathBuf::from(&name);
    let ext = path_name
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let stored = format!("{}.{}", Uuid::new_v4(), ext);
    let path = PathBuf::from(&state.cfg.upload_dir).join(&stored);
    tokio::fs::write(&path, &data)
        .await
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let url = format!("/uploads/{stored}");
    Ok(Json(serde_json::json!({
        "url": url,
        "name": name,
        "size": data.len()
    })))
}

#[derive(Deserialize)]
pub struct WsQuery {
    pub token: Option<String>,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<WsQuery>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiError>)> {
    let token = q
        .token
        .or_else(|| {
            headers
                .get("sec-websocket-protocol")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        })
        .or_else(|| {
            headers
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|a| a.strip_prefix("Bearer ").map(|s| s.to_string()))
        });

    let Some(t) = token else {
        return Err(api_err(
            StatusCode::UNAUTHORIZED,
            "provide token via ?token=, Authorization, or Sec-WebSocket-Protocol",
        ));
    };
    let uid = crate::jwt_util::parse_token(&t, &state.cfg.jwt_secret)
        .map_err(|_| api_err(StatusCode::UNAUTHORIZED, "invalid token"))?;

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, state, uid)))
}

async fn handle_socket(socket: WebSocket, state: AppState, uid: Uuid) {
    *state.online.entry(uid).or_insert(0) += 1;
    state.publish(WsEvent::Presence {
        user_id: uid,
        online: true,
    });

    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.events.subscribe();

    let send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            if let Ok(text) = serde_json::to_string(&event) {
                if sender.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Close(_) => break,
            Message::Text(text) => {
                if let Ok(client_msg) = serde_json::from_str::<WsClientMessage>(&text) {
                    crate::voice_manager::handle_client_message(&state, uid, client_msg);
                }
            }
            _ => {}
        }
    }

    send_task.abort();
    crate::voice_manager::voice_leave(&state, uid, true);
    if let Some(mut count) = state.online.get_mut(&uid) {
        *count = count.saturating_sub(1);
        let remaining = *count;
        drop(count);
        if remaining == 0 {
            state.online.remove(&uid);
            state.publish(WsEvent::Presence {
                user_id: uid,
                online: false,
            });
        }
    }
}

pub async fn mark_channel_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    body: Option<Json<MarkReadRequest>>,
) -> Result<StatusCode, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let channel = state
        .db
        .get_channel(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "channel not found"))?;
    require_member(&state, channel.server_id, uid)?;
    let message_id = body.and_then(|b| b.message_id);
    state
        .db
        .mark_channel_read(uid, id, message_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn mark_dm_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(dm_id): Path<Uuid>,
    body: Option<Json<MarkReadRequest>>,
) -> Result<StatusCode, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    if !state
        .db
        .is_dm_member(dm_id, uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    {
        return Err(api_err(StatusCode::FORBIDDEN, "not a dm member"));
    }
    let message_id = body.and_then(|b| b.message_id);
    state
        .db
        .mark_dm_read(uid, dm_id, message_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct SearchQueryParams {
    pub q: String,
    #[serde(default = "default_search_limit")]
    pub limit: i64,
}

fn default_search_limit() -> i64 {
    25
}

pub async fn search_channel_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Query(q): Query<SearchQueryParams>,
) -> Result<Json<Vec<MessageInfo>>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let channel = state
        .db
        .get_channel(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "channel not found"))?;
    require_member(&state, channel.server_id, uid)?;
    let msgs = state
        .db
        .search_channel_messages(id, &q.q, q.limit)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(msgs))
}

pub async fn search_dm_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(dm_id): Path<Uuid>,
    Query(q): Query<SearchQueryParams>,
) -> Result<Json<Vec<MessageInfo>>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    if !state
        .db
        .is_dm_member(dm_id, uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    {
        return Err(api_err(StatusCode::FORBIDDEN, "not a dm member"));
    }
    let msgs = state
        .db
        .search_dm_messages(dm_id, &q.q, q.limit)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(msgs))
}
