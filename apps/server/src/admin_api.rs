use crate::auth_api::{api_err, extract_user_id, require_not_banned};
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use neuro_shared::*;
use uuid::Uuid;

pub fn require_global_admin(
    state: &AppState,
    user_id: Uuid,
) -> Result<(), (StatusCode, Json<ApiError>)> {
    let ok = state
        .db
        .is_global_admin(user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    if ok {
        Ok(())
    } else {
        Err(api_err(StatusCode::FORBIDDEN, "global admin required"))
    }
}

pub async fn claim_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ClaimAdminRequest>,
) -> Result<Json<UserPublic>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_not_banned(&state, uid)?;
    let configured = state.cfg.global_admin_username.trim();
    if configured.is_empty() {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "global admin mode is disabled in server config",
        ));
    }
    let secret = state.cfg.global_admin_bootstrap_secret.trim();
    if secret.is_empty() {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "bootstrap secret is not configured - admin auto-elevates on login",
        ));
    }
    if body.bootstrap_secret != secret {
        return Err(api_err(StatusCode::FORBIDDEN, "invalid bootstrap secret"));
    }
    let user = state
        .db
        .get_user(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "user not found"))?;
    if !user.username.eq_ignore_ascii_case(configured) {
        return Err(api_err(
            StatusCode::FORBIDDEN,
            "only the configured global_admin_username can claim",
        ));
    }
    state
        .db
        .set_global_admin(uid, true)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let user = state
        .db
        .get_user(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "user not found"))?;
    Ok(Json(user))
}

pub async fn list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<AdminUserInfo>>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_not_banned(&state, uid)?;
    require_global_admin(&state, uid)?;
    let users = state
        .db
        .list_all_users_admin()
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(users))
}

pub async fn ban_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<BanUserRequest>,
) -> Result<StatusCode, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_not_banned(&state, uid)?;
    require_global_admin(&state, uid)?;
    if id == uid {
        return Err(api_err(StatusCode::BAD_REQUEST, "cannot ban yourself"));
    }
    if state
        .db
        .is_global_admin(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    {
        return Err(api_err(StatusCode::FORBIDDEN, "cannot ban a global admin"));
    }
    state
        .db
        .ban_user(id, body.reason.trim())
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    crate::activity_log::activity(
        "ban",
        &format!("target={} by={} reason={}", id, uid, body.reason.trim()),
    );
    Ok(StatusCode::NO_CONTENT)
}

pub async fn unban_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_not_banned(&state, uid)?;
    require_global_admin(&state, uid)?;
    state
        .db
        .unban_user(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_server(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_not_banned(&state, uid)?;
    require_global_admin(&state, uid)?;
    state
        .db
        .delete_server(id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}
