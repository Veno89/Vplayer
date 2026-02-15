//! Audio device detection and management
//!
//! This module handles audio device enumeration, selection, and
//! device change detection for graceful recovery.

use rodio::{DeviceTrait, OutputStream, OutputStreamBuilder};
use rodio::cpal::traits::{HostTrait, DeviceTrait as CpalDeviceTrait};
use rodio::mixer::Mixer;
use log::{info, warn, error};
use std::sync::Arc;
use std::time::Instant;
use serde::Serialize;
use crate::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// SendOutputStream — targeted Send wrapper for OutputStream
// ---------------------------------------------------------------------------

/// Newtype wrapper to safely mark OutputStream as Send.
#[allow(dead_code)]
pub(crate) struct SendOutputStream(pub OutputStream);

// SAFETY: OutputStream is !Send but we only access it from the main thread
// or wrap it in Mutex in AudioPlayer.
unsafe impl Send for SendOutputStream {}
unsafe impl Sync for SendOutputStream {}

// ---------------------------------------------------------------------------
// DeviceState — groups all audio-output resources
// ---------------------------------------------------------------------------

/// Holds the audio output resources (stream, mixer, device info).
pub struct DeviceState {
    pub stream: Option<SendOutputStream>,
    // We hold the mixer to connect new Sinks to the output.
    // Mixer is a handle (Arc<Inner>) so it is cheap to clone and Send.
    pub mixer: Option<Mixer>,
    pub connected_device_name: Option<String>,
    pub last_active: Instant,
}

impl DeviceState {
    pub fn new(stream: OutputStream, mixer: Mixer, device_name: Option<String>) -> Self {
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

    pub fn replace(&mut self, stream: OutputStream, mixer: Mixer, device_name: Option<String>) {
        self.stream = Some(SendOutputStream(stream));
        self.mixer = Some(mixer);
        self.connected_device_name = device_name;
        self.last_active = Instant::now();
    }

    pub fn has_device_changed(&self) -> bool {
        has_device_changed(&self.connected_device_name)
    }

    pub fn mixer(&self) -> &Mixer {
        self.mixer.as_ref().expect("DeviceState mixer should always be set")
    }
}

/// Audio device information
#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

/// Creates a high-quality (F32) output stream and returns it along with the mixer handle.
pub fn create_high_quality_output_with_device_name() -> AppResult<(OutputStream, Mixer, Option<String>)> {
    let host = rodio::cpal::default_host();
    let device = host.default_output_device()
        .ok_or_else(|| AppError::Audio("No output device available".to_string()))?;
    
    let device_name = device.name().ok();
    info!("Using audio device: {:?}", device_name);

    if let Ok(config) = device.default_output_config() {
         info!("Device default sample rate: {}", config.sample_rate().0);
    }
    
    // We use OutputStreamBuilder to customize the stream
    let result = OutputStreamBuilder::from_device(device.clone())
        .map_err(|e| AppError::Audio(format!("Failed to create stream builder: {}", e)))?
        .with_sample_format(rodio::cpal::SampleFormat::F32)
        .open_stream();
        
    match result {
        Ok(stream) => {
             // Extract mixer from stream
             let mixer = stream.mixer().clone();
             Ok((stream, mixer, device_name))
        },
        Err(e) => {
            // Fallback to default if F32 fails (unlikely given rodio converts, but possible)
            warn!("Failed to open F32 stream, trying default config: {}", e);
            let stream = OutputStreamBuilder::open_default_stream()
                .map_err(|e| AppError::Audio(format!("Failed to open default stream: {}", e)))?;
            let mixer = stream.mixer().clone();
            Ok((stream, mixer, device_name))
        }
    }
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
    
    let default_device = host.default_output_device();
    let default_name = default_device
        .as_ref()
        .and_then(|d| d.name().ok())
        .unwrap_or_else(|| "Default".to_string());
    
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
    
    if devices.is_empty() {
        devices.push(AudioDevice {
            name: default_name,
            is_default: true,
        });
    }
    
    Ok(devices)
}



