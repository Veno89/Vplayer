// ReplayGain commands
use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::replaygain::{
    analyze_album_replaygain as analyze_album_replaygain_data,
    analyze_track,
    get_album_replaygain as get_album_replaygain_data,
    get_replaygain,
    store_replaygain,
    AlbumReplayGainData,
    ReplayGainData,
};
use log::info;

/// Analyze track for ReplayGain data and store in database
#[tauri::command]
pub fn analyze_replaygain(track_path: String, state: tauri::State<'_, AppState>) -> AppResult<ReplayGainData> {
    info!("Analyzing ReplayGain for: {}", track_path);
    
    let data = analyze_track(&track_path).map_err(AppError::Decode)?;
    store_replaygain(&state.db.conn, &track_path, &data).map_err(|e| AppError::Database(e.to_string()))?;
    
    Ok(data)
}

/// Get ReplayGain data for a track
#[tauri::command]
pub fn get_track_replaygain(track_path: String, state: tauri::State<'_, AppState>) -> AppResult<Option<ReplayGainData>> {
    get_replaygain(&state.db.conn, &track_path).map_err(|e| AppError::Database(e.to_string()))
}

/// Get cached album-level ReplayGain data for artist+album.
#[tauri::command]
pub fn get_album_replaygain(
    artist: String,
    album: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<Option<AlbumReplayGainData>> {
    let artist = artist.trim();
    let album = album.trim();
    if artist.is_empty() || album.is_empty() {
        return Ok(None);
    }

    get_album_replaygain_data(&state.db.conn, artist, album)
        .map_err(|e| AppError::Database(e.to_string()))
}

/// Derive and store album-level ReplayGain data from existing track ReplayGain rows.
#[tauri::command]
pub fn analyze_album_replaygain(
    artist: String,
    album: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<Option<AlbumReplayGainData>> {
    let artist = artist.trim();
    let album = album.trim();
    if artist.is_empty() || album.is_empty() {
        return Ok(None);
    }

    info!("Analyzing album ReplayGain for {} - {}", artist, album);
    analyze_album_replaygain_data(&state.db.conn, artist, album)
        .map_err(|e| AppError::Database(e.to_string()))
}
