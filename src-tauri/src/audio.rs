use rodio::{Decoder, OutputStream, Sink, Source, DeviceTrait};
use rodio::cpal::traits::HostTrait;
use std::fs::File;
use std::io::BufReader;
use log::{info, error};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::Serialize;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

pub struct AudioPlayer {
    sink: Arc<Mutex<Sink>>,
    _stream: Arc<OutputStream>,
    current_path: Arc<Mutex<Option<String>>>,
    start_time: Arc<Mutex<Option<Instant>>>,
    seek_offset: Arc<Mutex<Duration>>,
    pause_start: Arc<Mutex<Option<Instant>>>,
    paused_duration: Arc<Mutex<Duration>>,
    total_duration: Arc<Mutex<Duration>>,
    // For gapless playback
    preload_sink: Arc<Mutex<Option<Sink>>>,
    preload_path: Arc<Mutex<Option<String>>>,
}

// Manually implement Send and Sync for AudioPlayer
unsafe impl Send for AudioPlayer {}
unsafe impl Sync for AudioPlayer {}

impl AudioPlayer {
    pub fn new() -> AppResult<Self> {
        info!("Initializing audio player");
        let (stream, stream_handle) = OutputStream::try_default()
            .map_err(|e| {
                error!("Failed to create audio output: {}", e);
                AppError::Audio(format!("Failed to create audio output: {}", e))
            })?;
        
        let sink = Sink::try_new(&stream_handle)
            .map_err(|e| {
                error!("Failed to create sink: {}", e);
                AppError::Audio(format!("Failed to create sink: {}", e))
            })?;
        
        info!("Audio player initialized successfully");
        Ok(Self {
            sink: Arc::new(Mutex::new(sink)),
            _stream: Arc::new(stream),
            current_path: Arc::new(Mutex::new(None)),
            start_time: Arc::new(Mutex::new(None)),
            seek_offset: Arc::new(Mutex::new(Duration::ZERO)),
            pause_start: Arc::new(Mutex::new(None)),
            paused_duration: Arc::new(Mutex::new(Duration::ZERO)),
            total_duration: Arc::new(Mutex::new(Duration::ZERO)),
            preload_sink: Arc::new(Mutex::new(None)),
            preload_path: Arc::new(Mutex::new(None)),
        })
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
        
        let sink = self.sink.lock().unwrap();
        sink.clear();
        sink.append(source);
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
        Ok(())
    }
    
    pub fn seek(&self, position: f64) -> AppResult<()> {
        info!("Seeking to position: {}s", position);
        let sink = self.sink.lock().unwrap();
        
        // Try to seek - rodio 0.19 supports this
        sink.try_seek(Duration::from_secs_f64(position))
            .map_err(|e| {
                error!("Seek failed: {}", e);
                AppError::Audio(format!("Seek failed: {}", e))
            })?;
        
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
        !sink.is_paused()
    }
    
    pub fn is_finished(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        sink.empty()
    }
    
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
        
        let device = output_devices
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
        let (_new_stream, new_stream_handle) = OutputStream::try_from_device(&device)
            .map_err(|e| AppError::Audio(format!("Failed to create output stream: {}", e)))?;
        
        let new_sink = Sink::try_new(&new_stream_handle)
            .map_err(|e| AppError::Audio(format!("Failed to create sink: {}", e)))?;
        
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
        let device = host.default_output_device()
            .ok_or_else(|| AppError::Audio("No output device available".to_string()))?;
        
        let (_stream, stream_handle) = OutputStream::try_from_device(&device)
            .map_err(|e| AppError::Audio(format!("Failed to create stream: {}", e)))?;
        
        let new_sink = Sink::try_new(&stream_handle)
            .map_err(|e| AppError::Audio(format!("Failed to create preload sink: {}", e)))?;
        
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
}