use crate::auth_api::{api_err, extract_user_id};
use crate::admin_api::require_global_admin;
use crate::state::AppState;
use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::Response,
    Json,
};
use chrono::Utc;
use neuro_shared::{ApiError, UpdateManifest};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::path::{Path as FsPath, PathBuf};

fn updates_root(state: &AppState) -> PathBuf {
    if let Some(parent) = FsPath::new(&state.cfg.database_path).parent() {
        parent.join("updates")
    } else {
        PathBuf::from("data/updates")
    }
}

fn manifest_path(root: &FsPath, channel: &str, platform: &str) -> PathBuf {
    root.join(channel).join(platform).join("manifest.json")
}

fn artifact_dir(root: &FsPath, channel: &str, platform: &str) -> PathBuf {
    root.join(channel).join(platform)
}

#[derive(Deserialize)]
pub struct LatestQuery {
    pub channel: String,
    pub platform: String,
}

pub async fn latest_update(
    State(state): State<AppState>,
    Query(q): Query<LatestQuery>,
) -> Result<Json<UpdateManifest>, (StatusCode, Json<ApiError>)> {
    let path = manifest_path(&updates_root(&state), &q.channel, &q.platform);
    if !path.exists() {
        return Err(api_err(StatusCode::NOT_FOUND, "no update published"));
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let manifest: UpdateManifest = serde_json::from_str(&raw)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(manifest))
}

pub async fn download_update(
    State(state): State<AppState>,
    Path((channel, platform, filename)): Path<(String, String, String)>,
) -> Result<Response, (StatusCode, Json<ApiError>)> {
    let safe_name = FsPath::new(&filename)
        .file_name()
        .ok_or_else(|| api_err(StatusCode::BAD_REQUEST, "invalid filename"))?;
    let path = artifact_dir(&updates_root(&state), &channel, &platform).join(safe_name);
    if !path.exists() {
        return Err(api_err(StatusCode::NOT_FOUND, "artifact not found"));
    }
    let bytes = std::fs::read(&path)
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let body = Body::from(bytes);
    let mut res = Response::new(body);
    res.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/octet-stream"),
    );
    res.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        header::HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename))
            .unwrap_or_else(|_| header::HeaderValue::from_static("attachment")),
    );
    Ok(res)
}

pub async fn publish_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<UpdateManifest>, (StatusCode, Json<ApiError>)> {
    let uid = extract_user_id(&headers, &state)?;
    require_global_admin(&state, uid)?;

    let mut version = String::new();
    let mut channel = String::from("beta");
    let mut platform = String::from("windows-x64");
    let mut notes = String::new();
    let mut filename = String::new();
    let mut file_bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "version" => version = field.text().await.unwrap_or_default(),
            "channel" => channel = field.text().await.unwrap_or_default(),
            "platform" => platform = field.text().await.unwrap_or_default(),
            "notes" => notes = field.text().await.unwrap_or_default(),
            "file" => {
                filename = field
                    .file_name()
                    .unwrap_or("update.bin")
                    .to_string();
                file_bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| api_err(StatusCode::BAD_REQUEST, &e.to_string()))?
                        .to_vec(),
                );
            }
            _ => {}
        }
    }

    if version.trim().is_empty() {
        return Err(api_err(StatusCode::BAD_REQUEST, "version required"));
    }
    let Some(bytes) = file_bytes else {
        return Err(api_err(StatusCode::BAD_REQUEST, "file required"));
    };

    let manifest = write_update_artifact(
        &updates_root(&state),
        &channel,
        &platform,
        version.trim(),
        &notes,
        &filename,
        &bytes,
    )
    .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &e))?;

    Ok(Json(manifest))
}

pub fn write_update_artifact(
    root: &FsPath,
    channel: &str,
    platform: &str,
    version: &str,
    notes: &str,
    filename: &str,
    bytes: &[u8],
) -> Result<UpdateManifest, String> {
    let dir = artifact_dir(root, channel, platform);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe = FsPath::new(filename)
        .file_name()
        .ok_or_else(|| "invalid filename".to_string())?
        .to_string_lossy()
        .to_string();
    let path = dir.join(&safe);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let sha256 = format!("{:x}", hasher.finalize());

    let manifest = UpdateManifest {
        version: version.to_string(),
        channel: channel.to_string(),
        platform: platform.to_string(),
        notes: notes.to_string(),
        filename: safe,
        sha256,
        published_at: Utc::now().to_rfc3339(),
    };
    let man_path = manifest_path(root, channel, platform);
    let raw = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(man_path, raw).map_err(|e| e.to_string())?;
    Ok(manifest)
}

/// CLI helper: `neuro-server update publish --config ... --channel beta ...`
pub fn cli_publish(
    config_path: &FsPath,
    channel: &str,
    platform: &str,
    version: &str,
    notes: &str,
    file: &FsPath,
) -> anyhow::Result<()> {
    let cfg = crate::config::load_config(config_path)?;
    let root = if let Some(parent) = FsPath::new(&cfg.database_path).parent() {
        parent.join("updates")
    } else {
        PathBuf::from("data/updates")
    };
    let bytes = std::fs::read(file)?;
    let filename = file
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("update.bin");
    let manifest = write_update_artifact(&root, channel, platform, version, notes, filename, &bytes)
        .map_err(|e| anyhow::anyhow!(e))?;
    println!(
        "Published {} {} {} -> {}",
        manifest.channel, manifest.platform, manifest.version, manifest.filename
    );
    Ok(())
}
