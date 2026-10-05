//! Background supervision of playback.
//!
//! One thread runs [`PlaybackMonitor::step`] in a loop. While audio plays it
//! emits position ticks (~10 Hz), notices when a track runs dry, and watches
//! the output: a cheap liveness check every tick plus one device enumeration
//! every couple of seconds. While nothing plays it sleeps on the broadcast
//! condvar and costs nothing.

use super::device::DeviceStatus;
use super::{AudioPlayer, BroadcastSnapshot, LostDevice, TrackEndOutcome};
use log::{info, warn};
use std::time::{Duration, Instant};

/// Interval between position ticks while playing.
pub const TICK_INTERVAL: Duration = Duration::from_millis(100);
/// Wait while idle; play/load wake the thread earlier.
pub const IDLE_WAIT: Duration = Duration::from_secs(30);
/// Device enumeration cadence while playing.
const DEVICE_CHECK_INTERVAL: Duration = Duration::from_secs(2);
/// No audio pulled for this long while playing means the stream is dead.
const PLAYING_STALL_TIMEOUT: Duration = Duration::from_secs(3);
/// A second stall this soon after recovering one is not worth retrying.
const STALL_RETRY_WINDOW: Duration = Duration::from_secs(30);
/// How often to look for a lost device, first eagerly, then lazily.
const LOST_DEVICE_POLL_FAST: Duration = Duration::from_secs(2);
const LOST_DEVICE_POLL_SLOW: Duration = Duration::from_secs(10);
const LOST_DEVICE_FAST_PERIOD: Duration = Duration::from_secs(2 * 60);

/// Something the frontend must hear about.
pub enum MonitorEvent {
    Tick(BroadcastSnapshot),
    TrackEnded {
        load_request_id: u64,
        error: Option<String>,
    },
    DeviceLost,
    DeviceRecovered,
    PlaybackError(String),
}

struct LostState {
    device: LostDevice,
    since: Instant,
}

pub struct PlaybackMonitor {
    lost: Option<LostState>,
    last_device_check: Instant,
    last_stall_recovery: Option<Instant>,
}

impl Default for PlaybackMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl PlaybackMonitor {
    pub fn new() -> Self {
        Self {
            lost: None,
            last_device_check: Instant::now(),
            last_stall_recovery: None,
        }
    }

    /// Run one supervision step. Returns the events to emit and how long to
    /// wait (interruptibly) before the next step.
    pub fn step(&mut self, player: &AudioPlayer) -> (Vec<MonitorEvent>, Duration) {
        let mut events = Vec::new();

        if let Some(wait) = self.step_lost(player, &mut events) {
            return (events, wait);
        }

        let snapshot = player.broadcast_snapshot();

        if snapshot.ended {
            let load_request_id = snapshot.load_request_id;
            match player.handle_track_end() {
                Some(TrackEndOutcome::Finished) => events.push(MonitorEvent::TrackEnded {
                    load_request_id,
                    error: None,
                }),
                Some(TrackEndOutcome::Failed(message)) => events.push(MonitorEvent::TrackEnded {
                    load_request_id,
                    error: Some(message),
                }),
                Some(TrackEndOutcome::Resumed) | None => {}
            }
            return (events, TICK_INTERVAL);
        }

        if !snapshot.is_playing {
            return (events, IDLE_WAIT);
        }

        events.push(MonitorEvent::Tick(snapshot));
        self.check_output(player, &mut events);
        (events, TICK_INTERVAL)
    }

    /// Device-lost mode: wait for the same device to come back.
    fn step_lost(
        &mut self,
        player: &AudioPlayer,
        events: &mut Vec<MonitorEvent>,
    ) -> Option<Duration> {
        let lost = self.lost.as_ref()?;

        if player.is_playing() {
            // The user resumed playback themselves (on whatever is available).
            info!("Playback resumed while waiting for the lost device; leaving device-lost mode");
            self.lost = None;
            return None;
        }
        if player.current_path().is_none() {
            // Playback was stopped meanwhile; there is nothing to resume.
            self.lost = None;
            return None;
        }

        if player.lost_device_ready(&lost.device) {
            info!(
                "Audio device {:?} is back - resuming playback",
                lost.device.name
            );
            match player.play() {
                Ok(()) => {
                    events.push(MonitorEvent::DeviceRecovered);
                    self.lost = None;
                    self.last_device_check = Instant::now();
                    return Some(TICK_INTERVAL);
                }
                Err(e) => warn!("Resuming on the returned device failed: {e} - will retry"),
            }
        }

        Some(if lost.since.elapsed() < LOST_DEVICE_FAST_PERIOD {
            LOST_DEVICE_POLL_FAST
        } else {
            LOST_DEVICE_POLL_SLOW
        })
    }

    fn check_output(&mut self, player: &AudioPlayer, events: &mut Vec<MonitorEvent>) {
        let stalled = player.output_stalled(PLAYING_STALL_TIMEOUT);
        if !stalled && self.last_device_check.elapsed() < DEVICE_CHECK_INTERVAL {
            return;
        }
        self.last_device_check = Instant::now();

        match player.device_status() {
            DeviceStatus::Unchanged if !stalled => {}
            DeviceStatus::Unchanged => self.recover_stalled(player, events),
            DeviceStatus::DefaultChanged => {
                info!("Default output device changed - moving playback to it");
                if !matches!(player.recover(), Ok(true)) {
                    self.enter_lost(player, events);
                }
            }
            DeviceStatus::Disappeared | DeviceStatus::NoDevices => {
                info!("Output device disappeared during playback - pausing until it returns");
                self.enter_lost(player, events);
            }
        }
    }

    /// The device is present but its stream stopped consuming audio (it was
    /// switched off and on, the system slept, or the endpoint was reset).
    fn recover_stalled(&mut self, player: &AudioPlayer, events: &mut Vec<MonitorEvent>) {
        if self
            .last_stall_recovery
            .is_some_and(|at| at.elapsed() < STALL_RETRY_WINDOW)
        {
            warn!("Audio output stalled again right after recovery - stopping playback");
            player.pause_for_device_loss();
            events.push(MonitorEvent::PlaybackError(
                "The audio device stopped responding. Press play to try again.".to_string(),
            ));
            return;
        }

        warn!("Audio output stopped consuming audio - reopening the device");
        self.last_stall_recovery = Some(Instant::now());
        if !matches!(player.recover(), Ok(true)) {
            self.enter_lost(player, events);
        }
    }

    fn enter_lost(&mut self, player: &AudioPlayer, events: &mut Vec<MonitorEvent>) {
        let device = player.pause_for_device_loss();
        events.push(MonitorEvent::DeviceLost);
        self.lost = Some(LostState {
            device,
            since: Instant::now(),
        });
    }
}
