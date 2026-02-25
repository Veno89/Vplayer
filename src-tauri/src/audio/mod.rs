//! Audio playback module
//!
//! Thin coordinator that holds focused sub-structs:
//! - playback_state: Position tracking, timing
//! - preload: Gapless playback preloading
//! - volume_manager: Volume, ReplayGain, balance
//! - device: Device detection, DeviceState, SendOutputStream
//! - effects: EQ and effects processing
//! - visualizer: Audio visualization buffer
//!
//! # Thread Safety
//! All public methods are thread-safe (Send + Sync).
//! AudioPlayer is designed to be held in an Arc<AudioPlayer> or Tauri state.

pub mod visualizer;
pub mod effects;
pub mod device;
pub mod playback_state;
pub mod preload;
pub mod volume_manager;

use rodio::{Decoder, Sink, Source};
use std::fs::File;
use std::io::BufReader;
use log::{info, error, warn};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, Condvar};
use std::time::{Duration, Instant};

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
use visualizer::VisualizerBuffer;
use effects::EffectsSource;

use playback_state::PlaybackState;
use preload::PreloadManager;
use volume_manager::VolumeManager;
use device::DeviceState;
pub use device::AudioDevice;

/// Threshold for considering a pause "long" — after this duration, we proactively
/// reinitialize the audio stream to prevent stale device issues.
const LONG_PAUSE_THRESHOLD: Duration = Duration::from_secs(5 * 60); // 5 minutes

/// Atomic snapshot of playback state for the broadcast thread.
///
/// Captured under a single sink lock so all fields are consistent with each
/// other — no TOCTOU race between `is_playing` and `is_finished`.
pub struct BroadcastSnapshot {
    pub is_playing: bool,
    pub is_finished: bool,
    pub position: f64,
    pub duration: f64,
}

/// Thin coordinator that owns focused sub-structs.
///
/// Each sub-struct groups related state behind a single Mutex, reducing the
/// number of lock acquisitions per operation and clarifying ownership.
///
/// # Send / Sync
///
/// All fields are either `Mutex<T>` or `Arc<Mutex<T>>` for Send + Sync types.
/// The only originally-!Send type (`OutputStream`) is wrapped in
/// `SendOutputStream` (see `device.rs`) with a targeted, documented unsafe impl.
/// The blanket `unsafe impl Send/Sync for AudioPlayer` is no longer needed.
pub struct AudioPlayer {
    sink: Mutex<Sink>,
    playback: Mutex<PlaybackState>,
    preload: Mutex<PreloadManager>,
    volume_mgr: Mutex<VolumeManager>,
    device: Mutex<DeviceState>,
    // Shared with EffectsSource on the audio thread — must remain Arc<Mutex<>>
    effects_processor: Arc<Mutex<EffectsProcessor>>,
    effects_enabled: Mutex<bool>,
    visualizer_buffer: Arc<Mutex<VisualizerBuffer>>,
    /// Condvar signalled when playback state changes (play/load/stop).
    /// The broadcast thread waits on this instead of polling during idle.
    pub broadcast_condvar: Arc<(Mutex<bool>, Condvar)>,
}

impl AudioPlayer {
    pub fn new() -> AppResult<Self> {
        info!("Initializing audio player with high-quality settings");

        let (stream, mixer, device_name) = device::create_high_quality_output_with_device_name()?;

        // Use Sink::connect_new to attach to our manual mixer
        let sink = Sink::connect_new(&mixer);

        let visualizer_buffer = Arc::new(Mutex::new(VisualizerBuffer::new(4096)));

        info!("Audio player initialized successfully on device: {:?}", device_name);
        Ok(Self {
            sink: Mutex::new(sink),
            playback: Mutex::new(PlaybackState::new()),
            preload: Mutex::new(PreloadManager::new()),
            volume_mgr: Mutex::new(VolumeManager::new()),
            device: Mutex::new(DeviceState::new(stream, mixer, device_name)),
            effects_processor: Arc::new(Mutex::new(
                EffectsProcessor::new(44100, EffectsConfig::default()),
            )),
            effects_enabled: Mutex::new(true),
            visualizer_buffer,
            broadcast_condvar: Arc::new((Mutex::new(false), Condvar::new())),
        })
    }

