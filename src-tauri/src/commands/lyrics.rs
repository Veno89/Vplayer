// Lyrics commands
use crate::error::{AppError, AppResult};
use crate::lyrics::Lrc;
use crate::AppState;

/// Load lyrics from an LRC file for a given track.
/// Returns the parsed LRC data including lines and metadata.
#[tauri::command]
pub fn load_lyrics(
    track_id: String,
    track_path: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<Lrc> {
    let track_path =
        super::path_authority::authorize_track_path(&state.db, &track_id, &track_path)?;
    // Try .lrc file with same name as track
    let track_path = std::path::Path::new(&track_path);
    let lrc_path = track_path.with_extension("lrc");

    if lrc_path.exists() {
        let canonical_lrc = lrc_path
            .canonicalize()
            .map_err(|error| AppError::NotFound(format!("Lyrics file is unavailable: {error}")))?;
        if canonical_lrc.parent() != track_path.parent() {
            return Err(AppError::Security(
                "Lyrics symlink resolves outside the authorized track directory".to_string(),
            ));
        }
        let size = canonical_lrc.metadata().map_err(AppError::Io)?.len();
        if size > 2 * 1024 * 1024 {
            return Err(AppError::Validation(
                "Lyrics file exceeds the 2 MiB safety limit".to_string(),
            ));
        }
        Lrc::from_file(&canonical_lrc)
            .map_err(|e| AppError::Decode(format!("Failed to load lyrics: {}", e)))
    } else {
        Err(AppError::NotFound("No lyrics file found".to_string()))
    }
}
