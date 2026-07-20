use crate::config::ServerConfig;
use crate::db::Database;
use crate::media_relay::{new_slot, MediaRelaySlot};
use crate::voice_manager::VoiceRoom;
use dashmap::DashMap;
use neuro_shared::WsEvent;
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub cfg: ServerConfig,
    pub events: broadcast::Sender<WsEvent>,
    pub online: Arc<DashMap<Uuid, u32>>,
    pub voice_rooms: Arc<DashMap<Uuid, VoiceRoom>>,
    pub voice_user_channel: Arc<DashMap<Uuid, Uuid>>,
    pub media_relay: MediaRelaySlot,
}

impl AppState {
    pub fn new(cfg: ServerConfig) -> anyhow::Result<Self> {
        let db = Database::open(&cfg.database_path)?;
        let (events, _) = broadcast::channel(512);
        Ok(Self {
            db,
            cfg,
            events,
            online: Arc::new(DashMap::new()),
            voice_rooms: Arc::new(DashMap::new()),
            voice_user_channel: Arc::new(DashMap::new()),
            media_relay: new_slot(),
        })
    }

    pub fn publish(&self, event: WsEvent) {
        let _ = self.events.send(event);
    }
}
