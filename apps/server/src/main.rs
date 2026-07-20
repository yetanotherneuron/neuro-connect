mod activity_log;
mod admin_api;
mod auth_api;
mod chat_handler;
mod config;
mod db;
mod dev_mode;
mod friends;
mod game_hosts;
mod jwt_util;
mod lan_discovery;
mod media_relay;
mod port_guard;
mod server_core;
mod state;
mod updates;
mod voice_manager;

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use state::AppState;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 2 && args[1] == "update" {
        return run_update_cli(&args[2..]);
    }

    let config_path = args
        .get(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("configs/server.example.toml"));

    let cfg = config::load_config(&config_path)?;
    tracing::info!("loaded config from {}", config_path.display());

    std::fs::create_dir_all(&cfg.upload_dir)?;
    if let Some(parent) = PathBuf::from(&cfg.database_path).parent() {
        std::fs::create_dir_all(parent)?;
        std::fs::create_dir_all(parent.join("updates"))?;
    }

    let state = AppState::new(cfg.clone())?;
    if let Err(e) = dev_mode::seed_dev_data(&state) {
        tracing::error!("dev_mode seed failed: {e}");
    }
    if let Err(e) = lan_discovery::start_mdns(&cfg) {
        tracing::warn!("LAN mDNS failed to start: {e}");
    }

    let upload_service = ServeDir::new(&cfg.upload_dir);

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/api/meta", get(dev_mode::server_meta))
        .route("/api/dev/whoami", get(dev_mode::whoami_debug))
        .route("/api/auth/register", post(auth_api::register))
        .route("/api/auth/login", post(auth_api::login))
        .route("/api/auth/logout", post(auth_api::logout))
        .route("/api/me", get(auth_api::me))
        .route("/api/me", put(auth_api::update_profile))
        .route("/api/admin/claim", post(admin_api::claim_admin))
        .route("/api/admin/users", get(admin_api::list_users))
        .route("/api/admin/users/{id}/ban", post(admin_api::ban_user))
        .route("/api/admin/users/{id}/unban", post(admin_api::unban_user))
        .route("/api/admin/servers/{id}", delete(admin_api::delete_server))
        .route("/api/admin/updates", post(updates::publish_update))
        .route("/api/updates/latest", get(updates::latest_update))
        .route(
            "/api/updates/download/{channel}/{platform}/{filename}",
            get(updates::download_update),
        )
        .route("/api/servers", get(server_core::list_servers))
        .route("/api/servers", post(server_core::create_server))
        .route("/api/servers/join", post(server_core::join_server))
        .route("/api/servers/{id}", get(server_core::get_server))
        .route(
            "/api/servers/{id}/channels",
            get(server_core::list_channels),
        )
        .route(
            "/api/servers/{id}/channels",
            post(server_core::create_channel),
        )
        .route("/api/channels/{id}", put(server_core::rename_channel))
        .route("/api/channels/{id}", delete(server_core::delete_channel))
        .route("/api/servers/{id}/members", get(server_core::list_members))
        .route(
            "/api/servers/{id}/members/rank",
            post(server_core::set_rank),
        )
        .route(
            "/api/channels/{id}/messages",
            get(chat_handler::list_messages),
        )
        .route(
            "/api/channels/{id}/messages",
            post(chat_handler::send_message),
        )
        .route("/api/messages/{id}", delete(chat_handler::delete_message))
        .route("/api/messages/{id}", put(chat_handler::edit_message))
        .route(
            "/api/messages/{id}/reactions",
            post(chat_handler::react_message),
        )
        .route("/api/dms", get(chat_handler::list_dms))
        .route("/api/dms/group", post(chat_handler::create_group_dm))
        .route("/api/dms/{user_id}", post(chat_handler::open_dm))
        .route(
            "/api/dms/{dm_id}/messages",
            get(chat_handler::list_dm_messages),
        )
        .route(
            "/api/dms/{dm_id}/messages",
            post(chat_handler::send_dm_message),
        )
        .route("/api/upload", post(chat_handler::upload_file))
        .route("/api/ws", get(chat_handler::ws_handler))
        .route("/api/voice/status", get(voice_manager::voice_status))
        .route("/api/media/status", get(media_relay::media_status))
        .route("/api/media/start", post(media_relay::start_media_relay))
        .route("/api/media/stop", post(media_relay::stop_media_relay))
        .route("/api/media/stream/{id}", get(media_relay::stream_media))
        .route("/api/friends", get(friends::friends_snapshot))
        .route("/api/friends/request", post(friends::send_friend_request))
        .route(
            "/api/friends/requests/{id}/accept",
            post(friends::accept_friend_request),
        )
        .route(
            "/api/friends/requests/{id}/decline",
            post(friends::decline_friend_request),
        )
        .route("/api/friends/{user_id}", delete(friends::remove_friend))
        .route("/api/users/{user_id}/block", post(friends::block_user))
        .route("/api/users/{user_id}/block", delete(friends::unblock_user))
        .route("/api/users/{user_id}/ignore", post(friends::ignore_user))
        .route(
            "/api/users/{user_id}/ignore",
            delete(friends::unignore_user),
        )
        .route("/api/lan/status", get(lan_discovery::lan_status))
        .route("/api/game-hosts", get(game_hosts::list_game_hosts))
        .route("/api/game-hosts", post(game_hosts::create_game_host))
        .route(
            "/api/game-hosts/code/{code}",
            get(game_hosts::get_game_host_by_code),
        )
        .route("/api/game-hosts/{id}", delete(game_hosts::delete_game_host))
        .nest_service("/uploads", upload_service)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = cfg.bind.parse()?;
    let listener = bind_with_prompt(addr).await?;
    activity_log::banner(&addr.to_string(), cfg.dev_mode);
    tracing::info!("Neuro Connect server listening on http://{addr}");
    axum::serve(listener, app).await?;
    activity_log::activity("shutdown", "server stopped");
    Ok(())
}

