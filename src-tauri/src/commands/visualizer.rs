// Visualizer commands
use crate::AppState;
use crate::visualizer::{VisualizerData, VisualizerMode};

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
