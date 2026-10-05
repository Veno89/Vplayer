//! Audio playback module
//!
//! Thin coordinator that holds focused sub-structs:
//! - playback_state: Position clock and playback intent
//! - preload: Gapless playback preloading
//! - volume_manager: Volume, ReplayGain, balance
//! - device: Device detection, DeviceState, output health, device-sink ownership
//! - effects: EQ and effects processing
//! - visualizer: Audio visualization buffer
//! - monitor: Background supervision (ticks, track end, device loss, stalls)
//!
//! # Thread Safety
//! All public methods are thread-safe (Send + Sync).
//! AudioPlayer is designed to be held in an Arc<AudioPlayer> or Tauri state.
//!
//! # Never block on the output stream
//! Rodio's `Player::clear`, `Player::try_seek` and appending to a stopped
//! player wait for the audio thread. When the device stream is dead they wait
//! forever (while holding our locks). Every source change therefore builds the
//! source, seeks it on the calling thread, and installs it in a fresh `Player`.

pub mod device;
pub mod effects;
pub mod monitor;
pub mod playback_state;
pub mod preload;
pub mod visualizer;
pub mod volume_manager;

use crate::context_log::LogContext;
use log::{error, info, warn};
use rodio::mixer::Mixer;
use rodio::{ChannelCount, Decoder, Player, SampleRate, Source};
use std::fs::File;
use std::io::BufReader;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use crate::error::{AppError, AppResult};

/// Acquire a Mutex lock, recovering from poison if a previous holder panicked.
///
/// Standard `.lock().unwrap()` will propagate panics if the Mutex is poisoned
/// (i.e. a thread panicked while holding the lock). For the audio engine this
/// is catastrophic — the entire playback system crashes. Instead, we accept the
/// potentially-inconsistent inner data and continue. The audio subsystem can
/// tolerate stale state far better than a hard crash.
fn lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
use crate::effects::{EffectsConfig, EffectsProcessor};
use effects::EffectsSource;
use visualizer::VisualizerBuffer;

pub use device::AudioDevice;
use device::{DeviceState, DeviceStatus, Heartbeat, OutputHealth};
use playback_state::{PlaybackState, SourceClock};
use preload::{PreloadManager, PreloadedTrack};
use volume_manager::VolumeManager;

/// Threshold for considering a pause "long" — after this duration, we proactively
/// reinitialize the audio stream to prevent stale device issues.
const LONG_PAUSE_THRESHOLD: Duration = Duration::from_secs(5 * 60); // 5 minutes

/// A healthy device pulls audio every few milliseconds, even while paused.
/// Without a pull for this long, the stream is treated as dead before playing.
const OUTPUT_STALL_TIMEOUT: Duration = Duration::from_millis(1500);

/// A track that runs dry more than this before its known duration ended early
/// (usually a read error) rather than finishing.
const EARLY_END_TOLERANCE: Duration = Duration::from_secs(2);

/// Pressing play on a track that finished within this of its end restarts it.
const RESTART_AT_END_TOLERANCE: Duration = Duration::from_millis(500);

type TrackSource = EffectsSource<Decoder<BufReader<File>>>;

// ─────────────────────────────────────────────────────────────────────────────
// BroadcastWake — condvar signal for the broadcast thread
// ─────────────────────────────────────────────────────────────────────────────

/// Lightweight wake signal for the broadcast thread.
///
/// Instead of polling every 1 s while idle, the thread waits on the condvar
/// and is woken immediately when playback starts or a track is loaded.
pub struct BroadcastWake {
    flag: Mutex<bool>,
    condvar: Condvar,
}

impl BroadcastWake {
    pub fn new() -> Self {
        Self {
            flag: Mutex::new(false),
            condvar: Condvar::new(),
        }
    }

    /// Wake the broadcast thread (called from play/load).
    pub fn signal(&self) {
        *lock_or_recover(&self.flag) = true;
        self.condvar.notify_one();
    }

    /// Block until signaled or the timeout elapses. Consumes the flag.
    pub fn wait_idle(&self, timeout: Duration) {
        let mut flag = lock_or_recover(&self.flag);
        if *flag {
            *flag = false;
            return;
        }
        let (mut flag, _) = self
            .condvar
            .wait_timeout(flag, timeout)
            .unwrap_or_else(PoisonError::into_inner);
        *flag = false;
    }
}

impl Default for BroadcastWake {
    fn default() -> Self {
        Self::new()
    }
}

/// Atomic snapshot of playback state for the broadcast thread.
///
/// Captured under a single sink lock so all fields are consistent with each
/// other.
pub struct BroadcastSnapshot {
    pub is_playing: bool,
    pub is_finished: bool,
    pub is_paused: bool,
    pub position: f64,
    pub duration: f64,
    /// Playback was requested, the source ran dry, and nobody handled it yet.
    pub ended: bool,
    /// Frontend load request that installed the current track (0 if internal).
    pub load_request_id: u64,
}

/// How the monitor should treat a source that ran dry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrackEndOutcome {
    /// The track played to its end.
    Finished,
    /// The track stopped early and was reopened where it stopped.
    Resumed,
    /// The track stopped early and could not be reopened.
    Failed(String),
}

/// The device playback was on when it disappeared.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LostDevice {
    pub name: Option<String>,
    pub follow_default: bool,
}

struct OpenedSource {
    source: TrackSource,
    duration: Duration,
    clock: Arc<SourceClock>,
}

fn admit_load_request(latest: &AtomicU64, request_id: u64) -> AppResult<()> {
    let previous = latest.fetch_max(request_id, Ordering::SeqCst);
    if request_id <= previous {
        Err(AppError::Audio("Stale load request ignored".to_string()))
    } else {
        Ok(())
    }
}

fn playback_speed(tempo: f32) -> f32 {
    if tempo.is_finite() {
        tempo.clamp(0.5, 2.0)
    } else {
        1.0
    }
}