    /// Wake the broadcast thread so it re-checks state immediately.
    fn notify_broadcast(&self) {
        let (lock, cvar) = &*self.broadcast_condvar;
        if let Ok(mut woken) = lock.lock() {
            *woken = true;
            cvar.notify_one();
        }
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

    // ── Track loading ───────────────────────────────────────────────

    pub fn load(&self, path: String) -> AppResult<()> {
        info!("Loading audio file: {}", path);
        let file = File::open(&path).map_err(|e| {
            error!("Failed to open file {}: {}", path, e);
            AppError::NotFound(format!("Failed to open file {}: {}", path, e))
        })?;

        let source = Decoder::new(BufReader::new(file)).map_err(|e| {
            error!("Failed to decode audio: {}", e);
            AppError::Decode(format!("Failed to decode audio: {}", e))
        })?;

        let duration = source.total_duration().unwrap_or(Duration::ZERO);
        info!("Audio file loaded successfully, duration: {:?}", duration);

        // Clear visualizer buffer for new track
        if let Ok(mut buffer) = self.visualizer_buffer.lock() {
            buffer.clear();
        }

        // Wrap source with effects processor for EQ and visualizer
        let effects_source = EffectsSource::new(
            source,
            self.effects_processor.clone(),
            self.visualizer_buffer.clone(),
        );

        let sink = lock_or_recover(&self.sink);
        sink.clear();
        sink.append(effects_source);
        sink.pause();

        lock_or_recover(&self.playback).reset_for_load(path, duration);
        lock_or_recover(&self.device).update_active();
        self.notify_broadcast();

        Ok(())
    }

    // ── Playback control ────────────────────────────────────────────

    pub fn play(&self) -> AppResult<()> {
        info!("Starting playback");

        let pause_duration = {
            let pb = lock_or_recover(&self.playback);
            pb.pause_start.map(|s| s.elapsed()).unwrap_or(Duration::ZERO)
        };

        let time_since_active = lock_or_recover(&self.device).last_active.elapsed();
        let device_changed = self.has_device_changed();
        let device_available = self.is_device_available();

        if !device_available {
            error!("No audio device available");
            return Err(AppError::Audio(
                "No audio output device available. Please connect an audio device.".to_string(),
            ));
        }

        // Check if sink is empty but we think we have a track
        // This handles cases where the stream died, finished, or was dropped
        let needs_reload = {
            let sink = lock_or_recover(&self.sink);
            let pb = lock_or_recover(&self.playback);
            sink.empty() && pb.current_path.is_some()
        };

        let needs_reinit = device_changed
            || pause_duration > LONG_PAUSE_THRESHOLD
            || time_since_active > LONG_PAUSE_THRESHOLD;

        if needs_reinit {
            if device_changed {
                info!("Audio device changed, reinitializing audio stream...");
            } else {
                info!(
                    "Long pause detected (paused: {:?}, inactive: {:?}), reinitializing...",
                    pause_duration, time_since_active
                );
            }

            let current_path = lock_or_recover(&self.playback).current_path.clone();
            let current_position = self.get_position();

            self.reinit_device()?;

            if let Some(path) = current_path {
                info!("Reloading track after audio reinit: {}", path);
                if let Err(e) = self.load(path) {
                    error!("Failed to reload track after reinit: {}", e);
                    return Err(e);
                }
                if current_position > 0.5 {
                    if let Err(e) = self.seek(current_position) {
                        warn!("Failed to restore position after reinit: {}", e);
                    }
                }
            }
        } else if needs_reload {
            // Sink is empty but we have a track - reload it
            info!("Sink is empty but track is loaded - attempting reload/resume");
            let current_path = lock_or_recover(&self.playback).current_path.clone();
            let current_position = self.get_position();

            if let Some(path) = current_path {
                info!("Reloading track for resume: {}", path);
                if let Err(e) = self.load(path) {
                    error!("Failed to reload track for resume: {}", e);
                    return Err(e);
                }
                // Seek if we weren't at the very beginning
                if current_position > 0.5 {
                    if let Err(e) = self.seek(current_position) {
                        warn!("Failed to restore position for resume: {}", e);
                    }
                }
            }
        }

        // Now actually play
        let sink = lock_or_recover(&self.sink);
        sink.play();

        lock_or_recover(&self.device).update_active();

        let mut pb = lock_or_recover(&self.playback);
        if let Some(pause_dur) = pb.mark_playing() {
            info!("Resumed from pause (paused for {:?})", pause_dur);
        } else {
            info!("Started fresh playback");
        }

        self.notify_broadcast();
        Ok(())
    }

    pub fn pause(&self) -> AppResult<()> {
        info!("Pausing playback");
        lock_or_recover(&self.sink).pause();
        lock_or_recover(&self.playback).mark_paused();
        self.notify_broadcast();
        Ok(())
    }

    pub fn stop(&self) -> AppResult<()> {
        info!("Stopping playback");
        lock_or_recover(&self.sink).stop();
        lock_or_recover(&self.playback).clear();
        self.notify_broadcast();
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
        lock_or_recover(&self.volume_mgr).set_balance(balance);
        // Apply balance to the effects processor so it processes L/R channels
        if let Ok(mut proc) = self.effects_processor.lock() {
            proc.set_balance(balance);
        }
        Ok(())
    }

    pub fn get_balance(&self) -> f32 {
        lock_or_recover(&self.volume_mgr).balance
    }

    // ── Seeking ─────────────────────────────────────────────────────

    pub fn seek(&self, position: f64) -> AppResult<()> {
        info!("Seeking to position: {}s", position);

        let current_pos = self.get_position();
        info!(
            "Current position before seek: {}s, target: {}s",
            current_pos, position
        );

        let sink = lock_or_recover(&self.sink);
        let was_playing = !sink.is_paused();
        let current_volume = sink.volume();

        match sink.try_seek(Duration::from_secs_f64(position)) {
            Ok(_) => {
                info!("Seek successful to {}s", position);
                let is_paused = sink.is_paused();
                lock_or_recover(&self.playback).mark_seeked(position, is_paused);
                Ok(())
            }
            Err(e) => {
                warn!("Direct seek failed: {:?}, attempting reload method", e);

                let path = lock_or_recover(&self.playback).current_path.clone();
                let total_dur = lock_or_recover(&self.playback).total_duration;

                if let Some(path) = path {
                    // Must drop sink lock before calling self.methods that also lock it
                    drop(sink);

                    info!("Reloading file for backward seek: {}", path);

                    let file = match File::open(&path) {
                        Ok(f) => f,
                        Err(e) => {
                            error!("Seek fallback: failed to reopen file: {}", e);
                            // Clear playback state to prevent the broadcast thread
                            // from seeing "empty sink + path = finished" and
                            // emitting a spurious track-ended event.
                            lock_or_recover(&self.playback).clear();
                            return Err(AppError::NotFound(format!("Failed to open file: {}", e)));
                        }
                    };

                    let source = match Decoder::new(BufReader::new(file)) {
                        Ok(s) => s,
                        Err(e) => {
                            error!("Seek fallback: failed to decode file: {}", e);
                            lock_or_recover(&self.playback).clear();
                            return Err(AppError::Decode(format!("Failed to decode audio: {}", e)));
                        }
                    };

                    let effects_source = EffectsSource::new(
                        source,
                        self.effects_processor.clone(),
                        self.visualizer_buffer.clone(),
                    );

                    let sink = lock_or_recover(&self.sink);
                    sink.clear();
                    sink.append(effects_source);
                    sink.set_volume(current_volume);

                    if position > 0.0 {
                        match sink.try_seek(Duration::from_secs_f64(position)) {
                            Ok(_) => {
                                info!("Forward seek after reload successful to {}s", position)
                            }
                            Err(e) => warn!("Forward seek after reload failed: {:?}", e),
                        }
                    }

                    {
                        let mut pb = lock_or_recover(&self.playback);
                        pb.total_duration = total_dur;
                        pb.mark_seeked(position, !was_playing);
                    }

                    if was_playing {
                        sink.play();
                    } else {
                        sink.pause();
                    }

                    info!("Backward seek completed via reload to {}s", position);
                    Ok(())
                } else {
                    Err(AppError::Audio("No file loaded for seeking".to_string()))
                }
            }
        }
    }

    // ── Position & state queries ────────────────────────────────────

    pub fn get_position(&self) -> f64 {
        let sink = lock_or_recover(&self.sink);
        let pb = lock_or_recover(&self.playback);
        pb.get_position(sink.empty(), sink.is_paused())
    }

    pub fn is_playing(&self) -> bool {
        let sink = lock_or_recover(&self.sink);
        !sink.is_paused() && !sink.empty()
    }

    pub fn is_finished(&self) -> bool {
        lock_or_recover(&self.sink).empty()
    }

    #[allow(dead_code)]
    pub fn get_current_path(&self) -> Option<String> {
        lock_or_recover(&self.playback).current_path.clone()
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
            position: pb.get_position(is_empty, is_paused),
            duration: pb.total_duration.as_secs_f64(),
        }
    }

