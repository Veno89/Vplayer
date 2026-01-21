//! Audio playback module
//!
//! This module provides the main AudioPlayer struct and submodules for:
//! - visualizer: Audio visualization buffer
//! - effects: EQ and effects processing
//! - device: Device detection and management

pub mod visualizer;
pub mod effects;
pub mod device;

use rodio::{Decoder, OutputStream, Sink, Source};
use rodio::mixer::Mixer;
use std::fs::File;
use std::io::BufReader;
use log::{info, error, warn};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::error::{AppError, AppResult};
use crate::effects::{EffectsConfig, EffectsProcessor};
use visualizer::VisualizerBuffer;
use effects::EffectsSource;
pub use device::AudioDevice;

/// Threshold for considering a pause "long" - after this duration, we proactively
/// reinitialize the audio stream to prevent stale device issues
const LONG_PAUSE_THRESHOLD: Duration = Duration::from_secs(5 * 60); // 5 minutes

pub struct AudioPlayer {
    sink: Arc<Mutex<Sink>>,
    _stream: Arc<Mutex<Option<OutputStream>>>,
    mixer: Arc<Mutex<Option<Arc<Mixer>>>>,
    current_path: Arc<Mutex<Option<String>>>,
    start_time: Arc<Mutex<Option<Instant>>>,
    seek_offset: Arc<Mutex<Duration>>,
    pause_start: Arc<Mutex<Option<Instant>>>,
    paused_duration: Arc<Mutex<Duration>>,
    total_duration: Arc<Mutex<Duration>>,
    // For gapless playback
    preload_sink: Arc<Mutex<Option<Sink>>>,
    preload_path: Arc<Mutex<Option<String>>>,
    // Audio effects processor
    effects_processor: Arc<Mutex<EffectsProcessor>>,
    effects_enabled: Arc<Mutex<bool>>,
    // Track last successful operation for recovery
    last_volume: Arc<Mutex<f32>>,
    // ReplayGain: multiplier applied to volume (1.0 = no change)
    replaygain_multiplier: Arc<Mutex<f32>>,
    // Stereo balance: -1.0 = full left, 0.0 = center, 1.0 = full right
    balance: Arc<Mutex<f32>>,
    // Visualizer sample buffer
    visualizer_buffer: Arc<Mutex<VisualizerBuffer>>,
    // Track when the stream was last known to be active (for stale detection)
    last_active: Arc<Mutex<Instant>>,
    // Track the device name we're connected to (for detecting device changes)
    connected_device_name: Arc<Mutex<Option<String>>>,
}

// Manually implement Send and Sync for AudioPlayer
unsafe impl Send for AudioPlayer {}
unsafe impl Sync for AudioPlayer {}

impl AudioPlayer {
    pub fn new() -> AppResult<Self> {
        info!("Initializing audio player with high-quality settings");
        
        // Try to create output with optimal settings for quality
        let (stream, mixer, device_name) = device::create_high_quality_output_with_device_name()?;
        
        let sink = Sink::connect_new(&mixer);
        
        // Create visualizer buffer - 4096 samples is enough for FFT analysis at ~30fps
        let visualizer_buffer = Arc::new(Mutex::new(VisualizerBuffer::new(4096)));
        
        info!("Audio player initialized successfully on device: {:?}", device_name);
        Ok(Self {
            sink: Arc::new(Mutex::new(sink)),
            _stream: Arc::new(Mutex::new(Some(stream))),
            mixer: Arc::new(Mutex::new(Some(mixer))),
            current_path: Arc::new(Mutex::new(None)),
            start_time: Arc::new(Mutex::new(None)),
            seek_offset: Arc::new(Mutex::new(Duration::ZERO)),
            pause_start: Arc::new(Mutex::new(None)),
            paused_duration: Arc::new(Mutex::new(Duration::ZERO)),
            total_duration: Arc::new(Mutex::new(Duration::ZERO)),
            preload_sink: Arc::new(Mutex::new(None)),
            preload_path: Arc::new(Mutex::new(None)),
            effects_processor: Arc::new(Mutex::new(EffectsProcessor::new(44100, EffectsConfig::default()))),
            effects_enabled: Arc::new(Mutex::new(true)),
            last_volume: Arc::new(Mutex::new(1.0)),
            replaygain_multiplier: Arc::new(Mutex::new(1.0)),
            balance: Arc::new(Mutex::new(0.0)),
            visualizer_buffer,
            last_active: Arc::new(Mutex::new(Instant::now())),
            connected_device_name: Arc::new(Mutex::new(device_name)),
        })
    }
    