/// Where to continue a track whose source ran dry.
fn resume_position(position: Duration, duration: Duration) -> Duration {
    if duration > Duration::ZERO && position + RESTART_AT_END_TOLERANCE >= duration {
        Duration::ZERO
    } else {
        position
    }
}

/// Whether a source that ran dry at `position` stopped before the end.
fn ended_early(position: Duration, duration: Duration) -> bool {
    duration > Duration::ZERO && position + EARLY_END_TOLERANCE < duration
}

/// Attach a new player to `mixer`, reporting device pulls to `health`.
fn connect_player(mixer: &Mixer, health: &Arc<OutputHealth>) -> Player {
    let (player, output) = Player::new();
    mixer.add(Heartbeat::new(output, health.clone()));
    player
}

fn file_name(path: &str) -> &str {
    std::path::Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path)
}

/// Thin coordinator that owns focused sub-structs.
///
/// Each sub-struct groups related state behind a single Mutex, reducing the
/// number of lock acquisitions per operation and clarifying ownership.
///
/// The non-Send CPAL output stream remains on a dedicated owner thread; this
/// coordinator stores only Send-safe control and mixer handles.
pub struct AudioPlayer {
    /// Serializes operations that replace the player, the source, or the
    /// output stream, so a slow device reinit can never interleave with a
    /// load, seek, or recovery.
    ops: Mutex<()>,
    sink: Mutex<Player>,
    playback: Mutex<PlaybackState>,
    preload: Mutex<PreloadManager>,
    volume_mgr: Mutex<VolumeManager>,
    device: Mutex<DeviceState>,
    // Shared with EffectsSource on the audio thread — must remain Arc<Mutex<>>
    effects_processor: Arc<Mutex<EffectsProcessor>>,
    effects_enabled: Arc<AtomicBool>,
    effects_configured: Arc<AtomicBool>,
    visualizer_buffer: Arc<VisualizerBuffer>,
    /// Shared atomic balance for lock-free per-sample L/R attenuation.
    /// Stored as f32 bits in AtomicU32 (0.0 = center, -1.0 = left, 1.0 = right).
    balance: Arc<AtomicU32>,
    /// Condvar wake signal for the broadcast thread — play/load signal it to
    /// break out of idle sleep immediately.
    broadcast_wake: Arc<BroadcastWake>,
    /// Latest-wins generation for asynchronous renderer load requests.
    latest_load_request: AtomicU64,
    /// Load request that installed the current track.
    current_load_request: AtomicU64,
}

impl AudioPlayer {
    pub fn new() -> AppResult<Self> {
        info!("Initializing audio player with high-quality settings");

        let device_state = match device::create_high_quality_output(None) {
            Ok(output) => {
                info!(
                    "Audio player initialized successfully on device: {:?}",
                    output.device_name
                );
                DeviceState::new(output)
            }
            Err(error) => {
                // The library and settings UI remain usable when Windows has no
                // output endpoint. Playback will attach to a real stream during
                // recovery as soon as a device appears.
                warn!("Starting audio player in device-less mode: {error}");
                let (mixer, source) = rodio::mixer::mixer(
                    ChannelCount::new(2).expect("stereo channel count is non-zero"),
                    SampleRate::new(44_100).expect("fallback sample rate is non-zero"),
                );
                DeviceState::dormant(mixer, source)
            }
        };

        Ok(Self::with_device_state(device_state))
    }

    fn with_device_state(device_state: DeviceState) -> Self {
        let mixer = device_state
            .mixer
            .clone()
            .expect("device state always starts with a mixer");
        let sink = connect_player(&mixer, &device_state.health);
        let effects_config = EffectsConfig::default();
        let effects_configured = effects_config.requires_sample_processing();

        Self {
            ops: Mutex::new(()),
            sink: Mutex::new(sink),
            playback: Mutex::new(PlaybackState::new()),
            preload: Mutex::new(PreloadManager::new()),
            volume_mgr: Mutex::new(VolumeManager::new()),
            device: Mutex::new(device_state),
            effects_processor: Arc::new(Mutex::new(EffectsProcessor::new(44100, effects_config))),
            effects_enabled: Arc::new(AtomicBool::new(true)),
            effects_configured: Arc::new(AtomicBool::new(effects_configured)),
            visualizer_buffer: Arc::new(VisualizerBuffer::new(visualizer::VISUALIZER_CAPACITY)),
            balance: Arc::new(AtomicU32::new(0.0_f32.to_bits())),
            broadcast_wake: Arc::new(BroadcastWake::new()),
            latest_load_request: AtomicU64::new(0),
            current_load_request: AtomicU64::new(0),
        }
    }

