use crate::config::{save_client_config, ClientConfig};
use crate::local_db::LocalDb;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct AppHandleState {
    pub db: LocalDb,
    pub cfg: Mutex<ClientConfig>,
    pub data_dir: PathBuf,
}

#[tauri::command]
pub fn get_config(state: State<'_, AppHandleState>) -> ClientConfig {
    state.cfg.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_server_url(
    state: State<'_, AppHandleState>,
    url: String,
) -> Result<ClientConfig, String> {
    let mut cfg = state.cfg.lock().unwrap();
    cfg.server_url = url;
    save_client_config(&state.data_dir, &cfg).map_err(|e| e.to_string())?;
    Ok(cfg.clone())
}

#[derive(Debug, Deserialize)]
pub struct VoiceSettingsPatch {
    pub push_to_talk: bool,
    pub hotkey_push_to_talk: String,
    pub hotkey_mute: String,
    pub hotkey_deafen: String,
    pub voice_sounds: bool,
}

#[tauri::command]
pub fn set_voice_settings(
    state: State<'_, AppHandleState>,
    settings: VoiceSettingsPatch,
) -> Result<ClientConfig, String> {
    let mut cfg = state.cfg.lock().unwrap();
    cfg.push_to_talk = settings.push_to_talk;
    cfg.hotkey_push_to_talk = settings.hotkey_push_to_talk;
    cfg.hotkey_mute = settings.hotkey_mute;
    cfg.hotkey_deafen = settings.hotkey_deafen;
    cfg.voice_sounds = settings.voice_sounds;
    save_client_config(&state.data_dir, &cfg).map_err(|e| e.to_string())?;
    Ok(cfg.clone())
}

#[derive(Serialize)]
pub struct SessionData {
    pub token: String,
    pub user_json: String,
}

#[tauri::command]
pub fn get_session(state: State<'_, AppHandleState>) -> Result<Option<SessionData>, String> {
    state
        .db
        .get_session()
        .map(|o| o.map(|(token, user_json)| SessionData { token, user_json }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_session(
    state: State<'_, AppHandleState>,
    token: String,
    user_json: String,
) -> Result<(), String> {
    state
        .db
        .save_session(&token, &user_json)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_session(state: State<'_, AppHandleState>) -> Result<(), String> {
    state.db.clear_session().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cache_messages(
    state: State<'_, AppHandleState>,
    id: String,
    scope: String,
    payload: String,
    created_at: String,
) -> Result<(), String> {
    state
        .db
        .cache_message(&id, &scope, &payload, &created_at)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_cached_messages(
    state: State<'_, AppHandleState>,
    scope: String,
    limit: i64,
) -> Result<Vec<String>, String> {
    state
        .db
        .load_cached(&scope, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn voice_stub_status() -> serde_json::Value {
    crate::voice_manager::status()
}

#[tauri::command]
pub fn lan_stub_status() -> serde_json::Value {
    crate::lan_discovery::status()
}

#[tauri::command]
pub fn browse_lan_servers(
    timeout_ms: Option<u64>,
) -> Result<Vec<crate::lan_discovery::LanPeer>, String> {
    crate::lan_discovery::browse_neuro_servers(timeout_ms.unwrap_or(2500))
}

#[tauri::command]
pub fn local_ipv4() -> Result<String, String> {
    crate::lan_discovery::local_ipv4()
}

#[tauri::command]
pub async fn apply_update(
    url: String,
    sha256: String,
    filename: String,
) -> Result<serde_json::Value, String> {
    crate::update_manager::apply_update(url, sha256, filename).await
}

#[tauri::command]
pub fn goldberg_status(state: State<'_, AppHandleState>) -> crate::goldberg::GoldbergStatus {
    crate::goldberg::status(&state.data_dir)
}

#[tauri::command]
pub fn goldberg_import_assets(
    state: State<'_, AppHandleState>,
) -> Result<crate::goldberg::GoldbergStatus, String> {
    crate::goldberg::pick_import_folder(&state.data_dir)
}

#[tauri::command]
pub fn goldberg_prepare_game(
    state: State<'_, AppHandleState>,
    app_id: String,
    account_name: String,
    listen_port: Option<u16>,
) -> Result<crate::goldberg::PreparedGame, String> {
    crate::goldberg::pick_and_prepare_game(&state.data_dir, &app_id, &account_name, listen_port)
}

#[tauri::command]
pub fn goldberg_apply_broadcasts(
    state: State<'_, AppHandleState>,
    ips: Vec<String>,
) -> Result<serde_json::Value, String> {
    crate::goldberg::apply_broadcasts(&state.data_dir, ips)
}

#[tauri::command]
pub fn goldberg_restore_last(
    state: State<'_, AppHandleState>,
) -> Result<String, String> {
    crate::goldberg::restore_last_prepared(&state.data_dir)
}
