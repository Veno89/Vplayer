use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source, DeviceTrait};
use rodio::source::SeekError;
use rodio::cpal::traits::HostTrait;
use rodio::cpal::{SampleFormat, FromSample};
use rodio::mixer::Mixer;
use std::fs::File;
use std::io::BufReader;
use log::{info, error, warn};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::collections::VecDeque;
use serde::Serialize;
use crate::error::{AppError, AppResult};
use crate::effects::{EffectsConfig, EffectsProcessor};

/// Ring buffer for visualizer samples - shared between audio thread and main thread
pub struct VisualizerBuffer {
    samples: VecDeque<f32>,
    capacity: usize,
}

impl VisualizerBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            samples: VecDeque::with_capacity(capacity),
            capacity,
        }
    }
    
    /// Add a sample to the buffer (called from audio thread)
    pub fn push(&mut self, sample: f32) {
        if self.samples.len() >= self.capacity {
            self.samples.pop_front();
        }
        self.samples.push_back(sample);
    }
    
    /// Get a copy of current samples for visualization
    pub fn get_samples(&self) -> Vec<f32> {
        self.samples.iter().copied().collect()
    }
    
    /// Clear the buffer
    pub fn clear(&mut self) {
        self.samples.clear();
    }
}

/// EffectsSource wraps a Source and applies audio effects (EQ, etc.) to each sample
struct EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    input: I,
    processor: Arc<Mutex<EffectsProcessor>>,
    visualizer_buffer: Arc<Mutex<VisualizerBuffer>>,
}

impl<I> Iterator for EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        self.input.next().map(|sample| {
            let mut processor = self.processor.lock().unwrap();
            // Convert sample to f32, process, then return
            let sample_f32: f32 = f32::from_sample_(sample);
            let processed = processor.process(sample_f32);
            
            // Send sample to visualizer buffer (don't block if lock fails)
            if let Ok(mut buffer) = self.visualizer_buffer.try_lock() {
                buffer.push(processed);
            }
            
            processed
        })
    }
}

impl<I> Source for EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    fn current_span_len(&self) -> Option<usize> {
        self.input.current_span_len()
    }

    fn channels(&self) -> u16 {
        self.input.channels()
    }

    fn sample_rate(&self) -> u32 {
        self.input.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.input.total_duration()
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.input.try_seek(pos)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

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
    // Visualizer sample buffer
    visualizer_buffer: Arc<Mutex<VisualizerBuffer>>,
}

// Manually implement Send and Sync for AudioPlayer
unsafe impl Send for AudioPlayer {}
unsafe impl Sync for AudioPlayer {}

