// ReplayGain commands
use crate::AppState;
use crate::replaygain::{analyze_track, get_replaygain, store_replaygain, ReplayGainData};
use log::info;

/// Analyze track for ReplayGain data and store in database
#[tauri::command]
pub fn analyze_replaygain(track_path: String, state: tauri::State<'_, AppState>) -> Result<ReplayGainData, String> {
    info!("Analyzing ReplayGain for: {}", track_path);
    
    let data = analyze_track(&track_path)?;
    store_replaygain(&state.db.conn, &track_path, &data)?;
    
    Ok(data)
}

/// Get ReplayGain data for a track
#[tauri::command]
pub fn get_track_replaygain(track_path: String, state: tauri::State<'_, AppState>) -> Result<Option<ReplayGainData>, String> {
    get_replaygain(&state.db.conn, &track_path)
}