    /// Check if the default audio device has changed since we connected
    pub fn has_device_changed(&self) -> bool {
        let connected = self.connected_device_name.lock().unwrap().clone();
        device::has_device_changed(&connected)
    }
    
    /// Check if our connected audio device is still available
    pub fn is_device_available(&self) -> bool {
        device::is_device_available()
    }
    
    pub fn get_audio_devices() -> AppResult<Vec<AudioDevice>> {
        device::get_audio_devices()
    }
    
    pub fn load(&self, path: String) -> AppResult<()> {
        info!("Loading audio file: {}", path);
        let file = File::open(&path)
            .map_err(|e| {
                error!("Failed to open file {}: {}", path, e);
                AppError::NotFound(format!("Failed to open file {}: {}", path, e))
            })?;
        
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| {
                error!("Failed to decode audio: {}", e);
                AppError::Decode(format!("Failed to decode audio: {}", e))
            })?;
        
        // Get duration before consuming the source
        let duration = source.total_duration()
            .unwrap_or(Duration::ZERO);
        
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
        
        *self.current_path.lock().unwrap() = Some(path);
        *self.total_duration.lock().unwrap() = duration;
        *self.start_time.lock().unwrap() = None;
        *self.seek_offset.lock().unwrap() = Duration::ZERO;
        *self.paused_duration.lock().unwrap() = Duration::ZERO;
        *self.pause_start.lock().unwrap() = None;
        
        // Update last active time since we just loaded a track
        *self.last_active.lock().unwrap() = Instant::now();
        
