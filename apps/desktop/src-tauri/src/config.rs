use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientConfig {
    pub server_url: String,
    #[serde(default)]
    pub database_path: String,
    #[serde(default)]
    pub start_minimized: bool,
    #[serde(default = "default_true")]
    pub push_to_talk: bool,
    #[serde(default = "default_ptt")]
    pub hotkey_push_to_talk: String,
    #[serde(default = "default_mute")]
    pub hotkey_mute: String,
    #[serde(default = "default_deafen")]
    pub hotkey_deafen: String,
    #[serde(default = "default_true")]
    pub voice_sounds: bool,
    #[serde(default = "default_true")]
    pub prefer_external_images: bool,
    #[serde(default = "default_true")]
    pub dev_mode_ui: bool,
    /// Extra ICE servers (STUN/TURN URLs), e.g. ["turn:user:pass@host:3478"].
    #[serde(default)]
    pub ice_servers: Vec<String>,
}

fn default_true() -> bool {
    true
}
fn default_ptt() -> String {
    "V".into()
}
fn default_mute() -> String {
    "Ctrl+Shift+M".into()
}
fn default_deafen() -> String {
    "Ctrl+Shift+D".into()
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            server_url: "http://127.0.0.1:7420".into(),
            database_path: String::new(),
            start_minimized: false,
            push_to_talk: true,
            hotkey_push_to_talk: default_ptt(),
            hotkey_mute: default_mute(),
            hotkey_deafen: default_deafen(),
            voice_sounds: true,
            prefer_external_images: true,
            dev_mode_ui: true,
            ice_servers: Vec::new(),
        }
    }
}

pub fn load_client_config(data_dir: &Path) -> ClientConfig {
    let path = data_dir.join("client.toml");
    if path.exists() {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(cfg) = toml::from_str(&raw) {
                return cfg;
            }
        }
    }
    let example = Path::new("configs/client.example.toml");
    if example.exists() {
        if let Ok(raw) = std::fs::read_to_string(example) {
            if let Ok(cfg) = toml::from_str(&raw) {
                return cfg;
            }
        }
    }
    ClientConfig::default()
}

pub fn save_client_config(data_dir: &Path, cfg: &ClientConfig) -> anyhow::Result<()> {
    let path = data_dir.join("client.toml");
    let ice = cfg
        .ice_servers
        .iter()
        .map(|s| format!("{s:?}"))
        .collect::<Vec<_>>()
        .join(", ");
    let raw = format!(
        r#"# Auto-saved by Neuro Connect - see configs/client.example.toml for comments
server_url = {:?}
database_path = {:?}
start_minimized = {}
push_to_talk = {}
hotkey_push_to_talk = {:?}
hotkey_mute = {:?}
hotkey_deafen = {:?}
voice_sounds = {}
prefer_external_images = {}
dev_mode_ui = {}
ice_servers = [{ice}]
"#,
        cfg.server_url,
        cfg.database_path,
        cfg.start_minimized,
        cfg.push_to_talk,
        cfg.hotkey_push_to_talk,
        cfg.hotkey_mute,
        cfg.hotkey_deafen,
        cfg.voice_sounds,
        cfg.prefer_external_images,
        cfg.dev_mode_ui,
    );
    std::fs::write(path, raw)?;
    Ok(())
}
