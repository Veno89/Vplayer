//! Audio device detection and management
//!
//! This module handles audio device enumeration, selection, and
//! device change detection for graceful recovery.

use rodio::{OutputStream, OutputStreamBuilder};
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

// SAFETY: OutputStream holds a cpal::Stream which is !Send. This is safe
// because SendOutputStream is always stored inside DeviceState which is
// wrapped in a Mutex<DeviceState> within AudioPlayer. All access goes
// through the mutex, ensuring single-threaded access to the underlying
// stream handle at any given time.
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
    /// Monotonically increasing counter, bumped on every device reinit.
    /// Used by PreloadManager to detect stale preloaded sinks that were
    /// connected to a now-dead mixer.
    pub generation: u64,
}

impl DeviceState {
    pub fn new(stream: OutputStream, mixer: Mixer, device_name: Option<String>) -> Self {
        Self {
            stream: Some(SendOutputStream(stream)),
            mixer: Some(mixer),
            connected_device_name: device_name,
            last_active: Instant::now(),
            generation: 0,
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
        self.generation += 1;
    }

    pub fn has_device_changed(&self) -> bool {
        has_device_changed(&self.connected_device_name)
    }

    /// Returns a reference to the mixer handle.
    ///
    /// Panics are replaced with a Result to prevent bringing down the audio
    /// system if the mixer is unexpectedly None (e.g. after a failed reinit).
    pub fn mixer(&self) -> Result<&Mixer, crate::error::AppError> {
        self.mixer.as_ref().ok_or_else(|| {
            crate::error::AppError::Audio("Audio mixer unavailable — device may need reinit".into())
        })
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

/// Check if the audio situation has changed in a way that requires reinit.
///
/// Returns `true` in two cases:
///
/// 1. The device we originally connected to has *disappeared* from the OS
///    enumeration (e.g. the user unplugged a USB DAC).
///
/// 2. The Windows default output device has *changed* to a different device
///    (e.g. the user powers on a USB DAC or HDMI monitor after the app
///    started, and Windows promotes it to the new default). In this case the
///    old device is still present in the enumeration, so the disappearance
///    check alone would not fire — but we are producing audio on the wrong
///    device. Detecting the default-device switch and triggering reinit causes
///    `reinit_and_reload()` → `create_high_quality_output_with_device_name()`
///    to open a fresh stream on the current Windows default, restoring audio
///    without requiring an app restart.
pub fn has_device_changed(connected_device_name: &Option<String>) -> bool {
    let name = match connected_device_name {
        Some(n) => n,
        // If we don't know what we connected to, assume it hasn't changed.
        None => return false,
    };

    let host = rodio::cpal::default_host();

    // ── Check 1: has our connected device disappeared from the OS? ──────────
    let still_present = host
        .output_devices()
        .map(|devices| devices.filter_map(|d| d.name().ok()).any(|n| n == *name))
        .unwrap_or(false);

    if !still_present {
        info!("Connected audio device disappeared: {:?}", name);
        return true;
    }

    // ── Check 2: has Windows changed its default output to something else? ──
    // This covers the "started app with device off, device powers on, Windows
    // promotes it to default" scenario. The old device is still present so
    // Check 1 passes, but we are sending audio to the wrong endpoint.
    let default_name = host
        .default_output_device()
        .and_then(|d| d.name().ok());

    if let Some(ref default) = default_name {
        if default != name {
            info!(
                "Windows default output changed from {:?} to {:?} — reinit needed",
                name, default
            );
            return true;
        }
    }

    false
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

#[cfg(test)]
mod tests {
    use super::*;

    // ── F-017e / F-009: device-change detection (hardware-free) ──────────────

    /// When no device name was ever recorded, `has_device_changed` must return
    /// false (conservative — don't trigger spurious reinit on startup).
    #[test]
    fn has_device_changed_returns_false_when_no_device_recorded() {
        let connected: Option<String> = None;
        assert!(
            !has_device_changed(&connected),
            "has_device_changed should return false when connected_device_name is None"
        );
    }

    /// A device name that cannot exist in any OS device list must be reported
    /// as "changed" (disappeared from OS enumeration — Check 1).
    #[test]
    fn has_device_changed_returns_true_for_nonexistent_device() {
        let connected = Some("VPlayer_NonExistent_Audio_Device_xyz_1a2b3c".to_string());
        assert!(
            has_device_changed(&connected),
            "has_device_changed should return true when the device is absent from OS list"
        );
    }

    /// When the connected device name matches the current Windows default,
    /// `has_device_changed` must return false (no reinit needed).
    ///
    /// This test requires at least one output device to be present. If no
    /// device is available the test is skipped via early return.
    #[test]
    fn has_device_changed_returns_false_when_connected_to_current_default() {
        let host = rodio::cpal::default_host();
        let default_name = match host.default_output_device().and_then(|d| d.name().ok()) {
            Some(n) => n,
            None => return, // no audio hardware in this environment — skip
        };
        let connected = Some(default_name);
        assert!(
            !has_device_changed(&connected),
            "has_device_changed should return false when connected to the current default device"
        );
    }

    /// When the app is connected to a device that is present in the OS but is
    /// no longer the Windows default, `has_device_changed` must return true
    /// (Check 2: default-device switch — e.g. USB DAC powered on after startup).
    ///
    /// We synthesise this by using a known-present device name (the real
    /// default) but then passing a *different* fabricated name as the
    /// "connected" device, ensuring the connected name is still present yet
    /// the default has moved on. We achieve the same logical condition by
    /// claiming we are connected to an impossible device name while a real
    /// default exists — but Check 1 already covers absence. Instead we rely
    /// on the fact that the nonexistent device used in
    /// `has_device_changed_returns_true_for_nonexistent_device` exercises the
    /// disappearance path; the default-switch path is exercised here by
    /// passing a name that is present but is NOT the default.
    ///
    /// If the system has only one output device this test cannot be
    /// constructed meaningfully and is skipped.
    #[test]
    fn has_device_changed_returns_true_when_default_device_changed() {
        let host = rodio::cpal::default_host();

        // Collect all device names.
        let all_names: Vec<String> = match host.output_devices() {
            Ok(devs) => devs.filter_map(|d| d.name().ok()).collect(),
            Err(_) => return, // no audio hardware — skip
        };

        let default_name = match host.default_output_device().and_then(|d| d.name().ok()) {
            Some(n) => n,
            None => return, // no default device — skip
        };

        // Find a device that is present but is NOT the current default.
        let non_default = all_names.iter().find(|n| *n != &default_name);

        if let Some(connected_name) = non_default {
            // We are "connected" to a real but non-default device.
            // Check 2 should fire: default != connected_name.
            let connected = Some(connected_name.clone());
            assert!(
                has_device_changed(&connected),
                "has_device_changed should return true when connected device is not the current default"
            );
        }
        // If no non-default device exists (single-device system) we skip —
        // we cannot simulate a default-switch without real hardware.
    }

    /// `is_device_available` must not panic regardless of whether hardware is
    /// present. The return value is environment-dependent.
    #[test]
    fn is_device_available_does_not_panic() {
        let _available = is_device_available();
        // No assertion on the value — CI may have no audio hardware.
    }
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



