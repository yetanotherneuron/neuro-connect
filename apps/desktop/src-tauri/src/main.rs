mod config;
mod local_db;
mod commands;
mod voice_manager;
mod lan_discovery;
mod update_manager;

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app data dir");
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("neuro-client.db");
            let db = local_db::LocalDb::open(db_path.to_str().unwrap())?;
            let cfg = config::load_client_config(&data_dir);

            register_voice_hotkeys(app.handle(), &cfg)?;

            app.manage(commands::AppHandleState {
                db,
                cfg: std::sync::Mutex::new(cfg),
                data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::set_server_url,
            commands::set_voice_settings,
            commands::get_session,
            commands::save_session,
            commands::clear_session,
            commands::cache_messages,
            commands::load_cached_messages,
            commands::voice_stub_status,
            commands::lan_stub_status,
            commands::browse_lan_servers,
            commands::local_ipv4,
            commands::apply_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Neuro Connect");
}

fn register_voice_hotkeys(app: &tauri::AppHandle, cfg: &config::ClientConfig) -> Result<(), Box<dyn std::error::Error>> {
    let mute = parse_shortcut(&cfg.hotkey_mute).unwrap_or_else(|| {
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyM)
    });
    let deafen = parse_shortcut(&cfg.hotkey_deafen).unwrap_or_else(|| {
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyD)
    });
    let ptt = parse_shortcut(&cfg.hotkey_push_to_talk)
        .unwrap_or_else(|| Shortcut::new(None, Code::KeyV));

    let handle = app.clone();
    app.global_shortcut().on_shortcut(mute, move |_app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let _ = handle.emit("nc-voice-hotkey", serde_json::json!({ "action": "mute" }));
        }
    })?;

    let handle = app.clone();
    app.global_shortcut().on_shortcut(deafen, move |_app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let _ = handle.emit("nc-voice-hotkey", serde_json::json!({ "action": "deafen" }));
        }
    })?;

    let handle = app.clone();
    app.global_shortcut().on_shortcut(ptt, move |_app, _shortcut, event| {
        let pressed = event.state == ShortcutState::Pressed;
        let _ = handle.emit(
            "nc-voice-hotkey",
            serde_json::json!({ "action": "ptt", "pressed": pressed }),
        );
    })?;

    Ok(())
}

fn parse_shortcut(raw: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = raw.split('+').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    if parts.is_empty() {
        return None;
    }
    let mut mods = Modifiers::empty();
    let mut key: Option<Code> = None;
    for p in parts {
        match p.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "shift" => mods |= Modifiers::SHIFT,
            "alt" => mods |= Modifiers::ALT,
            "super" | "meta" | "cmd" => mods |= Modifiers::SUPER,
            other => {
                key = Some(match other.to_ascii_uppercase().as_str() {
                    "A" => Code::KeyA,
                    "B" => Code::KeyB,
                    "C" => Code::KeyC,
                    "D" => Code::KeyD,
                    "E" => Code::KeyE,
                    "F" => Code::KeyF,
                    "G" => Code::KeyG,
                    "H" => Code::KeyH,
                    "I" => Code::KeyI,
                    "J" => Code::KeyJ,
                    "K" => Code::KeyK,
                    "L" => Code::KeyL,
                    "M" => Code::KeyM,
                    "N" => Code::KeyN,
                    "O" => Code::KeyO,
                    "P" => Code::KeyP,
                    "Q" => Code::KeyQ,
                    "R" => Code::KeyR,
                    "S" => Code::KeyS,
                    "T" => Code::KeyT,
                    "U" => Code::KeyU,
                    "V" => Code::KeyV,
                    "W" => Code::KeyW,
                    "X" => Code::KeyX,
                    "Y" => Code::KeyY,
                    "Z" => Code::KeyZ,
                    _ => return None,
                });
            }
        }
    }
    key.map(|k| Shortcut::new(if mods.is_empty() { None } else { Some(mods) }, k))
}

fn main() {
    run();
}
