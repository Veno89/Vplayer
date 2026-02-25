//! Gapless playback preload manager
//!
//! Manages a preloaded track sink for seamless track transitions.
//! Tracks the device generation at preload time so stale sinks
//! (connected to a now-dead mixer after a device change) are
//! automatically rejected on swap.

use rodio::Sink;
use log::warn;

/// Manages preloaded tracks for gapless playback.
pub struct PreloadManager {
    sink: Option<Sink>,
    path: Option<String>,
    /// Device generation at the time the preload was created.
    device_generation: u64,
}

impl PreloadManager {
    pub fn new() -> Self {
        Self {
            sink: None,
            path: None,
            device_generation: 0,
        }
    }

    /// Store a preloaded sink, path, and the current device generation.
    pub fn set(&mut self, sink: Sink, path: String, device_generation: u64) {
        self.sink = Some(sink);
        self.path = Some(path);
        self.device_generation = device_generation;
    }

    /// Take the preloaded sink and path if the device generation still matches.
    ///
    /// If the device has been reinitialized since the preload was created,
    /// the sink is connected to the old (dead) mixer — discard it and
    /// return None so the caller falls back to a full load.
    pub fn take_if_current(&mut self, current_generation: u64) -> Option<(Sink, String)> {
        if self.sink.is_none() {
            return None;
        }

        if self.device_generation != current_generation {
            warn!(
                "Discarding stale preload (preload gen={}, device gen={})",
                self.device_generation, current_generation
            );
            self.clear();
            return None;
        }

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
