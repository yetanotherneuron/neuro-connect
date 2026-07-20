use crate::jwt_util::{issue_token, parse_token};
use crate::state::AppState;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use neuro_shared::*;
use uuid::Uuid;

pub fn extract_user_id(headers: &HeaderMap, state: &AppState) -> Result<Uuid, (StatusCode, Json<ApiError>)> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| api_err(StatusCode::UNAUTHORIZED, "missing authorization"))?;
    let token = auth
        .strip_prefix("Bearer ")
        .ok_or_else(|| api_err(StatusCode::UNAUTHORIZED, "invalid authorization"))?;
    let uid = parse_token(token, &state.cfg.jwt_secret)
        .map_err(|_| api_err(StatusCode::UNAUTHORIZED, "invalid token"))?;
    require_not_banned(state, uid)?;
    Ok(uid)
}

pub fn require_not_banned(
    state: &AppState,
    user_id: Uuid,
) -> Result<(), (StatusCode, Json<ApiError>)> {
    let banned = state
        .db
        .is_user_banned(user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    if banned {
        Err(api_err(StatusCode::FORBIDDEN, "account is banned"))
    } else {
        Ok(())
    }
}

pub fn api_err(status: StatusCode, msg: &str) -> (StatusCode, Json<ApiError>) {
    (
        status,
        Json(ApiError {
            error: msg.to_string(),
        }),
    )
}

fn maybe_elevate(state: &AppState, username: &str) -> Result<Option<UserPublic>, (StatusCode, Json<ApiError>)> {
    let bootstrap_required = !state.cfg.global_admin_bootstrap_secret.trim().is_empty();
    state
        .db
        .try_auto_elevate_global_admin(
            username,
            state.cfg.global_admin_username.trim(),
            bootstrap_required,
        )
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))
}

pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ApiError>)> {
    validate_username(&body.username).map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    validate_password(&body.password).map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    validate_display_name(&body.display_name)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;

    if state
        .db
        .find_user_by_username(&body.username)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .is_some()
    {
        return Err(api_err(StatusCode::CONFLICT, "username already taken"));
    }

    let hash =
        hash_password(&body.password).map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let mut user = state
        .db
        .create_user(&body.username, &hash, &body.display_name)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    if let Some(elevated) = maybe_elevate(&state, &body.username)? {
        user = elevated;
    }
    let token = issue_token(user.id, &state.cfg.jwt_secret, state.cfg.token_ttl_hours)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    crate::activity_log::activity(
        "register",
        &format!("user=@{} display=\"{}\" id={}", user.username, user.display_name, user.id),
    );
    Ok(Json(AuthResponse { token, user }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ApiError>)> {
    let found = state
        .db
        .find_user_by_username(&body.username)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| {
            crate::activity_log::activity("login_fail", &format!("user=@{} (unknown)", body.username));
            api_err(StatusCode::UNAUTHORIZED, "invalid username or password")
        })?;

    let (user, hash) = found;
    if state
        .db
        .is_user_banned(user.id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
    {
        crate::activity_log::activity("login_fail", &format!("user=@{} (banned)", user.username));
        return Err(api_err(StatusCode::FORBIDDEN, "account is banned"));
    }
    let ok = verify_password(&body.password, &hash)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    if !ok {
        crate::activity_log::activity("login_fail", &format!("user=@{} (bad password)", user.username));
        return Err(api_err(StatusCode::UNAUTHORIZED, "invalid username or password"));
    }
    let user = maybe_elevate(&state, &body.username)?.unwrap_or(user);
    let token = issue_token(user.id, &state.cfg.jwt_secret, state.cfg.token_ttl_hours)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    crate::activity_log::activity(
        "login",
        &format!(
            "user=@{} admin={}",
            user.username,
            if user.is_global_admin { "yes" } else { "no" }
        ),
    );
    Ok(Json(AuthResponse { token, user }))
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let name = state
        .db
        .get_user(uid)
        .ok()
        .flatten()
        .map(|u| u.username)
        .unwrap_or_else(|| uid.to_string());
    crate::activity_log::activity("logout", &format!("user=@{name}"));
    Ok(StatusCode::NO_CONTENT)
}

pub async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<UserPublic>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let user = state
        .db
        .get_user(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "user not found"))?;
    Ok(Json(user))
}

pub async fn update_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UpdateProfileRequest>,
) -> Result<Json<UserPublic>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    if let Some(ref name) = body.display_name {
        validate_display_name(name).map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    }
    if let Some(ref url) = body.avatar_url {
        validate_image_url(url).map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    }
    if let Some(ref url) = body.banner_url {
        validate_image_url(url).map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    }
    let user = state
        .db
        .update_profile(
            uid,
            body.display_name.as_deref(),
            body.avatar_url.as_deref(),
            body.banner_url.as_deref(),
        )
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(user))
}
