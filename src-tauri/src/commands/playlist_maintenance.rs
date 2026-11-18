use crate::AppState;
use crate::database_playlist_maintenance::PlaylistRemoval;
use crate::error::{AppError, AppResult};
use crate::playlist_files::{FileStatus, PlaylistFileIssue, check_playlist_files};
use serde::Serialize;
use std::sync::atomic::AtomicBool;
use tauri::Emitter;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckProgress {
    scan_id: String,
    checked: usize,
    total: usize,
}

#[tauri::command]
pub async fn check_playlist_tracks(
    playlist_id: String,
    scan_id: String,
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<PlaylistFileIssue>> {
    let cancel = super::library_scan::register_scan(&state, &scan_id)?;
    let registry = state.scan_operations.clone();
    let db = state.db.clone();
    let operation_id = scan_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let tracks = db
            .get_playlist_tracks_page(&playlist_id, None, None)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let roots = db
            .get_all_folders()
            .map_err(|e| AppError::Database(e.to_string()))?
            .into_iter()
            .map(|(_, path, _, _)| path)
            .collect::<Vec<_>>();
        check_playlist_files(&tracks, &roots, &cancel, |checked| {
            let _ = window.emit(
                "playlist-check-progress",
                CheckProgress {
                    scan_id: operation_id.clone(),
                    checked,
                    total: tracks.len(),
                },
            );
        })
        .map_err(AppError::Scanner)
    })
    .await
    .map_err(|e| AppError::InvalidState(e.to_string()));
    if let Ok(mut operations) = registry.lock() {
        operations.remove(&scan_id);
    }
    result?
}

#[tauri::command]
pub async fn remove_playlist_tracks(
    playlist_id: String,
    track_ids: Vec<String>,
    missing_only: bool,
    state: tauri::State<'_, AppState>,
) -> AppResult<PlaylistRemoval> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let ids = if missing_only {
            // Recheck at removal time: a reconnected drive or restored file must survive.
            let requested: std::collections::HashSet<_> = track_ids.into_iter().collect();
            let tracks = db
                .get_playlist_tracks_page(&playlist_id, None, None)
                .map_err(|e| AppError::Database(e.to_string()))?
                .into_iter()
                .filter(|track| requested.contains(&track.id))
                .collect::<Vec<_>>();
            let roots = db
                .get_all_folders()
                .map_err(|e| AppError::Database(e.to_string()))?
                .into_iter()
                .map(|(_, path, _, _)| path)
                .collect::<Vec<_>>();
            check_playlist_files(&tracks, &roots, &AtomicBool::new(false), |_| {})
                .map_err(AppError::Scanner)?
                .into_iter()
                .filter(|issue| issue.status == FileStatus::Missing)
                .map(|issue| issue.track_id)
                .collect()
        } else {
            track_ids
        };
        db.remove_playlist_tracks(&playlist_id, &ids)
            .map_err(|e| AppError::Database(e.to_string()))
    })
    .await
    .map_err(|e| AppError::InvalidState(e.to_string()))?
}

#[tauri::command]
pub fn undo_playlist_removal(
    receipt: PlaylistRemoval,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    state.db.undo_playlist_removal(&receipt).map_err(|_| {
        AppError::InvalidState(
            "Undo unavailable: this playlist changed after removal. No changes were made.".into(),
        )
    })
}

#[tauri::command]
pub fn duplicate_playlist(
    playlist_id: String,
    name: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<String> {
    let name = crate::validation::validate_playlist_name(&name)
        .map_err(|e| AppError::Validation(e.to_string()))?;
    state
        .db
        .duplicate_playlist(&playlist_id, &name)
        .map_err(|e| AppError::Database(e.to_string()))
}