    // ── Device reinitialization (shared by play, recover, set_output_device) ──

    /// Recreate the audio output stream and sink. Discards any stale preload.
    ///
    /// Does NOT reload the current track — callers handle that because they
    /// each need different seek/resume behaviour.
    fn reinit_device(&self) -> AppResult<()> {
        let (new_stream, new_mixer, new_device_name) =
            device::create_high_quality_output_with_device_name()?;

        info!("Audio stream reinitialized on device: {:?}", new_device_name);

        let new_sink = Sink::connect_new(&new_mixer);
        new_sink.set_volume(lock_or_recover(&self.volume_mgr).effective_volume());

        lock_or_recover(&self.device)
            .replace(new_stream, new_mixer, new_device_name);
        *lock_or_recover(&self.sink) = new_sink;

        // Discard any preloaded track — its sink was connected to
        // the old mixer/stream which is now dead.
        self.clear_preload();

        Ok(())
    }

    // ── Output device switching ─────────────────────────────────────

    pub fn set_output_device(&self, device_name: &str) -> AppResult<()> {
        let host = rodio::cpal::default_host();
        use rodio::cpal::traits::HostTrait;

        let mut output_devices = host
            .output_devices()
            .map_err(|e| AppError::Audio(format!("Failed to enumerate devices: {}", e)))?;

        let _device = output_devices
            .find(|d| {
                use rodio::DeviceTrait;
                d.name().ok().as_deref() == Some(device_name)
            })
            .ok_or_else(|| AppError::NotFound(format!("Device '{}' not found", device_name)))?;

        let was_playing = self.is_playing();
        let current_position = self.get_position();
        let current_path = lock_or_recover(&self.playback).current_path.clone();

        self.reinit_device()?;

        if let Some(path) = current_path {
            self.load(path)?;
            if current_position > 0.0 {
                self.seek(current_position)?;
            }
            if was_playing {
                self.play()?;
            }
        }

        Ok(())
    }

