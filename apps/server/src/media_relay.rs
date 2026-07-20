//! Server-side media URL relay: paste a direct link → clients stream via this server.
//! Protects the origin host from N viewers and keeps one shared playback source.

use crate::auth_api::{api_err, extract_user_id};
use crate::jwt_util::parse_token;
use crate::server_core::require_member;
use crate::state::AppState;
use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::Response,
    Json,
};
use chrono::Utc;
use futures_util::TryStreamExt;
use neuro_shared::*;
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use uuid::Uuid;

const MAX_URL_LEN: usize = 2048;
const HEAD_TIMEOUT_SECS: u64 = 12;
const STREAM_CONNECT_TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Clone)]
pub struct ActiveMediaRelay {
    pub info: MediaRelayInfo,
}

pub type MediaRelaySlot = Arc<RwLock<Option<ActiveMediaRelay>>>;

pub fn new_slot() -> MediaRelaySlot {
    Arc::new(RwLock::new(None))
}

fn probe_client() -> Result<reqwest::Client, (StatusCode, Json<ApiError>)> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(3))
        .timeout(Duration::from_secs(HEAD_TIMEOUT_SECS))
        .connect_timeout(Duration::from_secs(STREAM_CONNECT_TIMEOUT_SECS))
        .user_agent(concat!(
            "NeuroConnect-MediaRelay/",
            env!("CARGO_PKG_VERSION")
        ))
        .build()
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))
}

fn stream_client() -> Result<reqwest::Client, (StatusCode, Json<ApiError>)> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(3))
        .connect_timeout(Duration::from_secs(STREAM_CONNECT_TIMEOUT_SECS))
        // No total timeout — media may stream for a long time.
        .user_agent(concat!(
            "NeuroConnect-MediaRelay/",
            env!("CARGO_PKG_VERSION")
        ))
        .build()
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))
}

fn validate_media_url(raw: &str) -> Result<reqwest::Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("url required".into());
    }
    if trimmed.len() > MAX_URL_LEN {
        return Err("url too long".into());
    }
    let parsed = reqwest::Url::parse(trimmed).map_err(|_| "invalid url".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("only http(s) urls are allowed".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "url must include a host".to_string())?;
    if is_blocked_host(host) {
        return Err("url host is not allowed (private/local addresses blocked)".into());
    }
    Ok(parsed)
}

fn is_blocked_host(host: &str) -> bool {
    let lower = host.to_ascii_lowercase();
    if lower == "localhost" || lower.ends_with(".localhost") || lower.ends_with(".local") {
        return true;
    }
    if let Ok(ip) = lower.parse::<IpAddr>() {
        return ip_is_private_or_local(ip);
    }
    false
}

fn ip_is_private_or_local(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                || v6.is_unspecified()
        }
    }
}

fn looks_like_media(content_type: Option<&str>, url: &reqwest::Url) -> bool {
    if let Some(ct) = content_type {
        let ct = ct.to_ascii_lowercase();
        if ct.starts_with("audio/")
            || ct.starts_with("video/")
            || ct.contains("ogg")
            || ct.contains("mpegurl")
            || ct.contains("mp2t")
        {
            return true;
        }
        // Reject obvious HTML pages
        if ct.starts_with("text/html") || ct.starts_with("text/plain") {
            return false;
        }
    }
    let path = url.path().to_ascii_lowercase();
    const EXTS: &[&str] = &[
        ".mp3", ".mp4", ".m4a", ".ogg", ".oga", ".opus", ".wav", ".webm", ".flac", ".aac", ".mkv",
        ".mov", ".m3u8",
    ];
    EXTS.iter().any(|ext| path.ends_with(ext))
}

pub async fn media_status(State(state): State<AppState>) -> Json<Value> {
    let guard = state.media_relay.read().await;
    if let Some(active) = guard.as_ref() {
        return Json(json!({
            "status": "ready",
            "ready": true,
            "active": true,
            "relay": active.info,
            "message": "Media URL relay is active."
        }));
    }
    Json(json!({
        "status": "ready",
        "ready": true,
        "active": false,
        "relay": null,
        "message": "Paste a direct media link to stream it through this server."
    }))
}

