//! Gapless playback preload manager
//!
//! Manages a preloaded track sink for seamless track transitions.

use rodio::Sink;

/// Manages preloaded tracks for gapless playback.
pub struct PreloadManager {
    sink: Option<Sink>,
    path: Option<String>,
}

impl PreloadManager {
    pub fn new() -> Self {
        Self {
            sink: None,
            path: None,
        }
    }

    /// Store a preloaded sink and path.
    pub fn set(&mut self, sink: Sink, path: String) {
        self.sink = Some(sink);
        self.path = Some(path);
    }

    /// Take the preloaded sink and path, leaving None.
    pub fn take(&mut self) -> Option<(Sink, String)> {
        match (self.sink.take(), self.path.take()) {
            (Some(sink), Some(path)) => Some((sink, path)),
            _ => None,
        }
    }

    pub fn has_preloaded(&self) -> bool {
        self.sink.is_some()
    }

    pub fn clear(&mut self) {
        self.sink = None;
        self.path = None;
    }
}
