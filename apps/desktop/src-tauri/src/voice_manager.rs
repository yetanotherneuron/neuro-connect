use serde_json::{json, Value};

/// Voice status for native bridge. Media runs in the WebView via WebRTC/Opus.
pub fn status() -> Value {
    json!({
        "ready": true,
        "codec": "opus",
        "modes": ["push_to_talk", "voice_activity"],
        "note": "WebRTC mesh voice is handled in the UI layer"
    })
}
