use crate::config::{is_loopback_bind, ServerConfig};
use crate::state::AppState;
use axum::{extract::State, Json};
use mdns_sd::{ServiceDaemon, ServiceInfo};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

static LAN_ADVERTISING: AtomicBool = AtomicBool::new(false);

/// Start mDNS advertisement for `_neuroconnect._tcp.local.` (non-blocking).
pub fn start_mdns(cfg: &ServerConfig) -> anyhow::Result<()> {
    if !cfg.lan_discovery {
        tracing::info!("lan_discovery disabled in config");
        return Ok(());
    }
    if is_loopback_bind(&cfg.bind) {
        tracing::info!("lan_discovery skipped (loopback bind)");
        return Ok(());
    }

    let addr: SocketAddr = cfg.bind.parse()?;
    let port = addr.port();
    let instance = sanitize_instance(&cfg.lan_service_name);
    let host_name = hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "neuro-connect".into());
    let host = format!("{host_name}.local.");

    let mut properties = HashMap::new();
    properties.insert("name".to_string(), cfg.lan_service_name.clone());
    properties.insert("version".to_string(), env!("CARGO_PKG_VERSION").to_string());
    properties.insert("path".to_string(), "/".to_string());

    let daemon = ServiceDaemon::new()?;
    let service = ServiceInfo::new(
        "_neuroconnect._tcp.local.",
        &instance,
        &host,
        "",
        port,
        Some(properties),
    )?
    .enable_addr_auto();

    daemon.register(service)?;
    LAN_ADVERTISING.store(true, Ordering::SeqCst);
    // Keep daemon alive for process lifetime.
    std::mem::forget(daemon);
    tracing::info!(
        "LAN mDNS advertising `_neuroconnect._tcp` as '{}' on port {port}",
        cfg.lan_service_name
    );
    Ok(())
}

fn sanitize_instance(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.trim_matches('-');
    if s.is_empty() {
        "Neuro-Connect".into()
    } else {
        s.chars().take(63).collect()
    }
}

pub async fn lan_status(State(state): State<AppState>) -> Json<Value> {
    let advertising = LAN_ADVERTISING.load(Ordering::SeqCst);
    let addr: Result<SocketAddr, _> = state.cfg.bind.parse();
    let port = addr.as_ref().map(|a| a.port()).unwrap_or(7420);

    Json(json!({
        "status": if advertising { "ready" } else { "idle" },
        "ready": advertising || state.cfg.lan_discovery,
        "lan_discovery": state.cfg.lan_discovery,
        "advertising": advertising,
        "service_type": "_neuroconnect._tcp.local.",
        "service_name": state.cfg.lan_service_name,
        "port": port,
        "message": if advertising {
            "Advertising this Neuro Connect server on the LAN via mDNS."
        } else if !state.cfg.lan_discovery {
            "LAN discovery disabled in server.toml (lan_discovery = false)."
        } else if crate::config::is_loopback_bind(&state.cfg.bind) {
            "Bind is loopback - mDNS advertise skipped. Use 0.0.0.0:7420 for LAN."
        } else {
            "LAN discovery enabled but advertiser is not running."
        }
    }))
}

/// Shared helper used by status when we need Arc flags from elsewhere.
#[allow(dead_code)]
pub fn advertising_flag() -> Arc<AtomicBool> {
    // Placeholder for future shared state; current uses static.
    Arc::new(AtomicBool::new(LAN_ADVERTISING.load(Ordering::SeqCst)))
}
