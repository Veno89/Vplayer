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
use std::sync::atomic::{AtomicU32, Ordering};
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
        Self { flag: Mutex::new(false), condvar: Condvar::new() }
    }

    /// Wake the broadcast thread (called from play/load).
    pub fn signal(&self) {
        *lock_or_recover(&self.flag) = true;
        self.condvar.notify_one();
    }

    /// Block until signaled or the timeout elapses. Consumes the flag.
    pub fn wait_idle(&self, timeout: Duration) {
        let mut flag = lock_or_recover(&self.flag);
        if *flag { *flag = false; return; }
        let (mut flag, _) = self
            .condvar
            .wait_timeout(flag, timeout)
            .unwrap_or_else(PoisonError::into_inner);
        *flag = false;
    }
}

/// Atomic snapshot of playback state for the broadcast thread.
///
/// Captured under a single sink lock so all fields are consistent with each
/// other — no TOCTOU race between `is_playing` and `is_finished`.
pub struct BroadcastSnapshot {
    pub is_playing: bool,
    pub is_finished: bool,
    pub is_paused: bool,
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
    visualizer_buffer: Arc<VisualizerBuffer>,
    /// Shared atomic balance for lock-free per-sample L/R attenuation.
    /// Stored as f32 bits in AtomicU32 (0.0 = center, -1.0 = left, 1.0 = right).
    balance: Arc<AtomicU32>,
    /// Condvar wake signal for the broadcast thread — play/load signal it to
    /// break out of idle sleep immediately.
    broadcast_wake: Arc<BroadcastWake>,
}