    fn lock_ops(&self) -> MutexGuard<'_, ()> {
        lock_or_recover(&self.ops)
    }

    // ── Device queries ──────────────────────────────────────────────

    pub fn has_device_changed(&self) -> bool {
        lock_or_recover(&self.device).has_device_changed()
    }

    pub fn is_device_available(&self) -> bool {
        device::is_device_available()
    }

    pub fn get_audio_devices() -> AppResult<Vec<AudioDevice>> {
        device::get_audio_devices()
    }

    /// One device enumeration describing the connected device's situation.
    pub fn device_status(&self) -> DeviceStatus {
        let (connected, follow_default) = {
            let device = lock_or_recover(&self.device);
            (
                device.connected_device_name.clone(),
                device.preferred_device_name.is_none(),
            )
        };
        device::device_status(connected.as_deref(), follow_default)
    }

    /// The output stream errored or the device stopped pulling audio.
    pub fn output_stalled(&self, timeout: Duration) -> bool {
        let device = lock_or_recover(&self.device);
        !device.has_output_stream() || device.health.is_stalled(timeout)
    }

    /// Whether the device lost earlier is back (and would be used again).
    pub fn lost_device_ready(&self, lost: &LostDevice) -> bool {
        match &lost.name {
            Some(name) => device::is_device_ready(name, lost.follow_default),
            None => device::is_device_available(),
        }
    }

    /// Returns a handle to the broadcast wake condvar for the broadcast thread.
    pub fn broadcast_wake(&self) -> Arc<BroadcastWake> {
        self.broadcast_wake.clone()
    }

    // ── Sources and players ─────────────────────────────────────────

    fn open_source(&self, path: &str) -> AppResult<OpenedSource> {
        let file = File::open(path)
            .map_err(|e| AppError::NotFound(format!("Failed to open file {}: {}", path, e)))?;
        // `TryFrom<File>` passes the byte length to the demuxer, which enables
        // random-access seeking and more accurate durations.
        let decoder = Decoder::try_from(file)
            .map_err(|e| AppError::Decode(format!("Failed to decode audio: {}", e)))?;
        let duration = decoder.total_duration().unwrap_or(Duration::ZERO);
        let clock = Arc::new(SourceClock::new());
        let source = EffectsSource::new(
            decoder,
            self.effects_processor.clone(),
            self.effects_enabled.clone(),
            self.effects_configured.clone(),
            self.visualizer_buffer.clone(),
            self.balance.clone(),
        )
        .with_clock(clock.clone());

        Ok(OpenedSource {
            source,
            duration,
            clock,
        })
    }

    /// Open `path` positioned at `position`. Returns the position reached.
    fn open_source_at(
        &self,
        path: &str,
        position: Duration,
    ) -> AppResult<(OpenedSource, Duration)> {
        let mut opened = self.open_source(path)?;
        if position.is_zero() {
            return Ok((opened, Duration::ZERO));
        }
        match opened.source.try_seek(position) {
            Ok(()) => Ok((opened, position)),
            Err(e) => {
                // A failed seek can leave the demuxer mid-stream; start clean.
                warn!("Seek to {position:?} failed ({e:?}); playing from the start");
                Ok((self.open_source(path)?, Duration::ZERO))
            }
        }
    }

    fn current_speed(&self) -> f32 {
        playback_speed(lock_or_recover(&self.effects_processor).get_config().tempo)
    }

    /// Install `source` in a fresh player and retire the previous one.
    ///
    /// Never waits on the audio thread, so it is safe with a dead stream.
    fn install_source(&self, source: TrackSource, paused: bool) -> AppResult<()> {
        let (mixer, health) = {
            let device = lock_or_recover(&self.device);
            (device.mixer()?.clone(), device.health.clone())
        };
        let player = connect_player(&mixer, &health);
        player.set_speed(self.current_speed());
        if paused {
            player.pause();
        }
        player.append(source);

        let mut sink = lock_or_recover(&self.sink);
        // Read the volume under the sink lock so a concurrent set_volume
        // lands on whichever player ends up installed.
        player.set_volume(lock_or_recover(&self.volume_mgr).effective_volume());
        let previous = std::mem::replace(&mut *sink, player);
        drop(sink);
        // Dropping a player stops it at the audio thread's next control tick.
        previous.set_volume(0.0);
        drop(previous);
        Ok(())
    }

    /// Reopen the current track at `position`. Requires the ops lock.
    fn reload_current(&self, position: Duration, paused: bool) -> AppResult<Duration> {
        let path = lock_or_recover(&self.playback)
            .current_path
            .clone()
            .ok_or_else(|| AppError::Audio("No file loaded".to_string()))?;
        let (opened, reached) = self.open_source_at(&path, position)?;
        self.install_source(opened.source, paused)?;
        lock_or_recover(&self.playback).replace_source(opened.duration, opened.clock);
        Ok(reached)
    }

    // ── Track loading ───────────────────────────────────────────────

    pub fn load(&self, path: String) -> AppResult<()> {
        let request_id = self.latest_load_request.fetch_add(1, Ordering::SeqCst) + 1;
        self.load_with_generation(path, request_id)
    }

    pub fn load_request(&self, path: String, request_id: u64) -> AppResult<()> {
        admit_load_request(&self.latest_load_request, request_id)?;

        if self.get_preloaded_path().as_deref() == Some(path.as_str()) {
            return self.swap_to_preloaded_generation(request_id, Some(path.as_str()));
        }

        self.load_with_generation(path, request_id)
    }

    fn ensure_current_request(&self, request_id: u64) -> AppResult<()> {
        if self.latest_load_request.load(Ordering::SeqCst) == request_id {
            Ok(())
        } else {
            Err(AppError::Audio("Stale load request ignored".to_string()))
        }
    }

    fn load_with_generation(&self, path: String, request_id: u64) -> AppResult<()> {
        let ctx = LogContext::new("audio_load").with("path", &path);
        ctx.info("Loading audio file");
        // Open and probe the file before taking the ops lock: slow storage
        // must not hold up pause, volume, or device recovery.
        let opened = self.open_source(&path).inspect_err(|e| {
            ctx.error(&format!("Load failed: {}", e));
        })?;
        ctx.info(&format!("Loaded, duration={:?}", opened.duration));

        self.ensure_current_request(request_id)?;
        let _ops = self.lock_ops();
        self.ensure_current_request(request_id)?;

        self.visualizer_buffer.clear();
        self.install_source(opened.source, true)?;
        lock_or_recover(&self.playback).reset_for_load(path, opened.duration, opened.clock);
        self.current_load_request
            .store(request_id, Ordering::SeqCst);
        lock_or_recover(&self.device).update_active();

        // Wake the broadcast thread so it picks up the new track quickly
        self.broadcast_wake.signal();

        Ok(())
    }

    // ── Device reinitialization ─────────────────────────────────────

    /// Recreate the audio output stream and an empty player on it, and drop
    /// preloads attached to the old mixer. Requires the ops lock.
    fn reinit_device(&self, preferred_device_name: Option<String>) -> AppResult<()> {
        let output = device::create_high_quality_output(preferred_device_name.as_deref())?;

        info!(
            "Audio output reinitialized on device: {:?}",
            output.device_name
        );

        let new_sink = connect_player(&output.mixer, &output.health);
        new_sink.set_volume(lock_or_recover(&self.volume_mgr).effective_volume());
        new_sink.set_speed(self.current_speed());

        let previous = std::mem::replace(&mut *lock_or_recover(&self.sink), new_sink);
        lock_or_recover(&self.device).replace(output, preferred_device_name);
        drop(previous);

        // Discard stale preload — its sink was connected to the old mixer.
        self.clear_preload();

        Ok(())
    }

    /// Reinit the device, then reopen the current track where it stopped.
    /// The track is left paused. Requires the ops lock.
    fn reinit_and_reload(&self, preferred_device_name: Option<String>) -> AppResult<()> {
        let resume = {
            let pb = lock_or_recover(&self.playback);
            pb.current_path.as_ref().map(|_| {
                let position = pb.clock.position();
                if pb.clock.is_finished() {
                    resume_position(position, pb.total_duration)
                } else {
                    position
                }
            })
        };

        self.reinit_device(preferred_device_name)?;

        if let Some(position) = resume {
            info!("Reloading track after reinit at {position:?}");
            self.reload_current(position, true)?;
        }

        Ok(())
    }

    // ── Playback control ────────────────────────────────────────────

    pub fn play(&self) -> AppResult<()> {
        let _ops = self.lock_ops();
        self.play_locked()
    }

    fn play_locked(&self) -> AppResult<()> {
        info!("Starting playback");

        let pause_duration = lock_or_recover(&self.playback).pause_duration();
        let (time_since_active, has_output_stream, preferred) = {
            let device = lock_or_recover(&self.device);
            (
                device.last_active.elapsed(),
                device.has_output_stream(),
                device.preferred_device_name.clone(),
            )
        };

        let status = self.device_status();
        if status == DeviceStatus::NoDevices {
            error!("No audio device available");
            return Err(AppError::Audio(
                "No audio output device available. Please connect an audio device.".to_string(),
            ));
        }

        let stalled = self.output_stalled(OUTPUT_STALL_TIMEOUT);
        let long_pause =
            pause_duration > LONG_PAUSE_THRESHOLD || time_since_active > LONG_PAUSE_THRESHOLD;
        if !has_output_stream || status != DeviceStatus::Unchanged || stalled || long_pause {
            info!(
                "Reinitializing audio output before playing (device: {:?}, stream stalled: {}, paused: {:?}, inactive: {:?})",
                status, stalled, pause_duration, time_since_active
            );
            self.reinit_and_reload(preferred)?;
        }

        self.start_playback()
    }

    /// Start the installed track, reopening it when its source ran dry.
    /// Does no device checks. Requires the ops lock.
    fn start_playback(&self) -> AppResult<()> {
        let needs_reload = {
            let sink = lock_or_recover(&self.sink);
            let pb = lock_or_recover(&self.playback);
            (sink.empty() && pb.current_path.is_some())
                .then(|| resume_position(pb.clock.position(), pb.total_duration))
        };

        if let Some(position) = needs_reload {
            // The source ran out (end of track, read error, or a dead stream).
            // Continue where audio actually stopped, or restart a finished track.
            info!("Player is empty but a track is loaded - reloading at {position:?}");
            self.reload_current(position, true)?;
            if position.is_zero() {
                lock_or_recover(&self.playback).early_end_at = None;
            }
        }

        lock_or_recover(&self.sink).play();
        lock_or_recover(&self.device).update_active();

        if let Some(paused_for) = lock_or_recover(&self.playback).mark_playing() {
            info!("Resumed from pause (paused for {:?})", paused_for);
        } else {
            info!("Started playback");
        }

        // Wake the broadcast thread from idle sleep immediately
        self.broadcast_wake.signal();

        Ok(())
    }

    pub fn pause(&self) -> AppResult<()> {
        let _ops = self.lock_ops();
        info!("Pausing playback");
        lock_or_recover(&self.sink).pause();
        lock_or_recover(&self.playback).mark_paused();
        Ok(())
    }

    /// Pause because the output device went away. Returns the lost device.
    pub fn pause_for_device_loss(&self) -> LostDevice {
        let _ops = self.lock_ops();
        lock_or_recover(&self.sink).pause();
        lock_or_recover(&self.playback).mark_paused();
        self.clear_preload();
        let device = lock_or_recover(&self.device);
        LostDevice {
            name: device.connected_device_name.clone(),
            follow_default: device.preferred_device_name.is_none(),
        }
    }

    pub fn stop(&self) -> AppResult<()> {
        let _ops = self.lock_ops();
        info!("Stopping playback");
        lock_or_recover(&self.sink).stop();
        lock_or_recover(&self.playback).clear();
        self.current_load_request.store(0, Ordering::SeqCst);
        Ok(())
    }

    // ── Volume ──────────────────────────────────────────────────────

    pub fn set_volume(&self, volume: f32) -> AppResult<()> {
        let effective = lock_or_recover(&self.volume_mgr).set_volume(volume);
        lock_or_recover(&self.sink).set_volume(effective);
        Ok(())
    }

    pub fn set_replaygain(&self, gain_db: f32, preamp_db: f32) -> AppResult<()> {
        let effective = lock_or_recover(&self.volume_mgr).set_replaygain(gain_db, preamp_db);
        lock_or_recover(&self.sink).set_volume(effective);
        Ok(())
    }

    pub fn clear_replaygain(&self) {
        let effective = lock_or_recover(&self.volume_mgr).clear_replaygain();
        lock_or_recover(&self.sink).set_volume(effective);
    }

    pub fn get_replaygain_multiplier(&self) -> f32 {
        lock_or_recover(&self.volume_mgr).replaygain_multiplier
    }

    pub fn set_balance(&self, balance: f32) -> AppResult<()> {
        let clamped = balance.clamp(-1.0, 1.0);
        lock_or_recover(&self.volume_mgr).set_balance(clamped);
        // Update the lock-free atomic so the audio thread applies it per-sample
        self.balance.store(clamped.to_bits(), Ordering::Relaxed);
        Ok(())
    }

    pub fn get_balance(&self) -> f32 {
        lock_or_recover(&self.volume_mgr).balance
    }

    // ── Seeking ─────────────────────────────────────────────────────

    /// Seek by reopening the track at `position` in a fresh player.
    ///
    /// Rodio's in-place seek blocks until the audio thread answers, which
    /// never happens on a dead stream; reopening only touches the file.
    pub fn seek(&self, position: f64) -> AppResult<()> {
        info!("Seeking to position: {}s", position);
        let _ops = self.lock_ops();

        if lock_or_recover(&self.playback).current_path.is_none() {
            return Err(AppError::Audio("No file loaded for seeking".to_string()));
        }

        let paused = lock_or_recover(&self.sink).is_paused();
        let target = Duration::try_from_secs_f64(position.max(0.0)).unwrap_or(Duration::ZERO);
        let reached = self.reload_current(target, paused)?;
        lock_or_recover(&self.playback).early_end_at = None;
        self.broadcast_wake.signal();

        info!("Seek completed at {:?}", reached);
        Ok(())
    }

    // ── Position & state queries ────────────────────────────────────

    pub fn get_position(&self) -> f64 {
        lock_or_recover(&self.playback).get_position()
    }

    pub fn is_playing(&self) -> bool {
        let sink = lock_or_recover(&self.sink);
        !sink.is_paused() && !sink.empty()
    }

    pub fn is_finished(&self) -> bool {
        lock_or_recover(&self.sink).empty()
    }

    pub fn get_duration(&self) -> f64 {
        lock_or_recover(&self.playback).total_duration.as_secs_f64()
    }

    /// Snapshot of playback state captured under a single sink lock.
    pub fn broadcast_snapshot(&self) -> BroadcastSnapshot {
        let sink = lock_or_recover(&self.sink);
        let pb = lock_or_recover(&self.playback);
        let is_paused = sink.is_paused();
        let is_empty = sink.empty();
        BroadcastSnapshot {
            is_playing: !is_paused && !is_empty,
            is_finished: is_empty,
            is_paused,
            position: pb.get_position(),
            duration: pb.total_duration.as_secs_f64(),
            ended: pb.play_requested && is_empty && pb.current_path.is_some() && !pb.end_reported,
            load_request_id: self.current_load_request.load(Ordering::SeqCst),
        }
    }

    /// Decide what a drained source means, at most once per source.
    ///
    /// A track that stopped well before its duration (typically a read error
    /// after the storage or device slept) is reopened where it stopped. If it
    /// stops at the same spot again, that is where the file really ends.
    pub fn handle_track_end(&self) -> Option<TrackEndOutcome> {
        let _ops = self.lock_ops();
        let sink_empty = lock_or_recover(&self.sink).empty();
        let (path, position, duration) = {
            let mut pb = lock_or_recover(&self.playback);
            // Re-check under the ops lock: a load or seek may have replaced
            // the source after the snapshot was taken.
            if !sink_empty || !pb.play_requested || pb.end_reported {
                return None;
            }
            let path = pb.current_path.clone()?;
            pb.end_reported = true;
            let position = pb.clock.position();
            let duration = pb.total_duration;

            if !ended_early(position, duration) {
                return Some(TrackEndOutcome::Finished);
            }
            if pb
                .early_end_at
                .is_some_and(|previous| position <= previous + EARLY_END_TOLERANCE)
            {
                info!(
                    "Track ended at {position:?} again (reported duration {duration:?}); treating it as the end"
                );
                return Some(TrackEndOutcome::Finished);
            }
            pb.early_end_at = Some(position);
            (path, position, duration)
        };

        warn!(
            "Track stopped early at {position:?} of {duration:?} (read error?) - reopening {}",
            file_name(&path)
        );
        match self.reload_current(position, false) {
            Ok(_) => {
                self.broadcast_wake.signal();
                Some(TrackEndOutcome::Resumed)
            }
            Err(e) => {
                error!("Could not reopen track after it stopped early: {e}");
                Some(TrackEndOutcome::Failed(format!(
                    "Could not keep reading \"{}\": {e}",
                    file_name(&path)
                )))
            }
        }
    }

    pub fn current_path(&self) -> Option<String> {
        lock_or_recover(&self.playback).current_path.clone()
    }

    // ── Output device switching ─────────────────────────────────────

    pub fn set_output_device(&self, device_name: &str) -> AppResult<()> {
        let _ops = self.lock_ops();
        let was_playing = lock_or_recover(&self.playback).play_requested;
        self.reinit_and_reload(Some(device_name.to_string()))?;

        if was_playing {
            self.start_playback()?;
        }

        Ok(())
    }

    // ── Gapless playback (preload) ──────────────────────────────────

    pub fn preload(&self, path: String) -> AppResult<()> {
        info!("Preloading audio file: {}", path);
        let opened = self.open_source(&path)?;

        let _ops = self.lock_ops();
        let (mixer, health, generation) = {
            let device = lock_or_recover(&self.device);
            (
                device.mixer()?.clone(),
                device.health.clone(),
                device.generation,
            )
        };
        let player = connect_player(&mixer, &health);
        player.set_volume(lock_or_recover(&self.volume_mgr).effective_volume());
        player.set_speed(self.current_speed());
        player.pause();
        player.append(opened.source);

        lock_or_recover(&self.preload).set(
            PreloadedTrack {
                sink: player,
                path,
                duration: opened.duration,
                clock: opened.clock,
            },
            generation,
        );
        info!(
            "Audio file preloaded successfully (reusing existing output, gen={})",
            generation
        );
        Ok(())
    }

    pub fn swap_to_preloaded(&self) -> AppResult<()> {
        let request_id = self.latest_load_request.fetch_add(1, Ordering::SeqCst) + 1;
        self.swap_to_preloaded_generation(request_id, None)
    }

    fn swap_to_preloaded_generation(
        &self,
        request_id: u64,
        expected_path: Option<&str>,
    ) -> AppResult<()> {
        info!("Swapping to preloaded track");
        let _ops = self.lock_ops();

        self.ensure_current_request(request_id)?;
        if let Some(expected) = expected_path
            && self.get_preloaded_path().as_deref() != Some(expected)
        {
            return Err(AppError::Audio(
                "Preloaded track does not match request".to_string(),
            ));
        }

        let current_gen = lock_or_recover(&self.device).generation;
        let Some(track) = lock_or_recover(&self.preload).take_if_current(current_gen) else {
            return Err(AppError::Audio("No preloaded track available".to_string()));
        };

        let current_speed = self.current_speed();
        let previous = {
            let mut sink = lock_or_recover(&self.sink);
            // A preload can sit while volume or tempo changes. Refresh both
            // at commit time so the next track inherits current settings.
            track
                .sink
                .set_volume(lock_or_recover(&self.volume_mgr).effective_volume());
            track.sink.set_speed(current_speed);
            track.sink.play();
            std::mem::replace(&mut *sink, track.sink)
        };
        previous.set_volume(0.0);
        drop(previous);

        {
            let mut pb = lock_or_recover(&self.playback);
            pb.reset_for_load(track.path, track.duration, track.clock);
            pb.mark_playing();
        }
        self.current_load_request
            .store(request_id, Ordering::SeqCst);
        lock_or_recover(&self.device).update_active();
        self.broadcast_wake.signal();

        info!("Successfully swapped to preloaded track");
        Ok(())
    }

    pub fn clear_preload(&self) {
        lock_or_recover(&self.preload).clear();
    }

    pub fn has_preloaded(&self) -> bool {
        lock_or_recover(&self.preload).has_preloaded()
    }

    pub fn get_preloaded_path(&self) -> Option<String> {
        lock_or_recover(&self.preload)
            .get_path()
            .map(|s| s.to_string())
    }

    // ── Effects ─────────────────────────────────────────────────────

    pub fn set_effects(&self, config: EffectsConfig) {
        // Apply tempo/speed at the Player level (changes playback rate).
        // Store the config first so a concurrently installed player reads
        // the new tempo.
        let tempo = playback_speed(config.tempo);
        let requires_processing = config.requires_sample_processing();
        lock_or_recover(&self.effects_processor).update_config(config);
        self.effects_configured
            .store(requires_processing, Ordering::Relaxed);
        lock_or_recover(&self.sink).set_speed(tempo);
    }

    pub fn get_effects(&self) -> EffectsConfig {
        lock_or_recover(&self.effects_processor).get_config()
    }

    pub fn set_effects_enabled(&self, enabled: bool) {
        self.effects_enabled.store(enabled, Ordering::Relaxed);
    }

    pub fn is_effects_enabled(&self) -> bool {
        self.effects_enabled.load(Ordering::Relaxed)
    }

    /// True while a load, seek, or device operation is in progress.
    pub fn is_reinitializing(&self) -> bool {
        self.ops.try_lock().is_err()
    }

    // ── Recovery & health ───────────────────────────────────────────

    pub fn recover(&self) -> AppResult<bool> {
        info!("Attempting audio system recovery...");
        let _ops = self.lock_ops();

        if !self.is_device_available() {
            warn!("No audio device available for recovery");
            return Ok(false);
        }

        let was_playing = lock_or_recover(&self.playback).play_requested;
        let preferred = lock_or_recover(&self.device).preferred_device_name.clone();

        match self.reinit_and_reload(preferred) {
            Ok(()) => {
                if was_playing && let Err(e) = self.start_playback() {
                    warn!("Failed to resume playback after recovery: {}", e);
                }

                info!("Audio system recovery completed successfully");
                Ok(true)
            }
            Err(e) => {
                error!("Failed to recreate audio output during recovery: {}", e);
                Ok(false)
            }
        }
    }

    pub fn is_healthy(&self) -> bool {
        match self.sink.try_lock() {
            Ok(sink) => {
                let _ = sink.is_paused();
                true
            }
            Err(_) => {
                warn!("Audio sink lock unavailable - system may be unhealthy");
                false
            }
        }
    }

    pub fn get_inactive_duration(&self) -> f64 {
        let pause_duration = lock_or_recover(&self.playback).pause_duration();
        let time_since_active = lock_or_recover(&self.device).last_active.elapsed();
        pause_duration.max(time_since_active).as_secs_f64()
    }

    pub fn needs_reinit(&self) -> bool {
        self.needs_reinit_given(self.device_status())
    }

    fn needs_reinit_given(&self, status: DeviceStatus) -> bool {
        if status != DeviceStatus::Unchanged || self.output_stalled(OUTPUT_STALL_TIMEOUT) {
            return true;
        }
        self.get_inactive_duration() > LONG_PAUSE_THRESHOLD.as_secs_f64()
    }

    /// Health summary from a single device enumeration:
    /// `(needs_reinit, device_changed, device_available)`.
    pub fn health_report(&self) -> (bool, bool, bool) {
        let status = self.device_status();
        let device_changed = matches!(
            status,
            DeviceStatus::Disappeared | DeviceStatus::DefaultChanged
        );
        (
            self.needs_reinit_given(status),
            device_changed,
            status != DeviceStatus::NoDevices,
        )
    }

    /// Copy the most recent visualizer samples into `out`; returns the sample rate.
    pub fn copy_visualizer_samples(&self, out: &mut Vec<f32>) -> u32 {
        self.visualizer_buffer.snapshot_into(out)
    }

    /// Avoid per-sample atomic writes when no visible visualizer consumes them.
    pub fn set_visualizer_active(&self, active: bool) {
        self.visualizer_buffer.set_active(active);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::mixer::MixerSource;
    use std::io::Write;
    use std::sync::mpsc;
    use std::thread;
    use std::time::Instant;

    #[test]
    fn load_request_admission_rejects_duplicate_and_older_ids() {
        let latest = AtomicU64::new(0);

        assert!(admit_load_request(&latest, 10).is_ok());
        assert!(admit_load_request(&latest, 10).is_err());
        assert!(admit_load_request(&latest, 11).is_ok());
        assert!(admit_load_request(&latest, 10).is_err());
    }

    #[test]
    fn playback_speed_clamps_and_recovers_invalid_tempo() {
        assert_eq!(playback_speed(0.1), 0.5);
        assert_eq!(playback_speed(1.25), 1.25);
        assert_eq!(playback_speed(4.0), 2.0);
        assert_eq!(playback_speed(f32::NAN), 1.0);
    }

    #[test]
    fn resume_position_restarts_only_finished_tracks() {
        let duration = Duration::from_secs(200);
        assert_eq!(
            resume_position(Duration::from_secs(83), duration),
            Duration::from_secs(83)
        );
        assert_eq!(resume_position(duration, duration), Duration::ZERO);
        assert_eq!(
            resume_position(Duration::from_millis(199_700), duration),
            Duration::ZERO
        );
        assert_eq!(
            resume_position(Duration::from_secs(83), Duration::ZERO),
            Duration::from_secs(83),
            "unknown durations never restart"
        );
    }

    #[test]
    fn wait_idle_times_out_without_signal() {
        let wake = BroadcastWake::new();
        let start = Instant::now();
        wake.wait_idle(Duration::from_millis(40));
        let elapsed = start.elapsed();

        assert!(elapsed >= Duration::from_millis(30));
    }

    #[test]
    fn signal_wakes_waiter_before_timeout() {
        let wake = Arc::new(BroadcastWake::new());
        let (tx, rx) = mpsc::channel();

        let wake_for_thread = Arc::clone(&wake);
        let handle = thread::spawn(move || {
            let start = Instant::now();
            wake_for_thread.wait_idle(Duration::from_secs(2));
            tx.send(start.elapsed())
                .expect("failed to send elapsed time");
        });

        thread::sleep(Duration::from_millis(50));
        wake.signal();

        let elapsed = rx
            .recv_timeout(Duration::from_secs(1))
            .expect("waiter thread did not wake in time");
        handle.join().expect("waiter thread panicked");

        assert!(elapsed < Duration::from_millis(500));
    }

    #[test]
    fn signal_flag_is_consumed_by_next_wait() {
        let wake = BroadcastWake::new();

        wake.signal();

        let immediate_start = Instant::now();
        wake.wait_idle(Duration::from_secs(1));
        let immediate_elapsed = immediate_start.elapsed();
        assert!(immediate_elapsed < Duration::from_millis(20));

        let timeout_start = Instant::now();
        wake.wait_idle(Duration::from_millis(40));
        let timeout_elapsed = timeout_start.elapsed();
        assert!(timeout_elapsed >= Duration::from_millis(30));
    }

    // ── Hardware-free engine tests ───────────────────────────────────
    //
    // A dormant mixer stands in for the device: the test pulls samples from
    // the MixerSource the way the audio thread would.

    const RATE: u32 = 8_000;

    fn test_mixer() -> (Mixer, MixerSource) {
        rodio::mixer::mixer(
            ChannelCount::new(1).expect("non-zero"),
            SampleRate::new(RATE).expect("non-zero"),
        )
    }

    fn test_player() -> (AudioPlayer, MixerSource) {
        let (mixer, output) = test_mixer();
        // The dormant state owns a MixerSource; give it an unused one and let
        // the test drive the real mixer output.
        let (_unused_mixer, unused_output) = test_mixer();
        let player = AudioPlayer::with_device_state(DeviceState::dormant(mixer, unused_output));
        (player, output)
    }

    /// Write a mono 16-bit WAV. `declared_secs` may exceed the samples
    /// actually written to simulate a file that cannot be read to its end.
    fn write_wav(name: &str, written_secs: u32, declared_secs: u32) -> String {
        let dir = std::env::temp_dir().join("vplayer-audio-tests");
        std::fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join(format!("{name}-{}.wav", std::process::id()));
        let samples = RATE * written_secs;
        let declared_bytes = RATE * declared_secs * 2;
        let mut bytes = Vec::with_capacity(44 + samples as usize * 2);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + declared_bytes).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes()); // PCM
        bytes.extend_from_slice(&1_u16.to_le_bytes()); // mono
        bytes.extend_from_slice(&RATE.to_le_bytes());
        bytes.extend_from_slice(&(RATE * 2).to_le_bytes());
        bytes.extend_from_slice(&2_u16.to_le_bytes());
        bytes.extend_from_slice(&16_u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&declared_bytes.to_le_bytes());
        for i in 0..samples {
            let value = ((i % 40) as i16 - 20) * 500;
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        let mut file = File::create(&path).expect("create wav");
        file.write_all(&bytes).expect("write wav");
        path.to_string_lossy().into_owned()
    }

    fn pull(source: &mut MixerSource, seconds: f32) {
        let samples = (RATE as f32 * seconds) as usize;
        for _ in 0..samples {
            source.next();
        }
    }

    #[test]
    fn position_comes_from_consumed_audio_and_survives_pause() {
        let (player, mut output) = test_player();
        let path = write_wav("position", 4, 4);
        player.load(path).expect("load");
        {
            let _ops = player.lock_ops();
            player.start_playback().expect("play");
        }

        pull(&mut output, 1.0);
        let position = player.get_position();
        assert!((0.9..=1.2).contains(&position), "position {position}");

        player.pause().expect("pause");
        pull(&mut output, 1.0);
        let paused_position = player.get_position();
        assert!(
            (paused_position - position).abs() < 0.1,
            "paused output must not advance: {position} -> {paused_position}"
        );
    }

    #[test]
    fn finished_track_reports_end_once_and_restarts_on_play() {
        let (player, mut output) = test_player();
        let path = write_wav("finish", 1, 1);
        player.load(path).expect("load");
        {
            let _ops = player.lock_ops();
            player.start_playback().expect("play");
        }
        pull(&mut output, 1.5);

        let snapshot = player.broadcast_snapshot();
        assert!(snapshot.ended, "drained track must be reported");
        assert_eq!(player.handle_track_end(), Some(TrackEndOutcome::Finished));
        assert!(!player.broadcast_snapshot().ended, "end is reported once");
        assert_eq!(player.handle_track_end(), None);

        // Play after the end restarts the track instead of seeking to its end.
        {
            let _ops = player.lock_ops();
            player.start_playback().expect("replay");
        }
        assert!(player.get_position() < 0.1);
        pull(&mut output, 0.3);
        assert!(player.is_playing());
    }

    #[test]
    fn empty_player_resumes_where_audio_stopped_not_at_the_end() {
        let (player, mut output) = test_player();
        let path = write_wav("resume", 6, 6);
        player.load(path).expect("load");
        {
            let _ops = player.lock_ops();
            player.start_playback().expect("play");
        }
        pull(&mut output, 2.0);
        player.pause().expect("pause");

        // Simulate the source being dropped while idle.
        lock_or_recover(&player.sink).stop();
        pull(&mut output, 0.1);
        assert!(player.is_finished());
        let stopped_at = player.get_position();
        assert!(
            stopped_at < 3.0,
            "position must not jump to the end: {stopped_at}"
        );

        {
            let _ops = player.lock_ops();
            player.start_playback().expect("resume");
        }
        let resumed_at = player.get_position();
        assert!(
            (resumed_at - stopped_at).abs() < 0.2,
            "resumed at {resumed_at}, stopped at {stopped_at}"
        );
        pull(&mut output, 0.5);
        assert!(player.is_playing());
    }

    #[test]
    fn track_that_cannot_be_read_to_its_end_is_reopened_then_finished() {
        let (player, mut output) = test_player();
        // Header promises 6 s, file only holds 2 s.
        let path = write_wav("truncated", 2, 6);
        player.load(path).expect("load");
        assert!(player.get_duration() > 5.0);
        {
            let _ops = player.lock_ops();
            player.start_playback().expect("play");
        }
        pull(&mut output, 2.5);

        assert!(player.broadcast_snapshot().ended);
        assert_eq!(player.handle_track_end(), Some(TrackEndOutcome::Resumed));
        pull(&mut output, 0.5);
        assert!(player.broadcast_snapshot().ended);
        assert_eq!(
            player.handle_track_end(),
            Some(TrackEndOutcome::Finished),
            "a second early end at the same spot is the real end"
        );
    }

    #[test]
    fn missing_file_on_reopen_reports_failure() {
        let (player, mut output) = test_player();
        let path = write_wav("vanishing", 2, 6);
        player.load(path.clone()).expect("load");
        {
            let _ops = player.lock_ops();
            player.start_playback().expect("play");
        }
        pull(&mut output, 2.5);
        // The file disappears (drive unplugged, share offline) mid-track.
        lock_or_recover(&player.playback).current_path = Some(format!("{path}.vanishing-gone"));

        match player.handle_track_end() {
            Some(TrackEndOutcome::Failed(message)) => {
                assert!(message.contains("vanishing"), "{message}");
            }
            other => panic!("expected failure, got {other:?}"),
        }
    }

    #[test]
    fn seek_never_waits_for_the_audio_thread() {
        let (player, _output) = test_player();
        let path = write_wav("seek", 6, 6);
        player.load(path).expect("load");

        // Nothing pulls from the mixer: an in-place rodio seek would hang.
        let start = Instant::now();
        player.seek(3.0).expect("seek");
        assert!(start.elapsed() < Duration::from_secs(2));
        assert!((player.get_position() - 3.0).abs() < 0.05);
    }

    #[test]
    fn missing_file_is_reported_as_not_found() {
        let (player, _output) = test_player();
        let error = player
            .load("/definitely/not/here.flac".to_string())
            .expect_err("missing file");
        assert!(error.to_string().starts_with("Not found"), "{error}");
    }

    // ── F-017e: AudioPlayer recover() contract (requires audio hardware) ─────

    /// Full recover() cycle on a freshly constructed AudioPlayer.
    /// Verifies that recover() returns Ok(true) and the player stays healthy.
    ///
    /// Requires a real audio output device. Run with:
    ///   cargo test --lib -- audio::tests::recover_restores_healthy_state --include-ignored
    #[test]
    #[ignore = "requires real audio hardware — run with --include-ignored on a dev machine"]
    fn recover_restores_healthy_state_after_reinit() {
        let player = AudioPlayer::new().expect("AudioPlayer::new requires audio hardware");

        assert!(player.is_healthy(), "new AudioPlayer should report healthy");
        assert!(
            !player.needs_reinit(),
            "new AudioPlayer should not need reinit immediately"
        );

        let recovered = player
            .recover()
            .expect("recover() should not return an AppError");
        assert!(
            recovered,
            "recover() on a healthy player should return true"
        );
        assert!(
            player.is_healthy(),
            "AudioPlayer should still be healthy after recover()"
        );
    }

    /// needs_reinit() must be false immediately after construction (no long
    /// pause has elapsed, and the device name is still present in the OS list).
    #[test]
    #[ignore = "requires real audio hardware — run with --include-ignored on a dev machine"]
    fn needs_reinit_is_false_immediately_after_construction() {
        let player = AudioPlayer::new().expect("AudioPlayer::new requires audio hardware");
        assert!(
            !player.needs_reinit(),
            "needs_reinit should be false immediately after construction"
        );
    }
}
