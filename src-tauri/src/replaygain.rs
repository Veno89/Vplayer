use ebur128::{EbuR128, Mode};
use rusqlite::Connection;
use std::fs::File;
use std::sync::{Arc, Mutex};
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

impl ReplayGainData {
    /// Calculate volume adjustment factor (0.0-1.0 range)
    pub fn get_adjustment(&self, target_lufs: f64) -> f64 {
        let gain_db = target_lufs - self.loudness;
        let factor = 10_f64.powf(gain_db / 20.0);
        
        // Prevent clipping - if gain would cause peak > 1.0, reduce it
        if self.track_peak * factor > 1.0 {
            1.0 / self.track_peak
        } else {
            factor
        }
    }
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
                
                // Create audio buffer
                let mut audio_buf = AudioBuffer::<f32>::new(duration, spec);
                decoded.convert(&mut audio_buf);
                
                // Get samples as interleaved
                let samples = audio_buf.chan(0); // Get first channel
                
                // Feed to EBU R128
                ebur.add_frames_f32(samples)
                    .map_err(|e| format!("Failed to add frames: {}", e))?;
                
                // Track peak
                for &sample in samples {
                    let abs = sample.abs() as f64;
                    if abs > peak {
                        peak = abs;
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

/**
 * Store ReplayGain data in database
 */
pub fn store_replaygain(
    conn: &Mutex<Connection>,
    track_path: &str,
    data: &ReplayGainData,
) -> Result<(), String> {
    let conn = conn.lock().unwrap();
    
    conn.execute(
        "UPDATE tracks SET track_gain = ?, track_peak = ?, loudness = ? WHERE path = ?",
        rusqlite::params![data.track_gain, data.track_peak, data.loudness, track_path],
    )
    .map_err(|e| format!("Failed to store ReplayGain: {}", e))?;
    
    Ok(())
}

/**
 * Get ReplayGain data from database
 */
pub fn get_replaygain(
    conn: &Mutex<Connection>,
    track_path: &str,
) -> Result<Option<ReplayGainData>, String> {
    let conn = conn.lock().unwrap();
    
    let mut stmt = conn
        .prepare("SELECT track_gain, track_peak, loudness FROM tracks WHERE path = ?")
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;
    
    let result = stmt.query_row(rusqlite::params![track_path], |row| {
        let gain: Option<f64> = row.get(0)?;
        let peak: Option<f64> = row.get(1)?;
        let loudness: Option<f64> = row.get(2)?;
        
        if let (Some(g), Some(p), Some(l)) = (gain, peak, loudness) {
            Ok(Some(ReplayGainData {
                track_gain: g,
                track_peak: p,
                loudness: l,
            }))
        } else {
            Ok(None)
        }
    });
    
    match result {
        Ok(data) => Ok(data),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Database error: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adjustment_calculation() {
        let data = ReplayGainData {
            track_gain: -5.0,
            track_peak: 0.8,
            loudness: -23.0,
        };
        
        // Target -18 LUFS from -23 LUFS = +5 dB gain
        let adjustment = data.get_adjustment(-18.0);
        assert!(adjustment > 1.0); // Should boost
        assert!(adjustment < 2.0); // Reasonable range
    }

    #[test]
    fn test_peak_limiting() {
        let data = ReplayGainData {
            track_gain: 10.0,
            track_peak: 0.9,
            loudness: -28.0,
        };
        
        // Would need +10 dB to reach -18 LUFS, but peak is 0.9
        // Should limit to prevent clipping
        let adjustment = data.get_adjustment(-18.0);
        assert!(data.track_peak * adjustment <= 1.0);
    }
}
