use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;
use std::collections::HashMap;
use std::net::UdpSocket;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize)]
pub struct LanPeer {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub url: String,
}

/// Browse LAN for Neuro Connect servers briefly (blocking, ~2.5s).
pub fn browse_neuro_servers(timeout_ms: u64) -> Result<Vec<LanPeer>, String> {
    let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
    let receiver = daemon
        .browse("_neuroconnect._tcp.local.")
        .map_err(|e| e.to_string())?;

    let mut found: HashMap<String, LanPeer> = HashMap::new();
    let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(500));

    while Instant::now() < deadline {
        let wait = deadline.saturating_duration_since(Instant::now());
        match receiver.recv_timeout(wait.min(Duration::from_millis(400))) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let host = info
                    .get_addresses_v4()
                    .iter()
                    .next()
                    .map(|a| a.to_string())
                    .or_else(|| {
                        info.get_hostname()
                            .trim_end_matches('.')
                            .strip_suffix(".local")
                            .map(|s| s.to_string())
                    })
                    .unwrap_or_else(|| "127.0.0.1".into());
                let port = info.get_port();
                let name = info
                    .get_properties()
                    .get("name")
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| info.get_fullname().to_string());
                let url = format!("http://{host}:{port}");
                found.insert(url.clone(), LanPeer { name, host, port, url });
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }

    let _ = daemon.shutdown();
    let mut list: Vec<_> = found.into_values().collect();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(list)
}

pub fn local_ipv4() -> Result<String, String> {
    // UDP connect trick — no packets sent; discovers preferred egress IP.
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket
        .connect("8.8.8.8:80")
        .map_err(|e| e.to_string())?;
    let ip = socket.local_addr().map_err(|e| e.to_string())?.ip();
    Ok(ip.to_string())
}

pub fn status() -> serde_json::Value {
    serde_json::json!({
        "ready": true,
        "note": "mDNS browse via browse_lan_servers / local_ipv4 commands"
    })
}
