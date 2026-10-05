//! Gapless playback preload manager
//!
//! Manages a preloaded track sink for seamless track transitions.
//! Tracks the device generation at preload time so stale sinks
//! (connected to a now-dead mixer after a device change) are
//! automatically rejected on swap.

use super::playback_state::SourceClock;
use log::warn;
use rodio::Player;
use std::sync::Arc;
use std::time::Duration;

/// A preloaded track ready to replace the current player.
pub struct PreloadedTrack {
    pub sink: Player,
    pub path: String,
    pub duration: Duration,
    pub clock: Arc<SourceClock>,
}

/// Manages preloaded tracks for gapless playback.
pub struct PreloadManager {
    track: Option<PreloadedTrack>,
    /// Device generation at the time the preload was created.
    device_generation: u64,
}

impl PreloadManager {
    pub fn new() -> Self {
        Self {
            track: None,
            device_generation: 0,
        }
    }

    /// Store a preloaded track and the current device generation.
    pub fn set(&mut self, track: PreloadedTrack, device_generation: u64) {
        self.track = Some(track);
        self.device_generation = device_generation;
    }

    /// Take the preloaded sink and path if the device generation still matches.
    ///
    /// If the device has been reinitialized since the preload was created,
    /// the sink is connected to the old (dead) mixer — discard it and
    /// return None so the caller falls back to a full load.
    pub fn take_if_current(&mut self, current_generation: u64) -> Option<PreloadedTrack> {
        self.track.as_ref()?;

        if self.device_generation != current_generation {
            warn!(
                "Discarding stale preload (preload gen={}, device gen={})",
                self.device_generation, current_generation
            );
            self.clear();
            return None;
        }

        self.track.take()
    }

    pub fn has_preloaded(&self) -> bool {
        self.track.is_some()
    }

    /// Return the file path of the currently preloaded track, if any.
    pub fn get_path(&self) -> Option<&str> {
        self.track.as_ref().map(|track| track.path.as_str())
    }

    pub fn clear(&mut self) {
        self.track = None;
    }
}
