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
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::error::{AppError, AppResult};
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
        })
    }

    // ── Device queries ──────────────────────────────────────────────

    pub fn has_device_changed(&self) -> bool {
        self.device.lock().unwrap().has_device_changed()
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

        let sink = self.sink.lock().unwrap();
        sink.clear();
        sink.append(effects_source);
        sink.pause();

        self.playback.lock().unwrap().reset_for_load(path, duration);
        self.device.lock().unwrap().update_active();

        Ok(())
    }

    // ── Playback control ────────────────────────────────────────────

    pub fn play(&self) -> AppResult<()> {
        info!("Starting playback");

        let pause_duration = {
            let pb = self.playback.lock().unwrap();
            pb.pause_start.map(|s| s.elapsed()).unwrap_or(Duration::ZERO)
        };

        let time_since_active = self.device.lock().unwrap().last_active.elapsed();
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
            let sink = self.sink.lock().unwrap();
            let pb = self.playback.lock().unwrap();
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

            // Get current state for recovery
            let current_path = self.playback.lock().unwrap().current_path.clone();
            let current_position = self.get_position();
            let _volume = self.volume_mgr.lock().unwrap().last_volume;

            // Reinitialize audio output
            match device::create_high_quality_output_with_device_name() {
                Ok((new_stream, new_mixer, new_device_name)) => {
                    info!("Audio stream reinitialized on device: {:?}", new_device_name);

                    // Use connect_new
                    let new_sink = Sink::connect_new(&new_mixer);
                    new_sink.set_volume(self.volume_mgr.lock().unwrap().effective_volume());

                    self.device
                        .lock()
                        .unwrap()
                        .replace(new_stream, new_mixer, new_device_name);
                    *self.sink.lock().unwrap() = new_sink;

                    // Reload the track if there was one
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
                }
                Err(e) => {
                    error!("Failed to reinitialize audio: {}", e);
                    return Err(e);
                }
            }
        } else if needs_reload {
            // Sink is empty but we have a track - reload it
            info!("Sink is empty but track is loaded - attempting reload/resume");
            let current_path = self.playback.lock().unwrap().current_path.clone();
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
        let sink = self.sink.lock().unwrap();
        sink.play();

        self.device.lock().unwrap().update_active();

        let mut pb = self.playback.lock().unwrap();
        if let Some(pause_dur) = pb.mark_playing() {
            info!("Resumed from pause (paused for {:?})", pause_dur);
        } else {
            info!("Started fresh playback");
        }

        Ok(())
    }

    pub fn pause(&self) -> AppResult<()> {
        info!("Pausing playback");
        self.sink.lock().unwrap().pause();
        self.playback.lock().unwrap().mark_paused();
        Ok(())
    }

    pub fn stop(&self) -> AppResult<()> {
        info!("Stopping playback");
        self.sink.lock().unwrap().stop();
        self.playback.lock().unwrap().clear();
        Ok(())
    }

    // ── Volume ──────────────────────────────────────────────────────

    pub fn set_volume(&self, volume: f32) -> AppResult<()> {
        let effective = self.volume_mgr.lock().unwrap().set_volume(volume);
        self.sink.lock().unwrap().set_volume(effective);
        Ok(())
    }

    pub fn set_replaygain(&self, gain_db: f32, preamp_db: f32) -> AppResult<()> {
        let effective = self.volume_mgr.lock().unwrap().set_replaygain(gain_db, preamp_db);
        self.sink.lock().unwrap().set_volume(effective);
        Ok(())
    }

    pub fn clear_replaygain(&self) {
        let effective = self.volume_mgr.lock().unwrap().clear_replaygain();
        self.sink.lock().unwrap().set_volume(effective);
    }

    pub fn get_replaygain_multiplier(&self) -> f32 {
        self.volume_mgr.lock().unwrap().replaygain_multiplier
    }

    pub fn set_balance(&self, balance: f32) -> AppResult<()> {
        self.volume_mgr.lock().unwrap().set_balance(balance);
        Ok(())
    }

    pub fn get_balance(&self) -> f32 {
        self.volume_mgr.lock().unwrap().balance
    }

    // ── Seeking ─────────────────────────────────────────────────────

    pub fn seek(&self, position: f64) -> AppResult<()> {
        info!("Seeking to position: {}s", position);

        let current_pos = self.get_position();
        info!(
            "Current position before seek: {}s, target: {}s",
            current_pos, position
        );

        let sink = self.sink.lock().unwrap();
        let was_playing = !sink.is_paused();
        let current_volume = sink.volume();

        match sink.try_seek(Duration::from_secs_f64(position)) {
            Ok(_) => {
                info!("Seek successful to {}s", position);
                let is_paused = sink.is_paused();
                self.playback.lock().unwrap().mark_seeked(position, is_paused);
                Ok(())
            }
            Err(e) => {
                warn!("Direct seek failed: {:?}, attempting reload method", e);

                let path = self.playback.lock().unwrap().current_path.clone();
                let total_dur = self.playback.lock().unwrap().total_duration;

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
                    );

                    let sink = self.sink.lock().unwrap();
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
                        let mut pb = self.playback.lock().unwrap();
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
        let sink = self.sink.lock().unwrap();
        let pb = self.playback.lock().unwrap();
        pb.get_position(sink.empty(), sink.is_paused())
    }

    pub fn is_playing(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        !sink.is_paused() && !sink.empty()
    }

    pub fn is_finished(&self) -> bool {
        self.sink.lock().unwrap().empty()
    }

    #[allow(dead_code)]
    pub fn get_current_path(&self) -> Option<String> {
        self.playback.lock().unwrap().current_path.clone()
    }

    pub fn get_duration(&self) -> f64 {
        self.playback.lock().unwrap().total_duration.as_secs_f64()
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
        let current_volume = self.sink.lock().unwrap().volume();
        let current_path = self.playback.lock().unwrap().current_path.clone();

        let (new_stream, new_mixer, new_device_name) =
            device::create_high_quality_output_with_device_name()?;

        let new_sink = Sink::connect_new(&new_mixer);
        new_sink.set_volume(current_volume);

        self.device
            .lock()
            .unwrap()
            .replace(new_stream, new_mixer, new_device_name);
        *self.sink.lock().unwrap() = new_sink;

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

        // Reuse the existing device mixer
        let device = self.device.lock().unwrap();
        let new_sink = Sink::connect_new(device.mixer());
        
        let current_volume = self.sink.lock().unwrap().volume();
        new_sink.set_volume(current_volume);
        new_sink.append(source);
        new_sink.pause();

        self.preload.lock().unwrap().set(new_sink, path);
        info!("Audio file preloaded successfully (reusing existing output)");
        Ok(())
    }

    pub fn swap_to_preloaded(&self) -> AppResult<()> {
        info!("Swapping to preloaded track");

        let taken = self.preload.lock().unwrap().take();
        if let Some((new_sink, new_path)) = taken {
            self.sink.lock().unwrap().stop();
            *self.sink.lock().unwrap() = new_sink;

            {
                let mut pb = self.playback.lock().unwrap();
                pb.current_path = Some(new_path);
                pb.start_time = Some(Instant::now());
                pb.seek_offset = Duration::ZERO;
                pb.paused_duration = Duration::ZERO;
                pb.pause_start = None;
            }

            self.sink.lock().unwrap().play();
            info!("Successfully swapped to preloaded track");
            Ok(())
        } else {
            Err(AppError::Audio(
                "No preloaded track available".to_string(),
            ))
        }
    }

    pub fn clear_preload(&self) {
        self.preload.lock().unwrap().clear();
    }

    pub fn has_preloaded(&self) -> bool {
        self.preload.lock().unwrap().has_preloaded()
    }

    // ── Effects ─────────────────────────────────────────────────────

    pub fn set_effects(&self, config: EffectsConfig) {
        // Apply tempo/speed at the Sink level (changes playback rate)
        let tempo = config.tempo.clamp(0.5, 2.0);
        if let Ok(sink) = self.sink.lock() {
            sink.set_speed(tempo);
        }
        self.effects_processor.lock().unwrap().update_config(config);
    }

    pub fn get_effects(&self) -> EffectsConfig {
        self.effects_processor.lock().unwrap().get_config()
    }

    pub fn set_effects_enabled(&self, enabled: bool) {
        *self.effects_enabled.lock().unwrap() = enabled;
    }

    pub fn is_effects_enabled(&self) -> bool {
        *self.effects_enabled.lock().unwrap()
    }

    // ── Recovery & health ───────────────────────────────────────────

    pub fn recover(&self) -> AppResult<bool> {
        info!("Attempting audio system recovery...");

        if !self.is_device_available() {
            warn!("No audio device available for recovery");
            return Ok(false);
        }

        let current_path = self.playback.lock().unwrap().current_path.clone();
        let current_position = self.get_position();
        let was_playing = self.is_playing();

        match device::create_high_quality_output_with_device_name() {
            Ok((new_stream, new_mixer, new_device_name)) => {
                info!("Audio output recreated on device: {:?}", new_device_name);

                let new_sink = Sink::connect_new(&new_mixer);
                new_sink.set_volume(self.volume_mgr.lock().unwrap().effective_volume());

                self.device
                    .lock()
                    .unwrap()
                    .replace(new_stream, new_mixer, new_device_name);
                *self.sink.lock().unwrap() = new_sink;

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
            let pb = self.playback.lock().unwrap();
            pb.pause_start
                .map(|s| s.elapsed())
                .unwrap_or(Duration::ZERO)
        };

        let time_since_active = self.device.lock().unwrap().last_active.elapsed();
        pause_duration.max(time_since_active).as_secs_f64()
    }

    pub fn needs_reinit(&self) -> bool {
        if self.has_device_changed() {
            return true;
        }

        let pause_duration = {
            let pb = self.playback.lock().unwrap();
            pb.pause_start
                .map(|s| s.elapsed())
                .unwrap_or(Duration::ZERO)
        };

        let time_since_active = self.device.lock().unwrap().last_active.elapsed();
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
