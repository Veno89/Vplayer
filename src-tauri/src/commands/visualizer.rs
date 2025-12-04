// Visualizer commands
use crate::AppState;
use crate::visualizer::{VisualizerData, VisualizerMode};

/// Process audio samples for visualization
#[tauri::command]
pub fn get_visualizer_data(samples: Vec<f32>, delta_time: f32, state: tauri::State<'_, AppState>) -> Result<VisualizerData, String> {
    let mut vis = state.visualizer.lock().unwrap();
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
