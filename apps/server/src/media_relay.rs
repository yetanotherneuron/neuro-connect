use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::state::AppState;

/// TODO: Server-side music/video streaming from direct links to save uploader bandwidth.
pub async fn media_status(State(state): State<AppState>) -> Json<Value> {
    if state.cfg.dev_mode {
        return Json(json!({
            "status": "dev_mock",
            "ready": true,
            "active_stream": {
                "title": "Demo Stream",
                "url": "https://example.com/demo.mp3",
                "started_by": "devuser"
            },
            "message": "Dev Mode mock media relay - real stream-from-URL not implemented yet."
        }));
    }
    Json(json!({
        "status": "stub",
        "ready": false,
        "message": "Media relay (stream-from-URL) is not implemented yet.",
        "planned": ["screen_share", "desktop_audio", "url_media_relay"]
    }))
}
