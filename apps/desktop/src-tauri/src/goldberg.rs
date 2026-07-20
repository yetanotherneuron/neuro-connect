//! Goldberg Steam emulator helper — prepare games + LAN broadcast wiring.
//!
//! Neuro Connect does **not** ship emulator binaries (LGPL / redistribution).
//! Users import a Goldberg release once; then “Prepare game” replaces
//! `steam_api(64).dll`, writes `steam_settings`, and hosts share a **room code**.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Default Goldberg UDP/TCP listen port (`dll/network.h`).
pub const GOLDBERG_DEFAULT_PORT: u16 = 47584;

#[derive(Debug, Serialize)]
pub struct GoldbergStatus {
    pub ready: bool,
    pub has_x86: bool,
    pub has_x64: bool,
    pub assets_dir: String,
    pub note: String,
}

#[derive(Debug, Serialize)]
pub struct PreparedGame {
    pub game_dir: String,
    pub dll_path: String,
    pub arch: String,
    pub app_id: String,
    pub listen_port: u16,
    pub backed_up: bool,
}

fn assets_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("goldberg")
}

fn find_named(root: &Path, names: &[&str]) -> Option<PathBuf> {
    for name in names {
        let direct = root.join(name);
        if direct.is_file() {
            return Some(direct);
        }
    }
    for entry in WalkDir::new(root).max_depth(4).into_iter().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let fname = path.file_name()?.to_string_lossy();
        if names.iter().any(|n| fname.eq_ignore_ascii_case(n)) {
            return Some(path.to_path_buf());
        }
    }
    None
}

pub fn status(data_dir: &Path) -> GoldbergStatus {
    let dir = assets_dir(data_dir);
    let has_x86 = dir.join("steam_api.dll").is_file();
    let has_x64 = dir.join("steam_api64.dll").is_file();
    let ready = has_x86 || has_x64;
    GoldbergStatus {
        ready,
        has_x86,
        has_x64,
        assets_dir: dir.display().to_string(),
        note: if ready {
            "Goldberg assets ready — you can prepare games.".into()
        } else {
            "Import a Goldberg Steam Emulator release folder once (must contain steam_api.dll and/or steam_api64.dll).".into()
        },
    }
}

/// Copy emulator DLLs from a user-selected Goldberg release directory into app data.
pub fn import_from_folder(data_dir: &Path, source: &Path) -> Result<GoldbergStatus, String> {
    if !source.is_dir() {
        return Err("source is not a folder".into());
    }
    let dest = assets_dir(data_dir);
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let x86 = find_named(source, &["steam_api.dll"]);
    let x64 = find_named(source, &["steam_api64.dll"]);
    if x86.is_none() && x64.is_none() {
        return Err(
            "No steam_api.dll or steam_api64.dll found in that folder (search depth 4)".into(),
        );
    }
    if let Some(p) = x86 {
        fs::copy(&p, dest.join("steam_api.dll")).map_err(|e| e.to_string())?;
    }
    if let Some(p) = x64 {
        fs::copy(&p, dest.join("steam_api64.dll")).map_err(|e| e.to_string())?;
    }
    // Optional lobby connect helper
    if let Some(p) = find_named(source, &["lobby_connect.exe", "lobby_connect_x64.exe"]) {
        let name = p.file_name().unwrap().to_owned();
        let _ = fs::copy(&p, dest.join(name));
    }
    Ok(status(data_dir))
}

pub fn pick_import_folder(data_dir: &Path) -> Result<GoldbergStatus, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Select Goldberg Steam Emulator release folder")
        .pick_folder()
        .ok_or_else(|| "cancelled".to_string())?;
    import_from_folder(data_dir, &picked)
}

fn find_steam_api_in_game(game_dir: &Path) -> Result<(PathBuf, &'static str), String> {
    let mut x64 = None;
    let mut x86 = None;
    for entry in WalkDir::new(game_dir).max_depth(6).into_iter().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.eq_ignore_ascii_case("steam_api64.dll") {
            x64 = Some(path.to_path_buf());
        } else if name.eq_ignore_ascii_case("steam_api.dll") {
            x86 = Some(path.to_path_buf());
        }
    }
    if let Some(p) = x64 {
        return Ok((p, "x64"));
    }
    if let Some(p) = x86 {
        return Ok((p, "x86"));
    }
    Err("No steam_api.dll / steam_api64.dll found under that game folder".into())
}

fn write_settings(
    dll_dir: &Path,
    app_id: &str,
    account_name: &str,
    listen_port: u16,
    broadcasts: &[String],
) -> Result<(), String> {
    let settings = dll_dir.join("steam_settings");
    fs::create_dir_all(&settings).map_err(|e| e.to_string())?;
    fs::write(settings.join("steam_appid.txt"), format!("{app_id}\n"))
        .map_err(|e| e.to_string())?;
    fs::write(
        settings.join("force_account_name.txt"),
        format!("{}\n", account_name.trim()),
    )
    .map_err(|e| e.to_string())?;
    fs::write(
        settings.join("force_listen_port.txt"),
        format!("{listen_port}\n"),
    )
    .map_err(|e| e.to_string())?;
    let body = broadcasts
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(
        settings.join("custom_broadcasts.txt"),
        if body.is_empty() {
            String::new()
        } else {
            format!("{body}\n")
        },
    )
    .map_err(|e| e.to_string())?;
    // Also beside DLL for games that look there first
    fs::write(dll_dir.join("steam_appid.txt"), format!("{app_id}\n")).map_err(|e| e.to_string())?;
    Ok(())
}

