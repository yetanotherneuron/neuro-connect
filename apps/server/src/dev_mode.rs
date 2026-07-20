use crate::auth_api::{api_err, extract_user_id, require_not_banned};
use crate::config::is_loopback_bind;
use crate::state::AppState;
use axum::{extract::State, http::HeaderMap, Json};
use neuro_shared::*;

pub async fn server_meta(State(state): State<AppState>) -> Json<ServerMeta> {
    Json(ServerMeta {
        version: env!("CARGO_PKG_VERSION").to_string(),
        dev_mode: state.cfg.dev_mode,
        global_admin_enabled: !state.cfg.global_admin_username.trim().is_empty(),
    })
}

/// Seed demo accounts + server when `dev_mode` and the user table is empty.
pub fn seed_dev_data(state: &AppState) -> anyhow::Result<()> {
    if !state.cfg.dev_mode {
        return Ok(());
    }
    if !is_loopback_bind(&state.cfg.bind) {
        tracing::warn!(
            "dev_mode is enabled but bind={} is not loopback - use 127.0.0.1 for safe testing",
            state.cfg.bind
        );
    }
    if state.db.user_count()? > 0 {
        tracing::info!("dev_mode: database already has users - skip seed");
        return Ok(());
    }

    let hash = hash_password("devpass12")?;
    let owner = state.db.create_user("devuser", &hash, "Dev User")?;
    state.db.set_global_admin(owner.id, true)?;

    let hash2 = hash_password("devpass12")?;
    let _peer = state.db.create_user("devbuddy", &hash2, "Dev Buddy")?;

    let server = state.db.create_server(
        owner.id,
        "Dev Playground",
        Some("Seeded automatically in development mode"),
        None,
    )?;

    // Ensure peer is a member for multi-user local tests.
    let _ = state.db.join_server(
        state
            .db
            .find_user_by_username("devbuddy")?
            .map(|(u, _)| u.id)
            .unwrap(),
        &server.invite_code,
    );

    tracing::info!(
        "dev_mode seed ready - login as devuser / devpass12 (global admin). Invite: {}",
        server.invite_code
    );
    Ok(())
}

pub async fn whoami_debug(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<ApiError>)> {
    if !state.cfg.dev_mode {
        return Err(api_err(
            axum::http::StatusCode::NOT_FOUND,
            "only available in dev_mode",
        ));
    }
    let uid = extract_user_id(&headers, &state)?;
    require_not_banned(&state, uid)?;
    let user = state
        .db
        .get_user(uid)
        .map_err(|e| {
            api_err(
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                &e.to_string(),
            )
        })?
        .ok_or_else(|| api_err(axum::http::StatusCode::NOT_FOUND, "user not found"))?;
    Ok(Json(serde_json::json!({
        "user": user,
        "dev_mode": true,
        "note": "debug helper - not for production"
    })))
}
