// Visualizer commands
use crate::AppState;
use crate::visualizer::{VisualizerData, VisualizerMode};
use rodio::{Decoder, Source};
use std::fs::File;
use std::io::BufReader;

/// Get visualization data from current audio playback
/// This reads samples from the audio player's internal buffer and processes them with FFT
#[tauri::command]
pub fn get_visualizer_data(state: tauri::State<'_, AppState>) -> Result<VisualizerData, String> {
    // Get samples from the audio player's visualizer buffer
    let samples = state.player.get_visualizer_samples();
    
    // Process samples with the visualizer (FFT analysis)
    let mut vis = state.visualizer.lock().unwrap();
    
    // Use a fixed delta time (~33ms for 30fps)
    let delta_time = 0.033;
    
    Ok(vis.process(&samples, delta_time))
}

/// Set visualizer mode
#[tauri::command]
pub fn set_visualizer_mode(mode: VisualizerMode, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut vis = state.visualizer.lock().unwrap();
    vis.set_mode(mode);
    Ok(())
}

/// Set beat detection sensitivity
#[tauri::command]
pub fn set_beat_sensitivity(sensitivity: f32, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut vis = state.visualizer.lock().unwrap();
    vis.set_beat_sensitivity(sensitivity);
    Ok(())
}

/// Pre-compute a low-resolution waveform for the entire track.
///
/// Decodes the file and returns `num_bars` peak amplitude values (0.0–1.0).
/// Intended for rendering a static waveform behind the seekbar.
#[tauri::command]
pub fn get_track_waveform(path: String, num_bars: Option<usize>) -> Result<Vec<f32>, String> {
    let bars = num_bars.unwrap_or(200);

    let file = File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    let source = Decoder::new(BufReader::new(file))
        .map_err(|e| format!("Failed to decode audio: {}", e))?;

    // Decoder<BufReader<File>> yields i16 by default in rodio 0.21;
    // collect as f32 by mapping.
    let channels = source.channels() as usize;
    let samples: Vec<f32> = source.map(|s| s as f32 / i16::MAX as f32).collect();

    if samples.is_empty() || bars == 0 {
        return Ok(vec![0.0; bars]);
    }

    // Mono-mix: average every `channels` samples into one
    let mono: Vec<f32> = samples
        .chunks(channels)
        .map(|ch| ch.iter().map(|s| s.abs()).sum::<f32>() / channels as f32)
        .collect();

    // Downsample to `bars` buckets using peak-per-bucket
    let chunk_size = (mono.len() / bars).max(1);
    let mut peaks: Vec<f32> = mono
        .chunks(chunk_size)
        .take(bars)
        .map(|chunk| chunk.iter().cloned().fold(0.0_f32, f32::max))
        .collect();

    // Pad if we got fewer bars than requested
    peaks.resize(bars, 0.0);

    // Normalize to 0.0–1.0
    let max_peak = peaks.iter().cloned().fold(0.0_f32, f32::max);
    if max_peak > 0.0 {
        for p in &mut peaks {
            *p /= max_peak;
        }
    }

    Ok(peaks)
}