/// Backup original Steam API DLL, install Goldberg, write steam_settings.
pub fn prepare_game(
    data_dir: &Path,
    game_dir: &Path,
    app_id: &str,
    account_name: &str,
    listen_port: Option<u16>,
) -> Result<PreparedGame, String> {
    let app_id = app_id.trim();
    if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Steam AppID must be numeric (see steamdb.info)".into());
    }
    let st = status(data_dir);
    if !st.ready {
        return Err(st.note);
    }
    let (dll_path, arch) = find_steam_api_in_game(game_dir)?;
    let asset_name = if arch == "x64" {
        "steam_api64.dll"
    } else {
        "steam_api.dll"
    };
    let asset = assets_dir(data_dir).join(asset_name);
    if !asset.is_file() {
        return Err(format!(
            "Missing {asset_name} in Goldberg assets — re-import a release that includes it"
        ));
    }

    let bak = dll_path.parent().unwrap().join(format!(
        "{}.neuro.bak",
        dll_path.file_name().unwrap().to_string_lossy()
    ));

    let mut backed_up = false;
    if !bak.exists() {
        fs::copy(&dll_path, &bak).map_err(|e| format!("backup failed: {e}"))?;
        backed_up = true;
    }

    fs::copy(&asset, &dll_path).map_err(|e| format!("install emu DLL failed: {e}"))?;

    let port = listen_port.unwrap_or(GOLDBERG_DEFAULT_PORT);
    let dll_dir = dll_path.parent().unwrap();
    write_settings(dll_dir, app_id, account_name, port, &[])?;

    // Track last prepared game for one-click join later
    let meta = serde_json::json!({
        "game_dir": game_dir,
        "dll_path": dll_path,
        "arch": arch,
        "app_id": app_id,
        "listen_port": port,
    });
    let _ = fs::write(
        assets_dir(data_dir).join("last_prepared.json"),
        meta.to_string(),
    );

    Ok(PreparedGame {
        game_dir: game_dir.display().to_string(),
        dll_path: dll_path.display().to_string(),
        arch: arch.into(),
        app_id: app_id.into(),
        listen_port: port,
        backed_up,
    })
}

pub fn pick_and_prepare_game(
    data_dir: &Path,
    app_id: &str,
    account_name: &str,
    listen_port: Option<u16>,
) -> Result<PreparedGame, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Select the game folder (contains steam_api DLL)")
        .pick_folder()
        .ok_or_else(|| "cancelled".to_string())?;
    prepare_game(data_dir, &picked, app_id, account_name, listen_port)
}

/// Write custom_broadcasts so Goldberg can find a host on another subnet / VPN.
pub fn apply_broadcasts(data_dir: &Path, ips: Vec<String>) -> Result<serde_json::Value, String> {
    let ips: Vec<String> = ips
        .into_iter()
        .map(|s| {
            // address may be IP:port — Goldberg wants IP or host only
            s.split(':').next().unwrap_or(&s).trim().to_string()
        })
        .filter(|s| !s.is_empty())
        .collect();
    if ips.is_empty() {
        return Err("no host IPs provided".into());
    }
    let body = format!("{}\n", ips.join("\n"));

    // Global Goldberg saves (Windows)
    if let Some(roaming) = dirs::data_dir() {
        let global = roaming.join("Goldberg SteamEmu Saves").join("settings");
        fs::create_dir_all(&global).map_err(|e| e.to_string())?;
        fs::write(global.join("custom_broadcasts.txt"), &body).map_err(|e| e.to_string())?;
    }

    // Last prepared game's steam_settings
    let mut updated_games = Vec::new();
    let meta_path = assets_dir(data_dir).join("last_prepared.json");
    if meta_path.is_file() {
        if let Ok(raw) = fs::read_to_string(&meta_path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(dll) = v.get("dll_path").and_then(|x| x.as_str()) {
                    let dll_path = PathBuf::from(dll);
                    if let Some(dir) = dll_path.parent() {
                        let settings = dir.join("steam_settings");
                        fs::create_dir_all(&settings).map_err(|e| e.to_string())?;
                        fs::write(settings.join("custom_broadcasts.txt"), &body)
                            .map_err(|e| e.to_string())?;
                        updated_games.push(dir.display().to_string());
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "ok": true,
        "ips": ips,
        "updated_games": updated_games,
    }))
}

pub fn restore_original_dll(dll_path: &Path) -> Result<(), String> {
    let bak = dll_path.parent().unwrap().join(format!(
        "{}.neuro.bak",
        dll_path.file_name().unwrap().to_string_lossy()
    ));
    if !bak.is_file() {
        return Err("no Neuro Connect backup found for this DLL".into());
    }
    fs::copy(&bak, dll_path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Restore original Steam API DLL for the last prepared game.
pub fn restore_last_prepared(data_dir: &Path) -> Result<String, String> {
    let meta_path = assets_dir(data_dir).join("last_prepared.json");
    if !meta_path.is_file() {
        return Err("no prepared game recorded yet".into());
    }
    let raw = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let dll = v
        .get("dll_path")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "invalid last_prepared.json".to_string())?;
    let path = PathBuf::from(dll);
    restore_original_dll(&path)?;
    Ok(path.display().to_string())
}
