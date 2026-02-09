//! Playback position and timing state
//!
//! Tracks current position, pause state, and timing for the audio engine.
//! All fields are plain data — no audio resources — inherently Send + Sync.

use std::time::{Duration, Instant};

/// Tracks playback position, pause state, and timing.
pub struct PlaybackState {
    pub current_path: Option<String>,
    pub start_time: Option<Instant>,
    pub seek_offset: Duration,
    pub pause_start: Option<Instant>,
    pub paused_duration: Duration,
    pub total_duration: Duration,
}

impl PlaybackState {
    pub fn new() -> Self {
        Self {
            current_path: None,
            start_time: None,
            seek_offset: Duration::ZERO,
            pause_start: None,
            paused_duration: Duration::ZERO,
            total_duration: Duration::ZERO,
        }
    }

    /// Reset all timing state for a new track load.
    pub fn reset_for_load(&mut self, path: String, duration: Duration) {
        self.current_path = Some(path);
        self.total_duration = duration;
        self.start_time = None;
        self.seek_offset = Duration::ZERO;
        self.paused_duration = Duration::ZERO;
        self.pause_start = None;
    }

    /// Mark playback as started (fresh or resumed).
    /// Returns the pause duration if resuming from pause.
    pub fn mark_playing(&mut self) -> Option<Duration> {
        if let Some(pause_start) = self.pause_start.take() {
            let pause_duration = pause_start.elapsed();
            self.paused_duration += pause_duration;
            Some(pause_duration)
        } else {
            self.start_time = Some(Instant::now());
            None
        }
    }

    /// Mark playback as paused.
    pub fn mark_paused(&mut self) {
        self.pause_start = Some(Instant::now());
    }

    /// Clear all state (stopped).
    pub fn clear(&mut self) {
        self.current_path = None;
        self.start_time = None;
        self.seek_offset = Duration::ZERO;
        self.paused_duration = Duration::ZERO;
        self.pause_start = None;
    }

    /// Update timing after a seek operation.
    pub fn mark_seeked(&mut self, position: f64, is_paused: bool) {
        self.start_time = Some(Instant::now());
        self.seek_offset = Duration::from_secs_f64(position);
        self.paused_duration = Duration::ZERO;
        self.pause_start = if is_paused { Some(Instant::now()) } else { None };
    }

    /// Calculate current playback position in seconds.
    ///
    /// Requires the caller to pass sink state to avoid nested locking.
    pub fn get_position(&self, sink_empty: bool, sink_paused: bool) -> f64 {
        // If sink is empty (track finished), return the total duration rather than
        // letting the wall-clock counter drift past the end of the track.
        if sink_empty && self.start_time.is_some() {
            return self.total_duration.as_secs_f64();
        }

        if let Some(start) = self.start_time {
            let elapsed = start.elapsed();

            let additional_pause = if sink_paused {
                self.pause_start
                    .map(|ps| ps.elapsed())
                    .unwrap_or(Duration::ZERO)
            } else {
                Duration::ZERO
            };

            let playing_time = elapsed.saturating_sub(self.paused_duration + additional_pause);
            let position = self.seek_offset + playing_time;

            // Clamp to total duration to prevent wall-clock drift past track end
            if self.total_duration > Duration::ZERO {
                position.min(self.total_duration).as_secs_f64()
            } else {
                position.as_secs_f64()
            }
        } else {
            0.0
        }
    }
}
