// Library scanning commands — split from library.rs
use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::scanner::{Scanner, Track};
use crate::time_utils::now_millis;
use log::info;
use tauri::Window;

#[tauri::command]
pub async fn scan_folder(
    folder_path: String, 
    window: Window,
    state: tauri::State<'_, AppState>
) -> AppResult<Vec<Track>> {
    info!("Starting folder scan: {}", folder_path);
    crate::validation::validate_path(&folder_path).map_err(|e| AppError::Validation(e.to_string()))?;

    // Check if this folder already exists in the database — if so, do an
    // incremental scan instead of a full rescan to avoid redundant I/O.
    let existing_folder: Option<String> = {
        let conn = state.db.conn.lock().unwrap_or_else(|p| p.into_inner());
        conn.query_row(
            "SELECT id FROM folders WHERE path = ?1",
            rusqlite::params![&folder_path],
            |row| row.get(0),
        ).ok()
    };

    if existing_folder.is_some() {
        info!("Folder already registered — delegating to incremental scan");
        return scan_folder_incremental(folder_path, window, state).await;
    }

    // Run the blocking I/O (file scanning + DB writes) off the async runtime
    let db = state.db.clone();
    let folder_path_clone = folder_path.clone();
    let window_clone = window.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let tracks = Scanner::scan_directory(&folder_path_clone, Some(&window_clone), None, Some(&db))
            .map_err(AppError::Scanner)?;

        // Save folder info
        let now = now_millis();

        let folder_id = format!("folder_{}", uuid::Uuid::new_v4());
        let folder_name = std::path::Path::new(&folder_path_clone)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&folder_path_clone)
            .to_string();

        db.add_folder_with_tracks(&folder_id, &folder_path_clone, &folder_name, now, &tracks)
            .map_err(|e| AppError::Database(format!("Failed to persist scanned folder/tracks transactionally: {}", e)))?;

        info!("Scan complete, persisted {} tracks in one transaction", tracks.len());

        Ok(tracks)
    })
    .await
    .map_err(|e| AppError::InvalidState(format!("Scan task panicked: {}", e)))?
}

#[tauri::command]
pub async fn scan_folder_incremental(
    folder_path: String, 
    window: Window,
    state: tauri::State<'_, AppState>
) -> AppResult<Vec<Track>> {
    info!("Starting incremental folder scan: {}", folder_path);
    crate::validation::validate_path(&folder_path).map_err(|e| AppError::Validation(e.to_string()))?;
    
    let db = state.db.clone();
    let window_clone = window.clone();
    let folder_path_clone = folder_path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        // Perform incremental scan (only new/modified files)
        let tracks = Scanner::scan_directory_incremental(&folder_path_clone, Some(&window_clone), None, &db)
            .map_err(AppError::Scanner)?;

        info!("Incremental scan complete, updating {} tracks in database", tracks.len());
        
        // Update tracks in database with modification times
        for track in &tracks {
            let path = std::path::Path::new(&track.path);
            if let Ok(metadata) = std::fs::metadata(path) {
                if let Ok(modified) = metadata.modified() {
                    let mtime = modified.duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs() as i64;
                    
                    db.add_track_with_mtime(track, mtime)
                        .map_err(|e| AppError::Database(e.to_string()))?;
                } else {
                    db.add_track(track).map_err(|e| AppError::Database(e.to_string()))?;
                }
            } else {
                db.add_track(track).map_err(|e| AppError::Database(e.to_string()))?;
            }
        }
        
        Ok(tracks)
    })
    .await
    .map_err(|e| AppError::InvalidState(format!("Incremental scan task panicked: {}", e)))?
}
