//! Playback position and timing state
//!
//! The playback position comes from the decoding thread itself
//! ([`SourceClock`]), not from wall-clock time. A wall clock keeps running
//! when the output device stops pulling samples, which made the UI show a
//! moving (and eventually finished) track while nothing was audible.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// Media position published by [`super::effects::EffectsSource`] as it hands
/// decoded samples to the output.
///
/// The position is in media time (independent of the tempo effect) and only
/// advances while the output stream actually consumes audio.
#[derive(Debug, Default)]
pub struct SourceClock {
    position_us: AtomicU64,
    finished: AtomicBool,
}

impl SourceClock {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn position(&self) -> Duration {
        Duration::from_micros(self.position_us.load(Ordering::Acquire))
    }

    pub fn set_position(&self, position: Duration) {
        let micros = u64::try_from(position.as_micros()).unwrap_or(u64::MAX);
        self.position_us.store(micros, Ordering::Release);
    }

    /// True once the decoder ran out of samples (end of file or read error).
    pub fn is_finished(&self) -> bool {
        self.finished.load(Ordering::Acquire)
    }

    pub fn mark_finished(&self) {
        self.finished.store(true, Ordering::Release);
    }

    pub fn mark_seeked(&self, position: Duration) {
        self.set_position(position);
        self.finished.store(false, Ordering::Release);
    }
}

/// Tracks the loaded track and the user's playback intent.
pub struct PlaybackState {
    pub current_path: Option<String>,
    pub total_duration: Duration,
    /// Position clock of the source currently installed in the player.
    pub clock: Arc<SourceClock>,
    /// When the current pause began (drives the long-pause stream refresh).
    pub pause_start: Option<Instant>,
    /// The user asked for audio to be playing (play without a later pause/stop).
    pub play_requested: bool,
    /// The end of the current source has already been handled.
    pub end_reported: bool,
    /// Position at which the current track already ended early once and was
    /// reopened. A second early end at the same spot is the real end of the file.
    pub early_end_at: Option<Duration>,
}

impl PlaybackState {
    pub fn new() -> Self {
        Self {
            current_path: None,
            total_duration: Duration::ZERO,
            clock: Arc::new(SourceClock::new()),
            pause_start: None,
            play_requested: false,
            end_reported: false,
            early_end_at: None,
        }
    }

    /// Install a freshly loaded track (paused, at its start).
    pub fn reset_for_load(&mut self, path: String, duration: Duration, clock: Arc<SourceClock>) {
        self.current_path = Some(path);
        self.total_duration = duration;
        self.clock = clock;
        self.pause_start = None;
        self.play_requested = false;
        self.end_reported = false;
        self.early_end_at = None;
    }

    /// Replace the source of the current track (seek, reload, device recovery).
    pub fn replace_source(&mut self, duration: Duration, clock: Arc<SourceClock>) {
        if duration > Duration::ZERO {
            self.total_duration = duration;
        }
        self.clock = clock;
        self.end_reported = false;
    }

    pub fn mark_playing(&mut self) -> Option<Duration> {
        self.play_requested = true;
        self.pause_start.take().map(|start| start.elapsed())
    }

    pub fn mark_paused(&mut self) {
        self.play_requested = false;
        if self.pause_start.is_none() {
            self.pause_start = Some(Instant::now());
        }
    }

    /// Clear all state (stopped).
    pub fn clear(&mut self) {
        self.current_path = None;
        self.total_duration = Duration::ZERO;
        self.clock = Arc::new(SourceClock::new());
        self.pause_start = None;
        self.play_requested = false;
        self.end_reported = false;
        self.early_end_at = None;
    }

    pub fn pause_duration(&self) -> Duration {
        self.pause_start
            .map(|start| start.elapsed())
            .unwrap_or(Duration::ZERO)
    }

    /// Current media position in seconds, clamped to the track duration.
    pub fn get_position(&self) -> f64 {
        let position = self.clock.position();
        if self.total_duration > Duration::ZERO {
            position.min(self.total_duration).as_secs_f64()
        } else {
            position.as_secs_f64()
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
        assert!(!state.play_requested);
        assert_eq!(state.get_position(), 0.0);
    }

    #[test]
    fn reset_for_load_sets_path_duration_and_clock() {
        let mut state = PlaybackState::new();
        state.play_requested = true;
        state.end_reported = true;
        let clock = Arc::new(SourceClock::new());
        clock.set_position(Duration::from_secs(3));

        state.reset_for_load("test.mp3".into(), Duration::from_secs(180), clock);

        assert_eq!(state.current_path.as_deref(), Some("test.mp3"));
        assert_eq!(state.total_duration, Duration::from_secs(180));
        assert_eq!(state.get_position(), 3.0);
        assert!(!state.play_requested);
        assert!(!state.end_reported);
    }

    #[test]
    fn position_follows_the_source_clock_not_wall_time() {
        let mut state = PlaybackState::new();
        let clock = Arc::new(SourceClock::new());
        state.reset_for_load("a.mp3".into(), Duration::from_secs(60), clock.clone());
        state.mark_playing();

        std::thread::sleep(Duration::from_millis(20));
        assert_eq!(state.get_position(), 0.0, "no samples consumed yet");

        clock.set_position(Duration::from_millis(1500));
        assert_eq!(state.get_position(), 1.5);
    }

    #[test]
    fn position_is_clamped_to_duration() {
        let mut state = PlaybackState::new();
        let clock = Arc::new(SourceClock::new());
        state.reset_for_load("t.mp3".into(), Duration::from_secs(10), clock.clone());
        clock.set_position(Duration::from_secs(12));
        assert_eq!(state.get_position(), 10.0);
    }

    #[test]
    fn pause_and_resume_track_intent_and_pause_length() {
        let mut state = PlaybackState::new();
        state.reset_for_load("a.mp3".into(), Duration::from_secs(60), Arc::default());
        assert!(state.mark_playing().is_none());
        assert!(state.play_requested);

        state.mark_paused();
        assert!(!state.play_requested);
        std::thread::sleep(Duration::from_millis(10));
        assert!(state.pause_duration() >= Duration::from_millis(10));

        let paused_for = state.mark_playing().expect("resume reports pause length");
        assert!(paused_for >= Duration::from_millis(10));
        assert_eq!(state.pause_duration(), Duration::ZERO);
    }

    #[test]
    fn replace_source_keeps_known_duration_when_new_one_is_unknown() {
        let mut state = PlaybackState::new();
        state.reset_for_load("a.mp3".into(), Duration::from_secs(60), Arc::default());
        state.end_reported = true;
        state.replace_source(Duration::ZERO, Arc::default());
        assert_eq!(state.total_duration, Duration::from_secs(60));
        assert!(!state.end_reported);
    }

    #[test]
    fn clear_resets_all_fields() {
        let mut state = PlaybackState::new();
        state.reset_for_load("x.mp3".into(), Duration::from_secs(100), Arc::default());
        state.mark_playing();
        state.clear();

        assert!(state.current_path.is_none());
        assert!(!state.play_requested);
        assert_eq!(state.get_position(), 0.0);
    }

    #[test]
    fn source_clock_seek_clears_finished_flag() {
        let clock = SourceClock::new();
        clock.mark_finished();
        assert!(clock.is_finished());
        clock.mark_seeked(Duration::from_secs(4));
        assert!(!clock.is_finished());
        assert_eq!(clock.position(), Duration::from_secs(4));
    }
}
