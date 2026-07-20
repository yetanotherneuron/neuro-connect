use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub bind: String,
    pub database_path: String,
    pub upload_dir: String,
    pub jwt_secret: String,
    pub token_ttl_hours: i64,
    pub max_upload_mb: u64,
    #[serde(default)]
    pub public_url: String,
    /// Username that becomes Global Admin (empty = disabled).
    #[serde(default)]
    pub global_admin_username: String,
    /// If non-empty, user must claim via /api/admin/claim before elevation.
    #[serde(default)]
    pub global_admin_bootstrap_secret: String,
    /// Localhost test mode: seed data + richer stubs.
    #[serde(default)]
    pub dev_mode: bool,
    /// Advertise this server on the LAN via mDNS.
    #[serde(default = "default_true")]
    pub lan_discovery: bool,
    /// Friendly name shown in mDNS / Find on LAN.
    #[serde(default = "default_lan_name")]
    pub lan_service_name: String,
}

fn default_true() -> bool {
    true
}

fn default_lan_name() -> String {
    "Neuro Connect".into()
}

pub fn load_config(path: &Path) -> anyhow::Result<ServerConfig> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| anyhow::anyhow!("failed to read config {}: {e}", path.display()))?;
    let cfg: ServerConfig = toml::from_str(&raw)?;
    if cfg.jwt_secret == "CHANGE_ME_TO_A_LONG_RANDOM_SECRET" {
        tracing::warn!("jwt_secret is still the default - change it before public hosting");
    }
    if !cfg.public_url.is_empty() {
        tracing::info!("public_url = {}", cfg.public_url);
    }
    if cfg.dev_mode {
        tracing::warn!("dev_mode is ON - for local testing only");
    }
    if !cfg.global_admin_username.is_empty() {
        tracing::info!(
            "global_admin_username configured as '{}'",
            cfg.global_admin_username
        );
    }
    Ok(cfg)
}

pub fn is_loopback_bind(bind: &str) -> bool {
    bind.starts_with("127.0.0.1")
        || bind.starts_with("localhost")
        || bind.starts_with("[::1]")
}
