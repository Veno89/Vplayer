// Lyrics commands
use crate::lyrics::Lrc;
use crate::error::{AppError, AppResult};

/// Load lyrics from an LRC file for a given track.
/// Returns the parsed LRC data including lines and metadata.
#[tauri::command]
pub fn load_lyrics(track_path: String) -> AppResult<Lrc> {
    // Try .lrc file with same name as track
    let lrc_path = std::path::Path::new(&track_path)
        .with_extension("lrc");
    
    if lrc_path.exists() {
        Lrc::from_file(&lrc_path)
            .map_err(|e| AppError::Decode(format!("Failed to load lyrics: {}", e)))
    } else {
        Err(AppError::NotFound("No lyrics file found".to_string()))
    }
}

/// Get the current lyric line for a given timestamp.
/// Returns the lyric line that should be displayed at the specified time.
#[tauri::command]
pub fn get_lyric_at_time(track_path: String, time: f64) -> AppResult<Option<(f64, String)>> {
    let lrc_path = std::path::Path::new(&track_path)
        .with_extension("lrc");
    
    if !lrc_path.exists() {
        return Ok(None);
    }
    
    let lrc = Lrc::from_file(&lrc_path)
        .map_err(|e| AppError::Decode(format!("Failed to load lyrics: {}", e)))?;
    
    Ok(lrc.get_lyric_at(time).map(|line| (line.timestamp, line.text.clone())))
}
