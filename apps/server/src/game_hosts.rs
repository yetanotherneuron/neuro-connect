use crate::admin_api::require_global_admin;
use crate::auth_api::{api_err, extract_user_id, require_not_banned};
use crate::server_core::require_member;
use crate::state::AppState;
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use neuro_shared::*;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct ListQuery {
    pub server_id: Option<Uuid>,
}

pub async fn list_game_hosts(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<GameHostInfo>>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_not_banned(&state, uid)?;
    let list = state
        .db
        .list_game_hosts(q.server_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(list))
}

pub async fn get_game_host_by_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(code): Path<String>,
) -> Result<Json<GameHostInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_not_banned(&state, uid)?;
    state
        .db
        .get_game_host_by_code(&code)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .map(Json)
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "room code not found or expired"))
}

pub async fn create_game_host(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateGameHostRequest>,
) -> Result<Json<GameHostInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_not_banned(&state, uid)?;
    let game_name = body.game_name.trim();
    let address = body.address.trim();
    if game_name.is_empty() || address.is_empty() {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "game_name and address are required",
        ));
    }
    if let Some(sid) = body.server_id {
        require_member(&state, sid, uid)?;
    }
    let ttl = body.ttl_minutes.unwrap_or(120).clamp(5, 1440);
    let app_id = body
        .app_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let connect_command = body
        .connect_command
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if body.kind == GameHostKind::Goldberg && app_id.is_none() {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "app_id is required for Goldberg / Steam LAN hosts",
        ));
    }
    let host = state
        .db
        .create_game_host(
            uid,
            game_name,
            address,
            body.note.trim(),
            body.kind,
            app_id,
            connect_command,
            body.server_id,
            ttl,
        )
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    state.publish(WsEvent::GameHostUpdated { host: host.clone() });
    Ok(Json(host))
}

pub async fn delete_game_host(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_not_banned(&state, uid)?;
    let existing = state
        .db
        .get_game_host(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "game host not found"))?;

    let is_owner = existing.user.id == uid;
    let is_ga = require_global_admin(&state, uid).is_ok();
    let is_mod = if let Some(sid) = existing.server_id {
        require_member(&state, sid, uid)
            .map(|r| r.can_moderate())
            .unwrap_or(false)
    } else {
        false
    };
    if !(is_owner || is_ga || is_mod) {
        return Err(api_err(StatusCode::FORBIDDEN, "not allowed to delete"));
    }

    state
        .db
        .delete_game_host(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    state.publish(WsEvent::GameHostRemoved { host_id: id });
    Ok(StatusCode::NO_CONTENT)
}