impl AudioPlayer {
    pub fn new() -> AppResult<Self> {
        info!("Initializing audio player with high-quality settings");

        let (stream, mixer, device_name) = device::create_high_quality_output_with_device_name()?;
        
        // Use Sink::connect_new to attach to our manual mixer
        let sink = Sink::connect_new(&mixer);
        
        let visualizer_buffer = Arc::new(VisualizerBuffer::new(4096));

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
            balance: Arc::new(AtomicU32::new(0.0_f32.to_bits())),
            broadcast_wake: Arc::new(BroadcastWake::new()),
        })
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

    /// Returns a handle to the broadcast wake condvar for the broadcast thread.
    pub fn broadcast_wake(&self) -> Arc<BroadcastWake> {
        self.broadcast_wake.clone()
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
        self.visualizer_buffer.clear();

        // Wrap source with effects processor for EQ and visualizer
        let effects_source = EffectsSource::new(
            source,
            self.effects_processor.clone(),
            self.visualizer_buffer.clone(),
            self.balance.clone(),
        );

        let sink = lock_or_recover(&self.sink);
        sink.clear();
        sink.append(effects_source);
        sink.pause();

        lock_or_recover(&self.playback).reset_for_load(path, duration);
        lock_or_recover(&self.device).update_active();

        // Wake the broadcast thread so it picks up the new track quickly
        self.broadcast_wake.signal();

        Ok(())
    }

    // ── Device reinitialization ─────────────────────────────────────

    /// Recreate the audio output stream, sink, and invalidate stale preloads.
    ///
    /// This is the single source of truth for device reinit. After this call
    /// the sink is empty (no source appended) — callers must reload/seek as
    /// needed for their specific use-case.
    fn reinit_device(&self) -> AppResult<()> {
        let (new_stream, new_mixer, new_device_name) =
            device::create_high_quality_output_with_device_name()?;

        info!("Audio output reinitialized on device: {:?}", new_device_name);

        let new_sink = Sink::connect_new(&new_mixer);
        new_sink.set_volume(lock_or_recover(&self.volume_mgr).effective_volume());

        lock_or_recover(&self.device)
            .replace(new_stream, new_mixer, new_device_name);
        *lock_or_recover(&self.sink) = new_sink;

        // Discard stale preload — its sink was connected to the old mixer.
        self.clear_preload();

        Ok(())
    }

    /// Reinit device, then reload the current track at the given position.
    /// Returns Ok(()) even if there was no track to reload.
    fn reinit_and_reload(&self) -> AppResult<()> {
        let current_path = lock_or_recover(&self.playback).current_path.clone();
        let current_position = self.get_position();

        self.reinit_device()?;

        if let Some(path) = current_path {
            info!("Reloading track after reinit: {}", path);
            self.load(path)?;
            if current_position > 0.5 {
                if let Err(e) = self.seek(current_position) {
                    warn!("Failed to restore position after reinit: {}", e);
                }
            }
        }

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

            self.reinit_and_reload()?;
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

        // Wake the broadcast thread from idle sleep immediately
        self.broadcast_wake.signal();

        Ok(())
    }

    pub fn pause(&self) -> AppResult<()> {
        info!("Pausing playback");
        lock_or_recover(&self.sink).pause();
        lock_or_recover(&self.playback).mark_paused();
        Ok(())
    }

    pub fn stop(&self) -> AppResult<()> {
        info!("Stopping playback");
        lock_or_recover(&self.sink).stop();
        lock_or_recover(&self.playback).clear();
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

    pub fn seek(&self, mut position: f64) -> AppResult<()> {
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

                    let file = File::open(&path)
                        .map_err(|e| AppError::NotFound(format!("Failed to open file: {}", e)))?;

                    let source = Decoder::new(BufReader::new(file))
                        .map_err(|e| AppError::Decode(format!("Failed to decode audio: {}", e)))?;

                    let effects_source = EffectsSource::new(
                        source,
                        self.effects_processor.clone(),
                        self.visualizer_buffer.clone(),
                        self.balance.clone(),
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
                            Err(e) => {
                                warn!("Forward seek after reload failed: {:?}", e);
                                // Seek failed — track will play from start. Reflect
                                // actual position (0) instead of the requested one.
                                position = 0.0;
                            }
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

    pub fn get_duration(&self) -> f64 {
        lock_or_recover(&self.playback).total_duration.as_secs_f64()
    }

    /// Snapshot of playback state captured under a single sink lock.
    ///
    /// The broadcast thread previously called `is_playing()`, `is_finished()`,
    /// `get_position()`, and `get_duration()` as four separate lock acquisitions.
    /// Between those calls the sink state could change (e.g. track ends between
    /// the `is_playing` and `is_finished` queries), causing missed or duplicate
    /// `track-ended` events. This method captures everything atomically.
    pub fn broadcast_snapshot(&self) -> BroadcastSnapshot {
        let sink = lock_or_recover(&self.sink);
        let pb = lock_or_recover(&self.playback);
        let is_paused = sink.is_paused();
        let is_empty = sink.empty();
        BroadcastSnapshot {
            is_playing: !is_paused && !is_empty,
            is_finished: is_empty,
            is_paused,
            position: pb.get_position(is_empty, is_paused),
            duration: pb.total_duration.as_secs_f64(),
        }
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

        self.reinit_and_reload()?;

        if was_playing {
            self.play()?;
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

        // Reuse the existing device mixer
        let device = lock_or_recover(&self.device);
        let generation = device.generation;
        let new_sink = Sink::connect_new(device.mixer()?);
        drop(device); // release device lock before acquiring sink lock

        // Wrap source with effects processor for EQ and visualizer (same as load())
        let effects_source = EffectsSource::new(
            source,
            self.effects_processor.clone(),
            self.visualizer_buffer.clone(),
            self.balance.clone(),
        );

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
        if let Some((new_sink, new_path, duration)) = taken {
            // Hold a single sink lock across stop → replace → play to prevent
            // another thread from observing a half-swapped state.
            {
                let mut sink = lock_or_recover(&self.sink);
                sink.stop();
                *sink = new_sink;
                sink.play();
            }

            {
                let mut pb = lock_or_recover(&self.playback);
                pb.current_path = Some(new_path);
                pb.start_time = Some(Instant::now());
                pb.seek_offset = Duration::ZERO;
                pb.paused_duration = Duration::ZERO;
                pb.pause_start = None;
                pb.total_duration = duration;
            }

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

        let was_playing = self.is_playing();

        match self.reinit_and_reload() {
            Ok(()) => {
                if was_playing {
                    if let Err(e) = self.play() {
                        warn!("Failed to resume playback after recovery: {}", e);
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
        self.visualizer_buffer.get_samples()
    }
}

#[cfg(test)]
mod tests {
    use super::BroadcastWake;
    use std::sync::{mpsc, Arc};
    use std::thread;
    use std::time::{Duration, Instant};

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
}
