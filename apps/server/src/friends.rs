use crate::auth_api::{api_err, extract_user_id};
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use neuro_shared::*;
use uuid::Uuid;

pub async fn friends_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<FriendsSnapshot>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let ignored_ids: std::collections::HashSet<Uuid> = state
        .db
        .list_ignored(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .into_iter()
        .map(|u| u.id)
        .collect();

    let accepted = state
        .db
        .list_accepted_friends(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    let friends: Vec<FriendEntry> = accepted
        .into_iter()
        .filter(|(u, _)| !ignored_ids.contains(&u.id))
        .map(|(user, since)| FriendEntry {
            online: state.online.contains_key(&user.id),
            user,
            since,
        })
        .collect();

    let incoming = state
        .db
        .list_pending_requests(uid, true)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let outgoing = state
        .db
        .list_pending_requests(uid, false)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let blocked = state
        .db
        .list_blocked(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let ignored = state
        .db
        .list_ignored(uid)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    Ok(Json(FriendsSnapshot {
        friends,
        incoming,
        outgoing,
        blocked,
        ignored,
    }))
}

pub async fn send_friend_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<FriendRequestBody>,
) -> Result<Json<FriendRequestInfo>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let username = body.username.trim();
    if username.is_empty() {
        return Err(api_err(StatusCode::BAD_REQUEST, "username required"));
    }
    let target = state
        .db
        .find_user_by_username(username)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .map(|(u, _)| u)
        .ok_or_else(|| api_err(StatusCode::NOT_FOUND, "user not found"))?;

    let request = state
        .db
        .create_friend_request(uid, target.id)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;

    state.publish(WsEvent::FriendRequestCreated {
        request: request.clone(),
    });
    Ok(Json(request))
}

pub async fn accept_friend_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<FriendEntry>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let friend = state
        .db
        .accept_friend_request(id, uid)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;

    state.publish(WsEvent::FriendAccepted {
        user: friend.clone(),
    });
    // Also notify the other side that *this* user accepted (they need our public profile).
    if let Ok(Some(me)) = state.db.get_user(uid) {
        state.publish(WsEvent::FriendAccepted { user: me });
    }

    Ok(Json(FriendEntry {
        online: state.online.contains_key(&friend.id),
        since: chrono::Utc::now(),
        user: friend,
    }))
}

pub async fn decline_friend_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    state
        .db
        .decline_or_cancel_friend_request(id, uid)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn remove_friend(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let removed = state
        .db
        .remove_friendship(uid, user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    if !removed {
        return Err(api_err(StatusCode::NOT_FOUND, "not friends"));
    }
    state.publish(WsEvent::FriendRemoved { user_id });
    state.publish(WsEvent::FriendRemoved { user_id: uid });
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn block_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    state
        .db
        .block_user(uid, user_id)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    state.publish(WsEvent::FriendRemoved { user_id });
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn unblock_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let ok = state
        .db
        .unblock_user(uid, user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    if !ok {
        return Err(api_err(StatusCode::NOT_FOUND, "not blocked"));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn ignore_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    state
        .db
        .ignore_user(uid, user_id)
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn unignore_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    let ok = state
        .db
        .unignore_user(uid, user_id)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    if !ok {
        return Err(api_err(StatusCode::NOT_FOUND, "not ignored"));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
