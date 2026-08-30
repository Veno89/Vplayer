// Library scanning commands — split from library.rs
use crate::error::{AppError, AppResult};
use crate::scanner::{Scanner, Track};
use crate::time_utils::now_millis;
use crate::AppState;
use log::info;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Window;

fn register_scan(state: &AppState, scan_id: &str) -> AppResult<Arc<AtomicBool>> {
    let mut operations = state
        .scan_operations
        .lock()
        .map_err(|_| AppError::InvalidState("Scan registry lock poisoned".to_string()))?;
    if operations.contains_key(scan_id) {
        return Err(AppError::InvalidState(format!(
            "Scan operation already exists: {scan_id}"
        )));
    }
    let flag = Arc::new(AtomicBool::new(false));
    operations.insert(scan_id.to_string(), flag.clone());
    Ok(flag)
}

#[tauri::command]
pub async fn scan_folder(
    folder_path: String,
    scan_id: String,
    window: Window,
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<Track>> {
    info!("Starting folder scan: {}", folder_path);
    crate::validation::validate_path(&folder_path)
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Check if this folder already exists in the database — if so, do an
    // incremental scan instead of a full rescan to avoid redundant I/O.
    let existing_folder: Option<String> = {
        let conn = state.db.conn();
        conn.query_row(
            "SELECT id FROM folders WHERE path = ?1 COLLATE NOCASE",
            rusqlite::params![&folder_path],
            |row| row.get(0),
        )
        .ok()
    };

    if existing_folder.is_some() {
        info!("Folder already registered — delegating to incremental scan");
        return scan_folder_incremental(folder_path, scan_id, window, state).await;
    }

    let cancel_flag = register_scan(&state, &scan_id)?;
    let scan_operations = state.scan_operations.clone();

    // Run the blocking I/O (file scanning + DB writes) off the async runtime
    let db = state.db.clone();
    let folder_path_clone = folder_path.clone();
    let window_clone = window.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let tracks = Scanner::scan_directory(
                &folder_path_clone,
                Some(&window_clone),
                Some(cancel_flag.clone()),
                Some(&db),
            )
            .map_err(AppError::Scanner)?;
            if cancel_flag.load(Ordering::SeqCst) {
                return Err(AppError::Scanner("Scan cancelled".to_string()));
            }

            // Save folder info
            let now = now_millis();

            let folder_id = format!("folder_{}", uuid::Uuid::new_v4());
            let folder_name = std::path::Path::new(&folder_path_clone)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&folder_path_clone)
                .to_string();

            db.add_folder_with_tracks(&folder_id, &folder_path_clone, &folder_name, now, &tracks)
                .map_err(|e| {
                    AppError::Database(format!(
                        "Failed to persist scanned folder/tracks transactionally: {}",
                        e
                    ))
                })?;

            info!(
                "Scan complete, persisted {} tracks in one transaction",
                tracks.len()
            );
            Ok(tracks)
        })();
        if let Ok(mut operations) = scan_operations.lock() {
            operations.remove(&scan_id);
        }
        result
    })
    .await
    .map_err(|e| AppError::InvalidState(format!("Scan task panicked: {}", e)))?
}

#[tauri::command]
pub async fn scan_folder_incremental(
    folder_path: String,
    scan_id: String,
    window: Window,
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<Track>> {
    info!("Starting incremental folder scan: {}", folder_path);
    crate::validation::validate_path(&folder_path)
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let folder_path = super::path_authority::authorize_folder_path(&state.db, &folder_path)?;

    let cancel_flag = register_scan(&state, &scan_id)?;
    let scan_operations = state.scan_operations.clone();

    let db = state.db.clone();
    let window_clone = window.clone();
    let folder_path_clone = folder_path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            // Perform incremental scan (only new/modified files)
            let tracks = Scanner::scan_directory_incremental(
                &folder_path_clone,
                Some(&window_clone),
                Some(cancel_flag.clone()),
                &db,
            )
            .map_err(AppError::Scanner)?;
            if cancel_flag.load(Ordering::SeqCst) {
                return Err(AppError::Scanner("Scan cancelled".to_string()));
            }

            info!(
                "Incremental scan complete, updating {} tracks in database",
                tracks.len()
            );

            // Collect (track, mtime) pairs so we can persist everything in one transaction.
            let mut batch: Vec<(crate::scanner::Track, i64)> = Vec::with_capacity(tracks.len());
            for track in tracks.iter() {
                let path = std::path::Path::new(&track.path);
                let mtime = std::fs::metadata(path)
                    .and_then(|m| m.modified())
                    .map(|t| {
                        t.duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs() as i64
                    })
                    .unwrap_or(0);
                batch.push((track.clone(), mtime));
            }

            // Single transaction — same pattern as full scan's add_folder_with_tracks.
            db.add_tracks_incremental_batch(&batch).map_err(|e| {
                AppError::Database(format!("Failed to persist incremental tracks: {}", e))
            })?;

            Ok(tracks)
        })();
        if let Ok(mut operations) = scan_operations.lock() {
            operations.remove(&scan_id);
        }
        result
    })
    .await
    .map_err(|e| AppError::InvalidState(format!("Incremental scan task panicked: {}", e)))?
}

/// Return the IDs of all tracks whose path starts with `folder_path`.
/// The frontend calls this after an incremental scan so it can add both newly
/// scanned tracks AND pre-existing tracks in the same folder to the playlist.
#[tauri::command]
pub async fn get_track_ids_for_folder(
    folder_path: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<String>> {
    crate::validation::validate_path(&folder_path)
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let folder_path = super::path_authority::authorize_folder_path(&state.db, &folder_path)?;
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.get_track_ids_for_folder(&folder_path)
            .map_err(|e| AppError::Database(e.to_string()))
    })
    .await
    .map_err(|e| AppError::InvalidState(e.to_string()))?
}

#[tauri::command]
pub fn cancel_scan(scan_id: String, state: tauri::State<'_, AppState>) -> AppResult<()> {
    let operations = state
        .scan_operations
        .lock()
        .map_err(|_| AppError::InvalidState("Scan registry lock poisoned".to_string()))?;
    if let Some(flag) = operations.get(&scan_id) {
        info!("Cancelling library scan {}...", scan_id);
        flag.store(true, Ordering::SeqCst);
    } else {
        info!(
            "Ignoring cancel request for stale or inactive scan: {}",
            scan_id
        );
    }
    Ok(())
}
