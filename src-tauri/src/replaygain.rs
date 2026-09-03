use ebur128::{EbuR128, Mode};
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::fs::File;
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

/**
 * ReplayGain analyzer for track loudness normalization
 *
 * Uses EBU R128 standard for consistent loudness measurement
 * Target loudness: -18 LUFS (streaming standard)
 */
/// ReplayGain data for a track
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayGainData {
    pub track_gain: f64, // dB adjustment needed
    pub track_peak: f64, // Peak sample value (0.0-1.0)
    pub loudness: f64,   // LUFS measurement
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
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;

    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    // Probe format
    let mut hint = Hint::new();
    if let Some(ext) = std::path::Path::new(path).extension() {
        hint.with_extension(&ext.to_string_lossy());
    }

    let mut format = symphonia::default::get_probe()
        .probe(
            &hint,
            mss,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|e| format!("Failed to probe format: {}", e))?;

    // Get default audio track
    let track = format
        .default_track(TrackType::Audio)
        .ok_or_else(|| "No audio track found".to_string())?;

    let track_id = track.id;
    let codec_params = track
        .codec_params
        .as_ref()
        .and_then(|params| params.audio())
        .ok_or_else(|| "No audio codec parameters found".to_string())?;

    // Create decoder
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(codec_params, &AudioDecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {}", e))?;

    // Get audio parameters
    let channels = codec_params
        .channels
        .as_ref()
        .ok_or_else(|| "No channel info".to_string())?
        .count();

    let sample_rate = codec_params
        .sample_rate
        .ok_or_else(|| "No sample rate info".to_string())? as u32;

    // Initialize EBU R128 analyzer
    let mut ebur = EbuR128::new(channels as u32, sample_rate, Mode::I | Mode::TRUE_PEAK)
        .map_err(|e| format!("Failed to create EBU R128 analyzer: {}", e))?;

    let mut peak = 0.0_f64;
    let mut interleaved = Vec::<f32>::new();

    // Decode and analyze all packets
    loop {
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            Err(error) => {
                warn!("Packet read error (ending analysis): {}", error);
                break;
            }
        };

        // Skip packets from other tracks
        if packet.track_id != track_id {
            continue;
        }

        // Decode packet
        match decoder.decode(&packet) {
            Ok(decoded) => {
                // Symphonia 0.6 can copy any decoded sample format directly
                // into normalized f32 samples in channel-interleaved order.
                interleaved.resize(decoded.samples_interleaved(), 0.0);
                decoded.copy_to_slice_interleaved(&mut interleaved);

                // Feed interleaved samples to EBU R128
                ebur.add_frames_f32(&interleaved)
                    .map_err(|e| format!("Failed to add frames: {}", e))?;

                // Track peak across ALL channels
                for &sample in &interleaved {
                    let abs = f64::from(sample.abs());
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
    let loudness = ebur
        .loudness_global()
        .map_err(|e| format!("Failed to get loudness: {}", e))?;

    // Calculate gain needed to reach target (-18 LUFS)
    let target = -18.0;
    let gain = target - loudness;

    info!(
        "ReplayGain analysis complete: loudness={:.2} LUFS, gain={:.2} dB, peak={:.4}",
        loudness, gain, peak
    );

    Ok(ReplayGainData {
        track_gain: gain,
        track_peak: peak,
        loudness,
    })
}

// Storage functions have been moved to `replaygain_store.rs` to separate
// pure analysis (this module) from database I/O.
// Re-export from the store module for backward compatibility with callers
// that still use `replaygain::store_replaygain(...)` etc.
pub use crate::replaygain_store::{
    analyze_album_replaygain, get_album_replaygain, get_replaygain, store_replaygain,
};

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;

    struct TempAudioFile(PathBuf);

    impl Drop for TempAudioFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn write_test_wav() -> TempAudioFile {
        const SAMPLE_RATE: u32 = 48_000;
        const CHANNELS: u16 = 2;
        const BITS_PER_SAMPLE: u16 = 16;

        let path = std::env::temp_dir().join(format!(
            "vplayer_replaygain_symphonia_{}.wav",
            uuid::Uuid::new_v4()
        ));
        let bytes_per_sample = u32::from(BITS_PER_SAMPLE / 8);
        let block_align = CHANNELS * (BITS_PER_SAMPLE / 8);
        let data_len = SAMPLE_RATE * u32::from(CHANNELS) * bytes_per_sample;

        let mut wav = Vec::with_capacity((44 + data_len) as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_len).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16_u32.to_le_bytes());
        wav.extend_from_slice(&1_u16.to_le_bytes());
        wav.extend_from_slice(&CHANNELS.to_le_bytes());
        wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
        wav.extend_from_slice(&(SAMPLE_RATE * u32::from(block_align)).to_le_bytes());
        wav.extend_from_slice(&block_align.to_le_bytes());
        wav.extend_from_slice(&BITS_PER_SAMPLE.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_len.to_le_bytes());

        for frame in 0..SAMPLE_RATE {
            let phase = 2.0 * std::f32::consts::PI * 440.0 * frame as f32 / SAMPLE_RATE as f32;
            let sample = (phase.sin() * 0.25 * f32::from(i16::MAX)) as i16;
            for _ in 0..CHANNELS {
                wav.extend_from_slice(&sample.to_le_bytes());
            }
        }

        let mut file = File::create(&path).expect("test WAV should be created");
        file.write_all(&wav).expect("test WAV should be written");
        TempAudioFile(path)
    }

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

    #[test]
    fn analyzes_pcm_wav_with_symphonia() {
        let wav = write_test_wav();
        let data = analyze_track(wav.0.to_str().expect("test path should be UTF-8"))
            .expect("generated PCM WAV should be analyzed");

        assert!(data.track_gain.is_finite());
        assert!(data.loudness.is_finite());
        assert!((0.24..=0.26).contains(&data.track_peak));
    }
}