    // ── Gapless playback (preload) ──────────────────────────────────

    pub fn preload(&self, path: String) -> AppResult<()> {
        info!("Preloading audio file: {}", path);

        let file = File::open(&path)
            .map_err(|e| AppError::NotFound(format!("Failed to open file {}: {}", path, e)))?;

        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| AppError::Decode(format!("Failed to decode audio: {}", e)))?;

        let duration = source.total_duration().unwrap_or(Duration::ZERO);

        // Wrap in EffectsSource so preloaded tracks get EQ/visualizer
        // processing — same pipeline as load().
        let effects_source = EffectsSource::new(
            source,
            self.effects_processor.clone(),
            self.visualizer_buffer.clone(),
        );

        // Reuse the existing device mixer
        let device = lock_or_recover(&self.device);
        let generation = device.generation;
        let new_sink = Sink::connect_new(device.mixer()?);
        drop(device); // release device lock before acquiring sink lock

        let current_volume = lock_or_recover(&self.sink).volume();
        new_sink.set_volume(current_volume);
        new_sink.append(effects_source);
        new_sink.pause();

        lock_or_recover(&self.preload).set(new_sink, path, duration, generation);
        info!("Audio file preloaded successfully (reusing existing output, gen={})", generation);
        Ok(())
    }

    pub fn swap_to_preloaded(&self) -> AppResult<()> {
        info!("Swapping to preloaded track");

        let current_gen = lock_or_recover(&self.device).generation;
        let taken = lock_or_recover(&self.preload).take_if_current(current_gen);
        if let Some((new_sink, new_path, new_duration)) = taken {
            // Hold a single sink lock across stop → replace → play to prevent
            // another thread from observing a half-swapped state.
            {
                let mut sink = lock_or_recover(&self.sink);
                sink.stop();
                *sink = new_sink;
                sink.play();
            }

            // Clear visualizer buffer for the new track
            if let Ok(mut buffer) = self.visualizer_buffer.lock() {
                buffer.clear();
            }

            {
                let mut pb = lock_or_recover(&self.playback);
                pb.current_path = Some(new_path);
                pb.total_duration = new_duration;
                pb.start_time = Some(Instant::now());
                pb.seek_offset = Duration::ZERO;
                pb.paused_duration = Duration::ZERO;
                pb.pause_start = None;
            }

            self.notify_broadcast();
            info!("Successfully swapped to preloaded track");
            Ok(())
        } else {
            Err(AppError::Audio(
                "No preloaded track available".to_string(),
            ))
        }
    }

    pub fn clear_preload(&self) {
        lock_or_recover(&self.preload).clear();
    }

    pub fn has_preloaded(&self) -> bool {
        lock_or_recover(&self.preload).has_preloaded()
    }

    // ── Effects ─────────────────────────────────────────────────────

    pub fn set_effects(&self, config: EffectsConfig) {
        // Apply tempo/speed at the Sink level (changes playback rate)
        let tempo = config.tempo.clamp(0.5, 2.0);
        lock_or_recover(&self.sink).set_speed(tempo);
        lock_or_recover(&self.effects_processor).update_config(config);
    }

    pub fn get_effects(&self) -> EffectsConfig {
        lock_or_recover(&self.effects_processor).get_config()
    }

    pub fn set_effects_enabled(&self, enabled: bool) {
        *lock_or_recover(&self.effects_enabled) = enabled;
    }

    pub fn is_effects_enabled(&self) -> bool {
        *lock_or_recover(&self.effects_enabled)
    }

    // ── Recovery & health ───────────────────────────────────────────

    pub fn recover(&self) -> AppResult<bool> {
        info!("Attempting audio system recovery...");

        if !self.is_device_available() {
            warn!("No audio device available for recovery");
            return Ok(false);
        }

        let current_path = lock_or_recover(&self.playback).current_path.clone();
        let current_position = self.get_position();
        let was_playing = self.is_playing();

        match self.reinit_device() {
            Ok(()) => {
                if let Some(path) = current_path {
                    info!("Reloading track after recovery: {}", path);
                    if let Err(e) = self.load(path) {
                        warn!("Failed to reload track after recovery: {}", e);
                        return Ok(false);
                    }
                    if current_position > 0.5 {
                        if let Err(e) = self.seek(current_position) {
                            warn!("Failed to restore position after recovery: {}", e);
                        }
                    }
                    if was_playing {
                        if let Err(e) = self.play() {
                            warn!("Failed to resume playback after recovery: {}", e);
                        }
                    }
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
        let pause_duration = {
            let pb = lock_or_recover(&self.playback);
            pb.pause_start
                .map(|s| s.elapsed())
                .unwrap_or(Duration::ZERO)
        };

        let time_since_active = lock_or_recover(&self.device).last_active.elapsed();
        pause_duration.max(time_since_active).as_secs_f64()
    }

    pub fn needs_reinit(&self) -> bool {
        if self.has_device_changed() {
            return true;
        }

        let pause_duration = {
            let pb = lock_or_recover(&self.playback);
            pb.pause_start
                .map(|s| s.elapsed())
                .unwrap_or(Duration::ZERO)
        };

        let time_since_active = lock_or_recover(&self.device).last_active.elapsed();
        pause_duration > LONG_PAUSE_THRESHOLD || time_since_active > LONG_PAUSE_THRESHOLD
    }

    /// Get current audio samples for visualization
    pub fn get_visualizer_samples(&self) -> Vec<f32> {
        match self.visualizer_buffer.lock() {
            Ok(buffer) => buffer.get_samples(),
            Err(_) => Vec::new(),
        }
    }
}