pub async fn start_media_relay(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<StartMediaRelayRequest>,
) -> Result<Json<MediaRelayInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let url = validate_media_url(&body.url).map_err(|e| api_err(StatusCode::BAD_REQUEST, &e))?;

    if let Some(server_id) = body.server_id {
        require_member(&state, server_id, uid)?;
    }
    if let Some(channel_id) = body.channel_id {
        let channel = state
            .db
            .get_channel(channel_id)
            .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
            .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "channel not found"))?;
        require_member(&state, channel.server_id, uid)?;
    }

    {
        let guard = state.media_relay.read().await;
        if guard.is_some() {
            return Err(api_err(
                StatusCode::CONFLICT,
                "a media relay is already active — stop it first",
            ));
        }
    }

    let client = probe_client()?;
    let probe = client
        .get(url.as_str())
        .header(header::RANGE, "bytes=0-0")
        .send()
        .await
        .map_err(|e| {
            api_err(
                StatusCode::BAD_GATEWAY,
                &format!("could not reach media url: {e}"),
            )
        })?;

    let status = probe.status();
    if !(status.is_success() || status.as_u16() == 206) {
        return Err(api_err(
            StatusCode::BAD_GATEWAY,
            &format!("media url returned HTTP {status}"),
        ));
    }

    let content_type = probe
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or(s).trim().to_string());

    // Drop probe body promptly (only a tiny range was requested).
    drop(probe);

    if !looks_like_media(content_type.as_deref(), &url) {
        return Err(api_err(
            StatusCode::BAD_REQUEST,
            "url does not look like a direct audio/video link",
        ));
    }

    let user = state
        .db
        .get_user(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::UNAUTHORIZED, "user not found"))?;

    let id = Uuid::new_v4();
    let title = {
        let t = body.title.trim();
        if t.is_empty() {
            url.path_segments()
                .and_then(|mut s| s.next_back())
                .filter(|s| !s.is_empty())
                .unwrap_or("Media stream")
                .to_string()
        } else {
            t.chars().take(120).collect()
        }
    };

    let info = MediaRelayInfo {
        id,
        source_url: url.to_string(),
        stream_path: format!("/api/media/stream/{id}"),
        title,
        content_type,
        started_by: user,
        channel_id: body.channel_id,
        server_id: body.server_id,
        started_at: Utc::now(),
    };

    {
        let mut guard = state.media_relay.write().await;
        if guard.is_some() {
            return Err(api_err(
                StatusCode::CONFLICT,
                "a media relay is already active — stop it first",
            ));
        }
        *guard = Some(ActiveMediaRelay { info: info.clone() });
    }

    state.publish(WsEvent::MediaRelayStarted {
        relay: info.clone(),
    });
    Ok(Json(info))
}

pub async fn stop_media_relay(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let user = state
        .db
        .get_user(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| api_err(StatusCode::UNAUTHORIZED, "user not found"))?;

    let mut guard = state.media_relay.write().await;
    let Some(active) = guard.as_ref() else {
        return Err(api_err(StatusCode::NOT_FOUND, "no active media relay"));
    };

    let can_stop = active.info.started_by.id == uid || user.is_global_admin;
    if !can_stop {
        if let Some(server_id) = active.info.server_id {
            if let Ok(rank) = require_member(&state, server_id, uid) {
                if !rank.can_moderate() {
                    return Err(api_err(
                        StatusCode::FORBIDDEN,
                        "not allowed to stop this relay",
                    ));
                }
            } else {
                return Err(api_err(
                    StatusCode::FORBIDDEN,
                    "not allowed to stop this relay",
                ));
            }
        } else {
            return Err(api_err(
                StatusCode::FORBIDDEN,
                "not allowed to stop this relay",
            ));
        }
    }

    let id = active.info.id;
    *guard = None;
    drop(guard);
    state.publish(WsEvent::MediaRelayStopped { relay_id: id });
    Ok(Json(json!({ "ok": true, "relay_id": id })))
}

#[derive(Deserialize)]
pub struct StreamQuery {
    pub token: Option<String>,
}

pub async fn stream_media(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(q): Query<StreamQuery>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, Json<ApiError>)> {
    // Auth via Bearer or ?token= (needed for <audio>/<video> elements).
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
        .or(q.token);
    let token = token.ok_or_else(|| api_err(StatusCode::UNAUTHORIZED, "missing token"))?;
    let uid = parse_token(&token, &state.cfg.jwt_secret)
        .map_err(|_| api_err(StatusCode::UNAUTHORIZED, "invalid token"))?;
    crate::auth_api::require_not_banned(&state, uid)?;

    let source_url = {
        let guard = state.media_relay.read().await;
        let active = guard
            .as_ref()
            .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "no active media relay"))?;
        if active.info.id != id {
            return Err(api_err(StatusCode::NOT_FOUND, "relay not found"));
        }
        active.info.source_url.clone()
    };

    let client = stream_client()?;
    let mut upstream_req = client.get(&source_url);
    if let Some(range) = headers.get(header::RANGE) {
        upstream_req = upstream_req.header(header::RANGE, range);
    }

    let upstream = upstream_req.send().await.map_err(|e| {
        api_err(
            StatusCode::BAD_GATEWAY,
            &format!("upstream fetch failed: {e}"),
        )
    })?;

    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut builder = Response::builder().status(status);

    for name in [
        header::CONTENT_TYPE,
        header::CONTENT_LENGTH,
        header::CONTENT_RANGE,
        header::ACCEPT_RANGES,
        header::CACHE_CONTROL,
    ] {
        if let Some(val) = upstream.headers().get(&name) {
            builder = builder.header(name, val);
        }
    }
    if builder
        .headers_ref()
        .and_then(|h| h.get(header::CONTENT_TYPE))
        .is_none()
    {
        builder = builder.header(header::CONTENT_TYPE, "application/octet-stream");
    }

    let stream = upstream
        .bytes_stream()
        .map_err(|e| std::io::Error::other(e.to_string()));
    let body = Body::from_stream(stream);
    builder
        .body(body)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))
}