fn run_update_cli(args: &[String]) -> anyhow::Result<()> {
    if args.first().map(|s| s.as_str()) != Some("publish") {
        anyhow::bail!(
            "usage: neuro-server update publish --config PATH --channel beta --platform windows-x64 --version 0.2.0 --file SETUP.exe [--notes TEXT]"
        );
    }
    let mut config = PathBuf::from("configs/server.example.toml");
    let mut channel = "beta".to_string();
    let mut platform = "windows-x64".to_string();
    let mut version = String::new();
    let mut notes = String::new();
    let mut file = PathBuf::new();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--config" => {
                i += 1;
                config = PathBuf::from(&args[i]);
            }
            "--channel" => {
                i += 1;
                channel = args[i].clone();
            }
            "--platform" => {
                i += 1;
                platform = args[i].clone();
            }
            "--version" => {
                i += 1;
                version = args[i].clone();
            }
            "--notes" => {
                i += 1;
                notes = args[i].clone();
            }
            "--file" => {
                i += 1;
                file = PathBuf::from(&args[i]);
            }
            other => anyhow::bail!("unknown arg: {other}"),
        }
        i += 1;
    }
    if version.is_empty() || file.as_os_str().is_empty() {
        anyhow::bail!("--version and --file are required");
    }
    updates::cli_publish(&config, &channel, &platform, &version, &notes, &file)
}

async fn bind_with_prompt(addr: SocketAddr) -> anyhow::Result<tokio::net::TcpListener> {
    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => Ok(listener),
        Err(err) if port_guard::is_addr_in_use(&err) => {
            let freed =
                tokio::task::spawn_blocking(move || port_guard::ask_terminate_and_free(addr))
                    .await??;
            if !freed {
                anyhow::bail!(
                    "port {} is in use - stop the other process or change `bind` in server.toml",
                    addr.port()
                );
            }
            Ok(tokio::net::TcpListener::bind(addr).await?)
        }
        Err(err) => Err(err.into()),
    }
}
