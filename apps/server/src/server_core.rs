use crate::auth_api::{api_err, extract_user_id};
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use neuro_shared::*;
use uuid::Uuid;

pub async fn list_servers(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<ServerInfo>>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let servers = if state
        .db
        .is_global_admin(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    {
        state
            .db
            .list_all_servers()
            .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    } else {
        state
            .db
            .list_servers_for_user(uid)
            .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    };
    Ok(Json(servers))
}

pub async fn create_server(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateServerRequest>,
) -> Result<Json<ServerInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    validate_server_name(&body.name)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    if let Some(ref url) = body.icon_url {
        validate_image_url(url).map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    }
    let server = state
        .db
        .create_server(
            uid,
            &body.name,
            body.description.as_deref(),
            body.icon_url.as_deref(),
        )
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    crate::activity_log::activity(
        "server_new",
        &format!(
            "name=\"{}\" invite={} owner={}",
            server.name, server.invite_code, uid
        ),
    );
    Ok(Json(server))
}

pub async fn join_server(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<JoinServerRequest>,
) -> Result<Json<ServerInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let server = state
        .db
        .join_server(uid, body.invite_code.trim())
        .map_err(|_| api_err(StatusCode::NOT_FOUND, "invalid invite code"))?;
    crate::activity_log::activity(
        "server_join",
        &format!(
            "invite={} user={} server=\"{}\"",
            body.invite_code.trim(),
            uid,
            server.name
        ),
    );
    if let Ok(Some(user)) = state.db.get_user(uid) {
        if let Ok(Some(rank)) = state.db.member_rank(server.id, uid) {
            state.publish(WsEvent::MemberJoined {
                server_id: server.id,
                member: MemberInfo {
                    user,
                    rank,
                    joined_at: chrono::Utc::now(),
                },
            });
        }
    }
    Ok(Json(server))
}

pub async fn get_server(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<ServerInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_member(&state, id, uid)?;
    let server = state
        .db
        .get_server(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "server not found"))?;
    Ok(Json(server))
}

pub async fn list_channels(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<ChannelInfo>>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_member(&state, id, uid)?;
    let channels = state
        .db
        .list_channels(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(channels))
}

pub async fn create_channel(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateChannelRequest>,
) -> Result<Json<ChannelInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let rank = require_member(&state, id, uid)?;
    if !rank.can_admin() {
        return Err(api_err(StatusCode::FORBIDDEN, "admin required"));
    }
    validate_channel_name(&body.name)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    let channel = state
        .db
        .create_channel(id, &body.name, body.kind)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(channel))
}

pub async fn rename_channel(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<RenameChannelRequest>,
) -> Result<Json<ChannelInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let channel = state
        .db
        .get_channel(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "channel not found"))?;
    let rank = require_member(&state, channel.server_id, uid)?;
    if !rank.can_admin() {
        return Err(api_err(StatusCode::FORBIDDEN, "admin required"));
    }
    validate_channel_name(&body.name)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    state
        .db
        .rename_channel(id, &body.name)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(ChannelInfo {
        name: body.name,
        ..channel
    }))
}

pub async fn delete_channel(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let channel = state
        .db
        .get_channel(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "channel not found"))?;
    let rank = require_member(&state, channel.server_id, uid)?;
    if !rank.can_admin() {
        return Err(api_err(StatusCode::FORBIDDEN, "admin required"));
    }
    state
        .db
        .delete_channel(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    crate::activity_log::activity("channel_del", &format!("id={} by={}", id, uid));
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<MemberInfo>>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_member(&state, id, uid)?;
    let members = state
        .db
        .list_members(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(members))
}

pub async fn set_rank(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<SetRankRequest>,
) -> Result<Json<MemberInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let actor_rank = require_member(&state, id, uid)?;
    if !actor_rank.can_admin() {
        return Err(api_err(StatusCode::FORBIDDEN, "admin required"));
    }
    if body.rank == Rank::Owner {
        return Err(api_err(StatusCode::BAD_REQUEST, "cannot assign owner rank"));
    }
    let target_rank = state
        .db
        .member_rank(id, body.user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "member not found"))?;
    if target_rank == Rank::Owner {
        return Err(api_err(StatusCode::FORBIDDEN, "cannot change owner rank"));
    }
    state
        .db
        .set_rank(id, body.user_id, body.rank)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let user = state
        .db
        .get_user(body.user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "user not found"))?;
    let member = MemberInfo {
        user,
        rank: body.rank,
        joined_at: chrono::Utc::now(),
    };
    state.publish(WsEvent::MemberUpdated {
        server_id: id,
        member: member.clone(),
    });
    Ok(Json(member))
}

pub fn require_member(
    state: &AppState,
    server_id: Uuid,
    user_id: Uuid,
) -> Result<Rank, (StatusCode, Json<ApiError>)> {
    if state
        .db
        .is_global_admin(user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    {
        return Ok(Rank::Owner);
    }
    state
        .db
        .member_rank(server_id, user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::FORBIDDEN, "not a member"))
}