        Ok(())
    }
    
    pub fn play(&self) -> AppResult<()> {
        info!("Starting playback");
        
        // Check if we've been paused for a long time - if so, reinitialize audio
        let pause_duration = self.pause_start.lock().unwrap()
            .map(|start| start.elapsed())
            .unwrap_or(Duration::ZERO);
        
        // Also check time since last active audio
        let time_since_active = self.last_active.lock().unwrap().elapsed();
        
        // Check if the audio device has changed
        let device_changed = self.has_device_changed();
        
        // Check if the device is even available
        let device_available = self.is_device_available();
        
        if !device_available {
            error!("No audio device available");
            return Err(AppError::Audio("No audio output device available. Please connect an audio device.".to_string()));
        }
        
        let needs_reinit = device_changed || 
                          pause_duration > LONG_PAUSE_THRESHOLD || 
                          time_since_active > LONG_PAUSE_THRESHOLD;
        
        if needs_reinit {
            if device_changed {
                info!("Audio device changed, reinitializing audio stream...");
            } else {
                info!("Long pause detected (paused: {:?}, inactive: {:?}), reinitializing audio stream...", 
                      pause_duration, time_since_active);
            }
            
            // Get current state for recovery
            let current_path = self.current_path.lock().unwrap().clone();
            let current_position = self.get_position();
            let volume = *self.last_volume.lock().unwrap();
            
            // Reinitialize audio output
            match device::create_high_quality_output_with_device_name() {
                Ok((new_stream, new_mixer, new_device_name)) => {
                    info!("Audio stream reinitialized successfully on device: {:?}", new_device_name);
                    
                    // Create new sink
                    let new_sink = Sink::connect_new(&new_mixer);
                    new_sink.set_volume(volume);
                    
                    // Replace stream and mixer
                    *self._stream.lock().unwrap() = Some(new_stream);
                    *self.mixer.lock().unwrap() = Some(new_mixer);
                    
                    // Update connected device name
                    *self.connected_device_name.lock().unwrap() = new_device_name;
                    
                    // Replace sink
                    {
                        let mut sink = self.sink.lock().unwrap();
                        *sink = new_sink;
                    }
                    
                    // Reload the track if there was one
                    if let Some(path) = current_path {
                        info!("Reloading track after audio reinit: {}", path);
                        
                        if let Err(e) = self.load(path.clone()) {
                            error!("Failed to reload track after reinit: {}", e);
                            return Err(e);
                        }
                        
                        // Restore position (but not if we were at the start)
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
        }
        
        // Now actually play
        let sink = self.sink.lock().unwrap();
        sink.play();
        
        // Update last active time
        *self.last_active.lock().unwrap() = Instant::now();
        
        // Handle resume from pause
        if let Some(pause_start) = self.pause_start.lock().unwrap().take() {
            let pause_duration = pause_start.elapsed();
            *self.paused_duration.lock().unwrap() += pause_duration;
            info!("Resumed from pause (paused for {:?})", pause_duration);
        } else {
            // Starting fresh
            *self.start_time.lock().unwrap() = Some(Instant::now());
            info!("Started fresh playback");
        }
        
        Ok(())
    }
    
    pub fn pause(&self) -> AppResult<()> {
        info!("Pausing playback");
        let sink = self.sink.lock().unwrap();
        sink.pause();
        *self.pause_start.lock().unwrap() = Some(Instant::now());
        Ok(())
    }
    
    pub fn stop(&self) -> AppResult<()> {
        info!("Stopping playback");
        let sink = self.sink.lock().unwrap();
        sink.stop();
        *self.current_path.lock().unwrap() = None;
        *self.start_time.lock().unwrap() = None;
        *self.seek_offset.lock().unwrap() = Duration::ZERO;
        *self.paused_duration.lock().unwrap() = Duration::ZERO;
        *self.pause_start.lock().unwrap() = None;
        Ok(())
    }
    
    pub fn set_volume(&self, volume: f32) -> AppResult<()> {
        let sink = self.sink.lock().unwrap();
        let clamped_volume = volume.max(0.0).min(1.0);
        *self.last_volume.lock().unwrap() = clamped_volume;
        
        // Apply ReplayGain multiplier to the volume
        let rg_multiplier = *self.replaygain_multiplier.lock().unwrap();
        let effective_volume = (clamped_volume * rg_multiplier).max(0.0).min(1.0);
        sink.set_volume(effective_volume);
        Ok(())
    }
    
    /// Set the ReplayGain adjustment in dB
    pub fn set_replaygain(&self, gain_db: f32, preamp_db: f32) -> AppResult<()> {
        let total_gain_db = gain_db + preamp_db;
        let multiplier = 10_f32.powf(total_gain_db / 20.0);
        let clamped_multiplier = multiplier.max(0.1).min(3.0);
        
        info!("Setting ReplayGain: {}dB + {}dB preamp = {}dB (multiplier: {:.3})", 
              gain_db, preamp_db, total_gain_db, clamped_multiplier);
        
        *self.replaygain_multiplier.lock().unwrap() = clamped_multiplier;
        
        let current_volume = *self.last_volume.lock().unwrap();
        self.set_volume(current_volume)
    }
    
    /// Clear ReplayGain adjustment
    pub fn clear_replaygain(&self) {
        *self.replaygain_multiplier.lock().unwrap() = 1.0;
        let current_volume = *self.last_volume.lock().unwrap();
        let _ = self.set_volume(current_volume);
    }
    
    /// Get current ReplayGain multiplier
    pub fn get_replaygain_multiplier(&self) -> f32 {
        *self.replaygain_multiplier.lock().unwrap()
    }
    
    /// Set stereo balance (-1.0 = full left, 0.0 = center, 1.0 = full right)
    pub fn set_balance(&self, balance: f32) -> AppResult<()> {
        let clamped = balance.clamp(-1.0, 1.0);
        *self.balance.lock().unwrap() = clamped;
        info!("Balance set to: {:.2}", clamped);
        Ok(())
    }
    
    /// Get current stereo balance
    pub fn get_balance(&self) -> f32 {
        *self.balance.lock().unwrap()
    }
    
    pub fn seek(&self, position: f64) -> AppResult<()> {
        info!("Seeking to position: {}s", position);
        
        let current_pos = self.get_position();
        info!("Current position before seek: {}s, target: {}s", current_pos, position);
        
        let sink = self.sink.lock().unwrap();
        let was_playing = !sink.is_paused();
        let current_volume = sink.volume();
        
        match sink.try_seek(Duration::from_secs_f64(position)) {
            Ok(_) => {
                info!("Seek successful to {}s", position);
                let was_paused = sink.is_paused();
                
                *self.start_time.lock().unwrap() = Some(Instant::now());
                *self.seek_offset.lock().unwrap() = Duration::from_secs_f64(position);
                *self.paused_duration.lock().unwrap() = Duration::ZERO;
                
                if was_paused {
                    *self.pause_start.lock().unwrap() = Some(Instant::now());
                } else {
                    *self.pause_start.lock().unwrap() = None;
                }
                
                Ok(())
            },
            Err(e) => {
                warn!("Direct seek failed: {:?}, attempting reload method", e);
                
                let path = self.current_path.lock().unwrap().clone();
                let total_dur = *self.total_duration.lock().unwrap();
                
                if let Some(path) = path {
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
                            Ok(_) => info!("Forward seek after reload successful to {}s", position),
                            Err(e) => warn!("Forward seek after reload failed: {:?}", e),
                        }
                    }
                    
                    *self.total_duration.lock().unwrap() = total_dur;
                    *self.start_time.lock().unwrap() = Some(Instant::now());
                    *self.seek_offset.lock().unwrap() = Duration::from_secs_f64(position);
                    *self.paused_duration.lock().unwrap() = Duration::ZERO;
                    
                    if was_playing {
                        sink.play();
                        *self.pause_start.lock().unwrap() = None;
                    } else {
                        sink.pause();
                        *self.pause_start.lock().unwrap() = Some(Instant::now());
                    }
                    
                    info!("Backward seek completed via reload to {}s", position);
                    Ok(())
                } else {
                    Err(AppError::Audio("No file loaded for seeking".to_string()))
                }
            }
        }
    }
    
    pub fn get_position(&self) -> f64 {
        let sink = self.sink.lock().unwrap();
        
        if let Some(start) = *self.start_time.lock().unwrap() {
            let elapsed = start.elapsed();
            let paused = *self.paused_duration.lock().unwrap();
            let offset = *self.seek_offset.lock().unwrap();
            
            let additional_pause = if sink.is_paused() {
                if let Some(pause_start) = *self.pause_start.lock().unwrap() {
                    pause_start.elapsed()
                } else {
                    Duration::ZERO
                }
            } else {
                Duration::ZERO
            };
            
            let playing_time = elapsed.saturating_sub(paused + additional_pause);
            (offset + playing_time).as_secs_f64()
        } else {
            0.0
        }
    }
    
    pub fn is_playing(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        let is_paused = sink.is_paused();
        let is_empty = sink.empty();
        
        if is_empty && !is_paused {
            if self.start_time.lock().unwrap().is_some() && 
               self.current_path.lock().unwrap().is_some() {
                warn!("Audio sink unexpectedly empty while track should be playing");
            }
        }
        
        !is_paused && !is_empty
    }
    
    pub fn is_finished(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        sink.empty()
    }
    
    #[allow(dead_code)]
    pub fn get_current_path(&self) -> Option<String> {
        self.current_path.lock().unwrap().clone()
    }
    
    pub fn get_duration(&self) -> f64 {
        self.total_duration.lock().unwrap().as_secs_f64()
    }
    
    pub fn set_output_device(&self, device_name: &str) -> AppResult<()> {
        let host = rodio::cpal::default_host();
        use rodio::cpal::traits::HostTrait;
        
        let mut output_devices = host.output_devices()
            .map_err(|e| AppError::Audio(format!("Failed to enumerate devices: {}", e)))?;
        
        let _device = output_devices
            .find(|d| {
                use rodio::DeviceTrait;
                d.name().ok().as_deref() == Some(device_name)
            })
            .ok_or_else(|| AppError::NotFound(format!("Device '{}' not found", device_name)))?;
        
        let was_playing = self.is_playing();
        let current_position = self.get_position();
        let current_volume = {
            let sink = self.sink.lock().unwrap();
            sink.volume()
        };
        let current_path = self.current_path.lock().unwrap().clone();
        
        let (new_stream, new_mixer, new_device_name) = device::create_high_quality_output_with_device_name()?;
        
        let new_sink = Sink::connect_new(&new_mixer);
        new_sink.set_volume(current_volume);
        
        *self._stream.lock().unwrap() = Some(new_stream);
        *self.mixer.lock().unwrap() = Some(new_mixer);
        *self.connected_device_name.lock().unwrap() = new_device_name;
        
        {
            let mut sink = self.sink.lock().unwrap();
            *sink = new_sink;
        }
        
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
    
    // Gapless playback support
    pub fn preload(&self, path: String) -> AppResult<()> {
        info!("Preloading audio file: {}", path);
        
        let file = File::open(&path)
            .map_err(|e| AppError::NotFound(format!("Failed to open file {}: {}", path, e)))?;
        
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| AppError::Decode(format!("Failed to decode audio: {}", e)))?;
        
        let (_, new_mixer, _) = device::create_high_quality_output_with_device_name()?;
        
        let new_sink = Sink::connect_new(&new_mixer);
        
        let current_volume = {
            let sink = self.sink.lock().unwrap();
            sink.volume()
        };
        new_sink.set_volume(current_volume);
        
        new_sink.append(source);
        new_sink.pause();
        
        *self.preload_sink.lock().unwrap() = Some(new_sink);
        *self.preload_path.lock().unwrap() = Some(path);
        
        info!("Audio file preloaded successfully");
        Ok(())
    }
    
    pub fn swap_to_preloaded(&self) -> AppResult<()> {
        info!("Swapping to preloaded track");
        
        let mut preload_sink = self.preload_sink.lock().unwrap();
        let mut preload_path = self.preload_path.lock().unwrap();
        
        if let (Some(new_sink), Some(new_path)) = (preload_sink.take(), preload_path.take()) {
            {
                let sink = self.sink.lock().unwrap();
                sink.stop();
            }
            
            {
                let mut sink = self.sink.lock().unwrap();
                *sink = new_sink;
            }
            
            *self.current_path.lock().unwrap() = Some(new_path);
            *self.start_time.lock().unwrap() = Some(Instant::now());
            *self.seek_offset.lock().unwrap() = Duration::ZERO;
            *self.paused_duration.lock().unwrap() = Duration::ZERO;
            *self.pause_start.lock().unwrap() = None;
            
            let sink = self.sink.lock().unwrap();
            sink.play();
            
            info!("Successfully swapped to preloaded track");
            Ok(())
        } else {
            Err(AppError::Audio("No preloaded track available".to_string()))
        }
    }
    
    pub fn clear_preload(&self) {
        *self.preload_sink.lock().unwrap() = None;
        *self.preload_path.lock().unwrap() = None;
    }
    
    pub fn has_preloaded(&self) -> bool {
        self.preload_sink.lock().unwrap().is_some()
    }
    
    /// Set audio effects configuration
    pub fn set_effects(&self, config: EffectsConfig) {
        self.effects_processor.lock().unwrap().update_config(config);
    }
    
    /// Get current effects configuration
    pub fn get_effects(&self) -> EffectsConfig {
        self.effects_processor.lock().unwrap().get_config()
    }
    
    /// Enable or disable audio effects
    pub fn set_effects_enabled(&self, enabled: bool) {
        *self.effects_enabled.lock().unwrap() = enabled;
    }
    
    /// Check if effects are enabled
    pub fn is_effects_enabled(&self) -> bool {
        *self.effects_enabled.lock().unwrap()
    }
    
    /// Recover audio system after device disconnection or long idle
    pub fn recover(&self) -> AppResult<bool> {
        info!("Attempting audio system recovery...");
        
        if !self.is_device_available() {
            warn!("No audio device available for recovery");
            return Ok(false);
        }
        
        let current_path = self.current_path.lock().unwrap().clone();
        let current_position = self.get_position();
        let was_playing = self.is_playing();
        let volume = *self.last_volume.lock().unwrap();
        
        match device::create_high_quality_output_with_device_name() {
            Ok((new_stream, new_mixer, new_device_name)) => {
                info!("Audio output recreated successfully on device: {:?}", new_device_name);
                
                let new_sink = Sink::connect_new(&new_mixer);
                new_sink.set_volume(volume);
                
                *self._stream.lock().unwrap() = Some(new_stream);
                *self.mixer.lock().unwrap() = Some(new_mixer);
                *self.connected_device_name.lock().unwrap() = new_device_name;
                
                {
                    let mut sink = self.sink.lock().unwrap();
                    *sink = new_sink;
                }
                
                *self.last_active.lock().unwrap() = Instant::now();
                
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
    
    /// Check if the audio system is healthy
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
    
    /// Check how long the audio has been inactive/paused
    pub fn get_inactive_duration(&self) -> f64 {
        let pause_duration = self.pause_start.lock().unwrap()
            .map(|start| start.elapsed())
            .unwrap_or(Duration::ZERO);
        
        let time_since_active = self.last_active.lock().unwrap().elapsed();
        
        pause_duration.max(time_since_active).as_secs_f64()
    }
    
    /// Check if audio needs reinitialization
    pub fn needs_reinit(&self) -> bool {
        if self.has_device_changed() {
            return true;
        }
        
        let pause_duration = self.pause_start.lock().unwrap()
            .map(|start| start.elapsed())
            .unwrap_or(Duration::ZERO);
        
        let time_since_active = self.last_active.lock().unwrap().elapsed();
        
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
