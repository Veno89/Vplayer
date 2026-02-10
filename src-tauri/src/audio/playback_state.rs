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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_state_has_zeroed_position() {
        let state = PlaybackState::new();
        assert!(state.current_path.is_none());
        assert!(state.start_time.is_none());
        assert_eq!(state.get_position(false, false), 0.0);
    }

    #[test]
    fn reset_for_load_sets_path_and_duration() {
        let mut state = PlaybackState::new();
        state.reset_for_load("test.mp3".into(), Duration::from_secs(180));

        assert_eq!(state.current_path.as_deref(), Some("test.mp3"));
        assert_eq!(state.total_duration, Duration::from_secs(180));
        assert!(state.start_time.is_none());
        assert_eq!(state.seek_offset, Duration::ZERO);
    }

    #[test]
    fn mark_playing_sets_start_time_on_first_call() {
        let mut state = PlaybackState::new();
        state.reset_for_load("a.mp3".into(), Duration::from_secs(60));

        let pause_dur = state.mark_playing();
        assert!(pause_dur.is_none(), "first play should not return a pause duration");
        assert!(state.start_time.is_some());
    }

    #[test]
    fn mark_paused_then_resume_accumulates_pause_duration() {
        let mut state = PlaybackState::new();
        state.reset_for_load("a.mp3".into(), Duration::from_secs(60));
        state.mark_playing();

        state.mark_paused();
        assert!(state.pause_start.is_some());

        // Simulate a tiny pause then resume
        std::thread::sleep(Duration::from_millis(10));
        let pause_dur = state.mark_playing();
        assert!(pause_dur.is_some());
        assert!(state.paused_duration >= Duration::from_millis(10));
    }

    #[test]
    fn clear_resets_all_fields() {
        let mut state = PlaybackState::new();
        state.reset_for_load("x.mp3".into(), Duration::from_secs(100));
        state.mark_playing();
        state.clear();

        assert!(state.current_path.is_none());
        assert!(state.start_time.is_none());
        assert_eq!(state.seek_offset, Duration::ZERO);
        assert_eq!(state.paused_duration, Duration::ZERO);
    }

    #[test]
    fn mark_seeked_updates_offset() {
        let mut state = PlaybackState::new();
        state.reset_for_load("s.mp3".into(), Duration::from_secs(300));
        state.mark_playing();

        state.mark_seeked(120.0, false);
        assert_eq!(state.seek_offset, Duration::from_secs_f64(120.0));
        assert!(state.pause_start.is_none());
    }

    #[test]
    fn mark_seeked_while_paused_records_pause_start() {
        let mut state = PlaybackState::new();
        state.reset_for_load("s.mp3".into(), Duration::from_secs(300));
        state.mark_playing();

        state.mark_seeked(60.0, true);
        assert!(state.pause_start.is_some());
    }

    #[test]
    fn get_position_returns_total_when_sink_empty() {
        let mut state = PlaybackState::new();
        state.reset_for_load("done.mp3".into(), Duration::from_secs(200));
        state.mark_playing();

        let pos = state.get_position(true, false);
        assert_eq!(pos, 200.0);
    }

    #[test]
    fn get_position_clamps_to_total_duration() {
        let mut state = PlaybackState::new();
        state.reset_for_load("t.mp3".into(), Duration::from_millis(50));
        state.mark_playing();
        // Small sleep to let wall-clock exceed the 50ms total_duration
        std::thread::sleep(Duration::from_millis(80));

        let pos = state.get_position(false, false);
        assert!(pos <= 0.05 + 0.01, "position should be clamped near total_duration");
    }
}
