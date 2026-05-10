// Playlist commands
use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::scanner::{Scanner, Track};
use crate::playlist_io::PlaylistIO;
use log::{info, warn};

#[tauri::command]
pub fn create_playlist(name: String, state: tauri::State<AppState>) -> AppResult<String> {
    let validated_name = crate::validation::validate_playlist_name(&name)
        .map_err(|e| AppError::Validation(e.to_string()))?;
    state
        .db
        .create_playlist(&validated_name)
        .map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn get_all_playlists(state: tauri::State<AppState>) -> AppResult<Vec<(String, String, i64)>> {
    state
        .db
        .get_all_playlists()
        .map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn delete_playlist(playlist_id: String, state: tauri::State<AppState>) -> AppResult<()> {
    state
        .db
        .delete_playlist(&playlist_id)
        .map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn rename_playlist(playlist_id: String, new_name: String, state: tauri::State<AppState>) -> AppResult<()> {
    let validated_name = crate::validation::validate_playlist_name(&new_name)
        .map_err(|e| AppError::Validation(e.to_string()))?;
    state
        .db
        .rename_playlist(&playlist_id, &validated_name)
        .map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn add_track_to_playlist(playlist_id: String, track_id: String, state: tauri::State<AppState>) -> AppResult<()> {
    let position = state
        .db
        .get_playlist_track_count(&playlist_id)
        .map_err(|e| AppError::Database(e.to_string()))?;
    state
        .db
        .add_track_to_playlist(&playlist_id, &track_id, position)
        .map_err(|e| AppError::Database(e.to_string()))
}

/// Batch add multiple tracks to a playlist in a single transaction
#[tauri::command]
pub fn add_tracks_to_playlist(playlist_id: String, track_ids: Vec<String>, state: tauri::State<AppState>) -> AppResult<usize> {
    info!("Adding {} tracks to playlist {}", track_ids.len(), playlist_id);
    let starting_position = state
        .db
        .get_playlist_track_count(&playlist_id)
        .map_err(|e| AppError::Database(e.to_string()))?;
    
    let count = state.db.add_tracks_to_playlist_batch(&playlist_id, &track_ids, starting_position)
        .map_err(|e| AppError::Database(e.to_string()))?;
    
    info!("Successfully added {} tracks to playlist", count);
    Ok(count)
}

#[tauri::command]
pub fn remove_track_from_playlist(playlist_id: String, track_id: String, state: tauri::State<AppState>) -> AppResult<()> {
    state
        .db
        .remove_track_from_playlist(&playlist_id, &track_id)
        .map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn reorder_playlist_tracks(
    playlist_id: String, 
    track_positions: Vec<(String, i32)>, 
    state: tauri::State<AppState>
) -> AppResult<()> {
    state
        .db
        .reorder_playlist_tracks(&playlist_id, track_positions)
        .map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn get_playlist_tracks(
    playlist_id: String,
    offset: Option<usize>,
    limit: Option<usize>,
    state: tauri::State<AppState>,
) -> AppResult<Vec<Track>> {
    state
        .db
        .get_playlist_tracks_page(&playlist_id, offset, limit)
        .map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn export_playlist(playlist_id: String, output_path: String, state: tauri::State<'_, AppState>) -> AppResult<()> {
    use std::io::Write;
    info!("Exporting playlist {} to {}", playlist_id, output_path);

    // Validate destination path — reject traversal sequences.
    crate::validation::validate_path(&output_path)
        .map_err(|e| AppError::Validation(format!("Invalid output path: {}", e)))?;

    let file = std::fs::File::create(&output_path)
        .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to create playlist file: {}", e))))?;
    let mut writer = std::io::BufWriter::new(file);

    writeln!(writer, "#EXTM3U")
        .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to write playlist header: {}", e))))?;

    // Fetch and write in pages of 1000 so a 10,000-track playlist does not
    // allocate all Track structs at once and does not hold the DB guard for
    // the entire fetch duration.
    const PAGE_SIZE: usize = 1000;
    let mut offset = 0;
    let mut total_written = 0usize;

    loop {
        let page = state.db.get_playlist_tracks_page(&playlist_id, Some(offset), Some(PAGE_SIZE))
            .map_err(|e| AppError::Database(format!("Failed to get playlist tracks: {}", e)))?;

        let is_last = page.len() < PAGE_SIZE;

        for track in &page {
            let title = track.title.as_ref().unwrap_or(&track.name);
            writeln!(writer, "#EXTINF:-1,{}", title)
                .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to write track info: {}", e))))?;
            writeln!(writer, "{}", track.path)
                .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to write track path: {}", e))))?;
        }

        total_written += page.len();
        offset += page.len();

        if is_last {
            break;
        }
    }

    writer.flush()
        .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to flush playlist file: {}", e))))?;

    info!("Successfully exported {} tracks", total_written);
    Ok(())
}

#[tauri::command]
pub fn import_playlist(playlist_name: String, input_path: String, state: tauri::State<'_, AppState>) -> AppResult<Vec<String>> {
    info!("Importing playlist from {} as {}", input_path, playlist_name);

    let validated_name = crate::validation::validate_playlist_name(&playlist_name)
        .map_err(|e| AppError::Validation(e.to_string()))?;
    
    // Validate the source file path to prevent directory traversal.
    // validate_path checks existence and rejects ".." sequences.
    crate::validation::validate_path(&input_path)
        .map_err(|e| AppError::Validation(format!("Invalid input path: {}", e)))?;
    
    // Import M3U file
    let tracks = PlaylistIO::import_m3u(&input_path)
        .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to import playlist: {}", e))))?;
    
    // Create playlist in database
    let playlist_id = state.db.create_playlist(&validated_name)
        .map_err(|e| AppError::Database(format!("Failed to create playlist: {}", e)))?;
    
    let mut imported_track_ids = Vec::new();
    
    // Add tracks to database and playlist
    for (_title, path) in tracks {
        // Check if track exists in library
        let track_id = match state.db.get_track_by_path(&path) {
            Ok(Some(track)) => track.id,
            Ok(None) => {
                // Track not in library, scan it
                match Scanner::extract_track_info(std::path::Path::new(&path)) {
                    Ok(track) => {
                        state.db.add_track(&track)
                            .map_err(|e| AppError::Database(format!("Failed to add track: {}", e)))?;
                        track.id
                    },
                    Err(e) => {
                        warn!("Failed to scan {}: {}", path, e);
                        continue;
                    }
                }
            },
            Err(e) => {
                warn!("Database error for {}: {}", path, e);
                continue;
            }
        };
        
        imported_track_ids.push(track_id);
    }
    
    // Batch-insert all resolved tracks in a single transaction.
    // This is atomic (all-or-nothing) and avoids N separate SQLite commits.
    if !imported_track_ids.is_empty() {
        state.db.add_tracks_to_playlist_batch(&playlist_id, &imported_track_ids, 0)
            .map_err(|e| AppError::Database(format!("Failed to add tracks to playlist: {}", e)))?;
    }
    
    info!("Successfully imported {} tracks", imported_track_ids.len());
    Ok(imported_track_ids)
}
