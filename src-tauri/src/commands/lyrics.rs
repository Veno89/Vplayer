// Lyrics commands
use crate::lyrics::Lrc;

/// Load lyrics from an LRC file for a given track.
/// Returns the parsed LRC data including lines and metadata.
#[tauri::command]
pub fn load_lyrics(track_path: String) -> Result<Lrc, String> {
    // Try .lrc file with same name as track
    let lrc_path = std::path::Path::new(&track_path)
        .with_extension("lrc");
    
    if lrc_path.exists() {
        Lrc::from_file(&lrc_path)
            .map_err(|e| format!("Failed to load lyrics: {}", e))
    } else {
        Err("No lyrics file found".to_string())
    }
}

/// Get the current lyric line for a given timestamp.
/// Returns the lyric line that should be displayed at the specified time.
#[tauri::command]
pub fn get_lyric_at_time(track_path: String, time: f64) -> Result<Option<(f64, String)>, String> {
    let lrc_path = std::path::Path::new(&track_path)
        .with_extension("lrc");
    
    if !lrc_path.exists() {
        return Ok(None);
    }
    
    let lrc = Lrc::from_file(&lrc_path)
        .map_err(|e| format!("Failed to load lyrics: {}", e))?;
    
    Ok(lrc.get_lyric_at(time).map(|line| (line.timestamp, line.text.clone())))
}
