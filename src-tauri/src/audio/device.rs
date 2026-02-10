//! Audio device detection and management
//!
//! This module handles audio device enumeration, selection, and
//! device change detection for graceful recovery.

use rodio::{DeviceTrait, OutputStream, OutputStreamBuilder};
use rodio::cpal::traits::HostTrait;
use rodio::cpal::SampleFormat;
use rodio::mixer::Mixer;
use log::{info, warn};
use std::sync::Arc;
use std::time::Instant;
use serde::Serialize;
use crate::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// SendOutputStream — targeted Send wrapper for OutputStream
// ---------------------------------------------------------------------------

/// Newtype wrapper to safely mark OutputStream as Send.
///
/// # Safety
/// AudioPlayer holds OutputStream behind a Mutex for exclusive access.
/// It lives in Tauri managed state and is never moved between threads.
/// The OutputStream only keeps the audio device connection alive;
/// no cross-thread method calls are made on it.
#[allow(dead_code)]
pub(crate) struct SendOutputStream(pub OutputStream);

// SAFETY: see doc-comment above.
unsafe impl Send for SendOutputStream {}

// ---------------------------------------------------------------------------
// DeviceState — groups all audio-output resources
// ---------------------------------------------------------------------------

/// Holds the audio output resources (stream, mixer, device info).
///
/// The OutputStream keeps the audio device alive — dropping it stops all audio.
pub struct DeviceState {
    pub stream: Option<SendOutputStream>,
    pub mixer: Option<Arc<Mixer>>,
    pub connected_device_name: Option<String>,
    pub last_active: Instant,
}

impl DeviceState {
    pub fn new(stream: OutputStream, mixer: Arc<Mixer>, device_name: Option<String>) -> Self {
        Self {
            stream: Some(SendOutputStream(stream)),
            mixer: Some(mixer),
            connected_device_name: device_name,
            last_active: Instant::now(),
        }
    }

    pub fn update_active(&mut self) {
        self.last_active = Instant::now();
    }

    pub fn replace(&mut self, stream: OutputStream, mixer: Arc<Mixer>, device_name: Option<String>) {
        self.stream = Some(SendOutputStream(stream));
        self.mixer = Some(mixer);
        self.connected_device_name = device_name;
        self.last_active = Instant::now();
    }

    pub fn has_device_changed(&self) -> bool {
        has_device_changed(&self.connected_device_name)
    }

    /// Borrow the current output mixer (used to connect new Sinks without
    /// creating a new OutputStream).
    pub fn mixer(&self) -> &Arc<Mixer> {
        self.mixer.as_ref().expect("DeviceState mixer should always be set")
    }
}

/// Audio device information
#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

/// Create high quality output and return the device name we connected to
pub fn create_high_quality_output_with_device_name() -> AppResult<(OutputStream, Arc<Mixer>, Option<String>)> {
    let host = rodio::cpal::default_host();
    let device = host.default_output_device()
        .ok_or_else(|| AppError::Audio("No output device available".to_string()))?;
    
    let device_name = device.name().ok();
    info!("Using audio device: {:?}", device_name);
    
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
    
    Ok((stream, mixer, device_name))
}

/// Check if the default audio device has changed
pub fn has_device_changed(connected_device_name: &Option<String>) -> bool {
    let host = rodio::cpal::default_host();
    
    // Get current default device name
    let current_default = host.default_output_device()
        .and_then(|d| d.name().ok());
    
    // If we don't know what we connected to, assume it hasn't changed
    if connected_device_name.is_none() {
        return false;
    }
    
    // Check if device changed
    let changed = current_default != *connected_device_name;
    
    if changed {
        info!("Audio device changed: {:?} -> {:?}", connected_device_name, current_default);
    }
    
    changed
}

/// Check if there's any audio device available
pub fn is_device_available() -> bool {
    let host = rodio::cpal::default_host();
    
    // Check if there's any default output device
    if host.default_output_device().is_none() {
        warn!("No default audio output device available");
        return false;
    }
    
    true
}

/// Get list of all audio output devices
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
