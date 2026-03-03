use ebur128::{EbuR128, Mode};
use std::fs::File;
use symphonia::core::audio::{AudioBuffer, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use serde::{Serialize, Deserialize};
use log::{info, warn};

/**
 * ReplayGain analyzer for track loudness normalization
 * 
 * Uses EBU R128 standard for consistent loudness measurement
 * Target loudness: -18 LUFS (streaming standard)
 */

/// ReplayGain data for a track
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayGainData {
    pub track_gain: f64,  // dB adjustment needed
    pub track_peak: f64,  // Peak sample value (0.0-1.0)
    pub loudness: f64,    // LUFS measurement
}

/// Album-level ReplayGain data computed from tracks in the same album.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlbumReplayGainData {
    pub album_gain: f64,
    pub album_peak: f64,
    pub loudness: f64,
    pub track_count: i64,
}

/**
 * Analyze audio file for ReplayGain data
 */
pub fn analyze_track(path: &str) -> Result<ReplayGainData, String> {
    info!("Analyzing ReplayGain for: {}", path);
    
    // Open audio file
    let file = File::open(path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    
    // Probe format
    let mut hint = Hint::new();
    if let Some(ext) = std::path::Path::new(path).extension() {
        hint.with_extension(&ext.to_string_lossy());
    }
    
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("Failed to probe format: {}", e))?;
    
    let mut format = probed.format;
    
    // Get default audio track
    let track = format.tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "No audio track found".to_string())?;
    
    let track_id = track.id;
    let codec_params = &track.codec_params;
    
    // Create decoder
    let mut decoder = symphonia::default::get_codecs()
        .make(codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {}", e))?;
    
    // Get audio parameters
    let channels = codec_params.channels
        .ok_or_else(|| "No channel info".to_string())?
        .count();
    
    let sample_rate = codec_params.sample_rate
        .ok_or_else(|| "No sample rate info".to_string())? as u32;
    
    // Initialize EBU R128 analyzer
    let mut ebur = EbuR128::new(channels as u32, sample_rate, Mode::I | Mode::TRUE_PEAK)
        .map_err(|e| format!("Failed to create EBU R128 analyzer: {}", e))?;
    
    let mut peak = 0.0_f64;
    
    // Decode and analyze all packets
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(_) => break, // End of stream
        };
        
        // Skip packets from other tracks
        if packet.track_id() != track_id {
            continue;
        }
        
        // Decode packet
        match decoder.decode(&packet) {
            Ok(decoded) => {
                // Convert to f32 samples for analysis
                let spec = *decoded.spec();
                let duration = decoded.capacity() as u64;
                let num_channels = spec.channels.count();
                
                // Create audio buffer
                let mut audio_buf = AudioBuffer::<f32>::new(duration, spec);
                decoded.convert(&mut audio_buf);
                
                // Interleave all channels for EBU R128 analysis
                let num_frames = audio_buf.chan(0).len();
                let mut interleaved = Vec::with_capacity(num_channels * num_frames);
                for frame in 0..num_frames {
                    for ch in 0..num_channels {
                        interleaved.push(audio_buf.chan(ch)[frame]);
                    }
                }
                
                // Feed interleaved samples to EBU R128
                ebur.add_frames_f32(&interleaved)
                    .map_err(|e| format!("Failed to add frames: {}", e))?;
                
                // Track peak across ALL channels
                for ch in 0..num_channels {
                    for &sample in audio_buf.chan(ch) {
                        let abs = sample.abs() as f64;
                        if abs > peak {
                            peak = abs;
                        }
                    }
                }
            }
            Err(e) => {
                warn!("Decode error (continuing): {}", e);
                continue;
            }
        }
    }
    
    // Get loudness measurement
    let loudness = ebur.loudness_global()
        .map_err(|e| format!("Failed to get loudness: {}", e))?;
    
    // Calculate gain needed to reach target (-18 LUFS)
    let target = -18.0;
    let gain = target - loudness;
    
    info!("ReplayGain analysis complete: loudness={:.2} LUFS, gain={:.2} dB, peak={:.4}", 
          loudness, gain, peak);
    
    Ok(ReplayGainData {
        track_gain: gain,
        track_peak: peak,
        loudness,
    })
}

// Storage functions have been moved to `replaygain_store.rs` to separate
// pure analysis (this module) from database I/O.
// Re-export from the store module for backward compatibility with callers
// that still use `replaygain::store_replaygain(…)` etc.
pub use crate::replaygain_store::{
    store_replaygain,
    get_replaygain,
    store_album_replaygain,
    get_album_replaygain,
    analyze_album_replaygain,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_replaygain_data_creation() {
        let data = ReplayGainData {
            track_gain: -5.0,
            track_peak: 0.8,
            loudness: -23.0,
        };
        assert_eq!(data.track_gain, -5.0);
        assert_eq!(data.track_peak, 0.8);
        assert_eq!(data.loudness, -23.0);
    }
}
