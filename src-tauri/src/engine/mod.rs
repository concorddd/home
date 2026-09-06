pub mod capture;
pub mod encoder;
pub mod signaling;
pub mod webrtc_engine;

use parking_lot::Mutex;
use std::sync::Arc;

/// Estado global do motor, acessado pelos comandos Tauri.
pub struct EngineState {
    pub session: Arc<Mutex<Option<Arc<webrtc_engine::ShareSession>>>>,
}

impl EngineState {
    pub fn new() -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for EngineState {
    fn default() -> Self {
        Self::new()
    }
}