impl AudioPlayer {
    pub fn new() -> AppResult<Self> {
        info!("Initializing audio player with high-quality settings");
        
        // Try to create output with optimal settings for quality
        let (stream, mixer) = Self::create_high_quality_output()?;
        
        let sink = Sink::connect_new(&mixer);
        
        // Create visualizer buffer - 4096 samples is enough for FFT analysis at ~30fps
        let visualizer_buffer = Arc::new(Mutex::new(VisualizerBuffer::new(4096)));
        
        info!("Audio player initialized successfully");
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
            visualizer_buffer,
        })
    }
    
    fn create_high_quality_output() -> AppResult<(OutputStream, Arc<Mixer>)> {
        let host = rodio::cpal::default_host();
        let device = host.default_output_device()
            .ok_or_else(|| AppError::Audio("No output device available".to_string()))?;
        
        // Try to get supported configs
        let supported_configs = device.supported_output_configs()
            .map_err(|e| AppError::Audio(format!("Failed to get supported configs: {}", e)))?;
        
        // Find the best config: prefer 32-bit float, highest sample rate
        let best_config = supported_configs
            .filter(|config| config.sample_format() == SampleFormat::F32)
            .max_by_key(|config| config.max_sample_rate().0)
            .or_else(|| {
                // Fallback to any config if F32 not available
                device.supported_output_configs()
                    .ok()
                    .and_then(|mut configs| configs.next())
            })
            .ok_or_else(|| AppError::Audio("No supported audio config found".to_string()))?;
        
        // Use maximum sample rate supported
        let sample_rate = best_config.max_sample_rate();
        let config_with_rate = best_config.with_sample_rate(sample_rate);
        
        info!("Using audio config: sample_rate={:?}, channels={}, format={:?}", 
              config_with_rate.sample_rate(), 
              config_with_rate.channels(),
              config_with_rate.sample_format());
        
        // Create output stream
        let stream = OutputStreamBuilder::open_default_stream()
            .map_err(|e| AppError::Audio(format!("Failed to create audio output: {}", e)))?;
        let mixer = Arc::new(stream.mixer().clone());
        
        Ok((stream, mixer))
    }
    
    pub fn get_audio_devices() -> AppResult<Vec<AudioDevice>> {
        let host = rodio::cpal::default_host();
        let mut devices = Vec::new();
        
        // Get default device name
        let default_device = host.default_output_device();
        let default_name = default_device
            .as_ref()
            .and_then(|d| d.name().ok())
            .unwrap_or_else(|| "Default".to_string());
        
        // Enumerate all output devices
        let output_devices = host.output_devices()
            .map_err(|e| AppError::Audio(format!("Failed to enumerate devices: {}", e)))?;
        
        for device in output_devices {
            if let Ok(name) = device.name() {
                let is_default = name == default_name;
                devices.push(AudioDevice {
                    name,
                    is_default,
                });
            }
        }
        
        // If no devices found, add default
        if devices.is_empty() {
            devices.push(AudioDevice {
                name: default_name,
                is_default: true,
            });
        }
        
        Ok(devices)
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
        let effects_source = EffectsSource {
            input: source,
            processor: self.effects_processor.clone(),
            visualizer_buffer: self.visualizer_buffer.clone(),
        };
        
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
        
        Ok(())
    }
    
    pub fn play(&self) -> AppResult<()> {
        info!("Starting playback");
        let sink = self.sink.lock().unwrap();
        sink.play();
        
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
        sink.set_volume(clamped_volume);
        *self.last_volume.lock().unwrap() = clamped_volume;
        Ok(())
    }
    
    pub fn seek(&self, position: f64) -> AppResult<()> {
        info!("Seeking to position: {}s", position);
        
        // Get current state before locking sink
        let current_pos = self.get_position();
        info!("Current position before seek: {}s, target: {}s", current_pos, position);
        
        let sink = self.sink.lock().unwrap();
        let was_playing = !sink.is_paused();
        let current_volume = sink.volume();
        
        // Try to seek - rodio 0.19 supports this
        match sink.try_seek(Duration::from_secs_f64(position)) {
            Ok(_) => {
                info!("Seek successful to {}s", position);
                // Update timing: reset start time and adjust offset
                let was_paused = sink.is_paused();
                
                // Reset timing state
                *self.start_time.lock().unwrap() = Some(Instant::now());
                *self.seek_offset.lock().unwrap() = Duration::from_secs_f64(position);
                *self.paused_duration.lock().unwrap() = Duration::ZERO;
                
                // If paused, mark pause start
                if was_paused {
                    *self.pause_start.lock().unwrap() = Some(Instant::now());
                } else {
                    *self.pause_start.lock().unwrap() = None;
                }
                
                Ok(())
            },
            Err(e) => {
                // Direct seek failed (likely backward seek) - reload and seek forward
                warn!("Direct seek failed: {:?}, attempting reload method", e);
                
                // Get the current file path
                let path = self.current_path.lock().unwrap().clone();
                let total_dur = *self.total_duration.lock().unwrap();
                
                if let Some(path) = path {
                    // Drop the sink lock before reloading
                    drop(sink);
                    
                    info!("Reloading file for backward seek: {}", path);
                    
                    // Reload the file
                    let file = File::open(&path)
                        .map_err(|e| AppError::NotFound(format!("Failed to open file: {}", e)))?;
                    
                    let source = Decoder::new(BufReader::new(file))
                        .map_err(|e| AppError::Decode(format!("Failed to decode audio: {}", e)))?;
                    
                    // Wrap source with effects processor for EQ and visualizer
                    let effects_source = EffectsSource {
                        input: source,
                        processor: self.effects_processor.clone(),
                        visualizer_buffer: self.visualizer_buffer.clone(),
                    };
                    
                    // Get a new lock on sink
                    let sink = self.sink.lock().unwrap();
                    sink.clear();
                    sink.append(effects_source);
                    sink.set_volume(current_volume);
                    
                    // Now seek forward to the target position
                    if position > 0.0 {
                        match sink.try_seek(Duration::from_secs_f64(position)) {
                            Ok(_) => info!("Forward seek after reload successful to {}s", position),
                            Err(e) => warn!("Forward seek after reload failed: {:?}", e),
                        }
                    }
                    
                    // Update state
                    *self.total_duration.lock().unwrap() = total_dur;
                    *self.start_time.lock().unwrap() = Some(Instant::now());
                    *self.seek_offset.lock().unwrap() = Duration::from_secs_f64(position);
                    *self.paused_duration.lock().unwrap() = Duration::ZERO;
                    
                    // Resume playing if it was playing
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
            
            // If currently paused, don't count time since pause started
            let additional_pause = if sink.is_paused() {
                if let Some(pause_start) = *self.pause_start.lock().unwrap() {
                    pause_start.elapsed()
                } else {
                    Duration::ZERO
                }
            } else {
                Duration::ZERO
            };
            
            // Position = offset (from seeks) + playing time (elapsed - paused time)
            let playing_time = elapsed.saturating_sub(paused + additional_pause);
            (offset + playing_time).as_secs_f64()
        } else {
            0.0
        }
    }
    
    pub fn is_playing(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        !sink.is_paused() && !sink.empty()
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
        
        // Find the device by name
        let mut output_devices = host.output_devices()
            .map_err(|e| AppError::Audio(format!("Failed to enumerate devices: {}", e)))?;
        
        let _device = output_devices
            .find(|d| d.name().ok().as_deref() == Some(device_name))
            .ok_or_else(|| AppError::NotFound(format!("Device '{}' not found", device_name)))?;
        
        // Get current state before recreating
        let was_playing = self.is_playing();
        let current_position = self.get_position();
        let current_volume = {
            let sink = self.sink.lock().unwrap();
            sink.volume()
        };
        let current_path = self.current_path.lock().unwrap().clone();
        
        // Create new stream and sink with the selected device
        let _new_stream = OutputStreamBuilder::open_default_stream()
            .map_err(|e| AppError::Audio(format!("Failed to create output stream: {}", e)))?;
        let new_mixer = _new_stream.mixer().clone();
        
        let new_sink = Sink::connect_new(&new_mixer);
        
        new_sink.set_volume(current_volume);
        
        // Replace the old sink and stream
        {
            let mut sink = self.sink.lock().unwrap();
            *sink = new_sink;
        }
        
        // Reload current track if there was one
        if let Some(path) = current_path {
            self.load(path)?;
            
            // Restore position if there was one
            if current_position > 0.0 {
                self.seek(current_position)?;
            }
            
            // Resume playing if it was playing
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
        
        // Get stream handle from current sink
        let host = rodio::cpal::default_host();
        let _device = host.default_output_device()
            .ok_or_else(|| AppError::Audio("No output device available".to_string()))?;
        
        let _stream = OutputStreamBuilder::open_default_stream()
            .map_err(|e| AppError::Audio(format!("Failed to create stream: {}", e)))?;
        let mixer = _stream.mixer().clone();
        
        let new_sink = Sink::connect_new(&mixer);
        
        // Copy volume from current sink
        let current_volume = {
            let sink = self.sink.lock().unwrap();
            sink.volume()
        };
        new_sink.set_volume(current_volume);
        
        new_sink.append(source);
        new_sink.pause(); // Keep paused until we swap
        
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
            // Stop current sink
            {
                let sink = self.sink.lock().unwrap();
                sink.stop();
            }
            
            // Swap sinks
            {
                let mut sink = self.sink.lock().unwrap();
                *sink = new_sink;
            }
            
            // Update state
            *self.current_path.lock().unwrap() = Some(new_path);
            *self.start_time.lock().unwrap() = Some(Instant::now());
            *self.seek_offset.lock().unwrap() = Duration::ZERO;
            *self.paused_duration.lock().unwrap() = Duration::ZERO;
            *self.pause_start.lock().unwrap() = None;
            
            // Start playing
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
    /// Returns true if recovery was successful
    pub fn recover(&self) -> AppResult<bool> {
        info!("Attempting audio system recovery...");
        
        // Save current state
        let current_path = self.current_path.lock().unwrap().clone();
        let current_position = self.get_position();
        let was_playing = self.is_playing();
        let volume = *self.last_volume.lock().unwrap();
        
        // Try to recreate the audio output
        match Self::create_high_quality_output() {
            Ok((new_stream, new_mixer)) => {
                info!("Audio output recreated successfully");
                
                // Create new sink
                let new_sink = Sink::connect_new(&new_mixer);
                new_sink.set_volume(volume);
                
                // Replace stream and mixer
                *self._stream.lock().unwrap() = Some(new_stream);
                *self.mixer.lock().unwrap() = Some(new_mixer);
                
                // Replace sink
                {
                    let mut sink = self.sink.lock().unwrap();
                    *sink = new_sink;
                }
                
                // Reload current track if there was one
                if let Some(path) = current_path {
                    info!("Reloading track after recovery: {}", path);
                    if let Err(e) = self.load(path) {
                        warn!("Failed to reload track after recovery: {}", e);
                        return Ok(false);
                    }
                    
                    // Restore position
                    if current_position > 0.5 {
                        if let Err(e) = self.seek(current_position) {
                            warn!("Failed to restore position after recovery: {}", e);
                        }
                    }
                    
                    // Resume if was playing
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
    
    #[allow(dead_code)]
    /// Check if the audio system is healthy (sink is responsive)
    pub fn is_healthy(&self) -> bool {
        // Try to access the sink - if this hangs or fails, system is unhealthy
        match self.sink.try_lock() {
            Ok(sink) => {
                // Just check if we can read state without hanging
                let _ = sink.is_paused();
                true
            }
            Err(_) => {
                // Lock is held for too long - might be stuck
                warn!("Audio sink lock unavailable - system may be unhealthy");
                false
            }
        }
    }
    
    /// Get current audio samples for visualization
    pub fn get_visualizer_samples(&self) -> Vec<f32> {
        match self.visualizer_buffer.lock() {
            Ok(buffer) => buffer.get_samples(),
            Err(_) => Vec::new(),
        }
    }
}