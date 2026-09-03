// Library maintenance commands — split from library.rs
use crate::AppState;
use crate::database_library_integrity::{
    DuplicateCleanupResult, DuplicateSensitivity, LibraryIntegrityReport, LibraryRepairResult,
};
use crate::error::{AppError, AppResult};
use log::info;
use tauri::{Emitter, Manager};
#[tauri::command]
pub fn clear_failed_tracks(state: tauri::State<'_, AppState>) -> AppResult<()> {
    state
        .db
        .clear_failed_tracks()
        .map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub async fn check_missing_files(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> AppResult<Vec<(String, String)>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        info!("Checking for missing files");
        use std::path::Path;

        let all_paths = db
            .get_all_track_paths()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let total = all_paths.len();
        let mut missing = Vec::new();

        for (checked, (track_id, path)) in all_paths.into_iter().enumerate() {
            if !Path::new(&path).exists() {
                missing.push((track_id, path));
            }
            // Emit progress every 500 tracks so the UI can show a spinner/counter.
            if (checked + 1) % 500 == 0 || (checked + 1) == total {
                let _ = app_handle.emit("missing-files-progress", (checked + 1, total));
            }
        }

        info!("Found {} missing files", missing.len());
        Ok(missing)
    })
    .await
    .map_err(|e| AppError::InvalidState(format!("Missing-file check task failed: {e}")))?
}

#[tauri::command]
pub fn remove_duplicate_folders(state: tauri::State<'_, AppState>) -> AppResult<usize> {
    info!("Removing duplicate folders");
    state
        .db
        .remove_duplicate_folders()
        .map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn get_library_integrity(
    state: tauri::State<'_, AppState>,
) -> AppResult<LibraryIntegrityReport> {
    state
        .db
        .get_library_integrity()
        .map_err(|e| AppError::Database(e.to_string()))
}

/// Snapshot the database and then remove track records that are outside every
/// registered library folder. The operation only changes SQLite records; audio
/// files are never opened for writing or deleted.
#[tauri::command]
pub async fn repair_library_integrity(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> AppResult<LibraryRepairResult> {
    let backup_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| {
            AppError::Io(std::io::Error::other(format!(
                "Failed to resolve app data directory: {e}"
            )))
        })?
        .join("library-repair-backups");
    std::fs::create_dir_all(&backup_dir).map_err(AppError::Io)?;

    let backup_path = backup_dir.join(format!(
        "vplayer-before-library-repair-{}-{}.db",
        crate::time_utils::now_millis(),
        uuid::Uuid::new_v4()
    ));
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        info!(
            "Repairing library integrity with pre-repair snapshot at {}",
            backup_path.display()
        );
        db.repair_library_integrity(&backup_path)
            .map_err(|e| AppError::Database(e.to_string()))
    })
    .await
    .map_err(|e| AppError::InvalidState(format!("Library repair task failed: {e}")))?
}

#[tauri::command]
pub async fn remove_library_duplicates(
    sensitivity: String,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> AppResult<DuplicateCleanupResult> {
    let sensitivity = DuplicateSensitivity::parse(&sensitivity).ok_or_else(|| {
        AppError::Validation("sensitivity must be low, medium, or high".to_string())
    })?;
    let backup_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| {
            AppError::Io(std::io::Error::other(format!(
                "Failed to resolve app data directory: {e}"
            )))
        })?
        .join("library-repair-backups");
    std::fs::create_dir_all(&backup_dir).map_err(AppError::Io)?;
    let backup_path = backup_dir.join(format!(
        "vplayer-before-duplicate-cleanup-{}-{}.db",
        crate::time_utils::now_millis(),
        uuid::Uuid::new_v4()
    ));
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        info!(
            "Removing library duplicates with pre-cleanup snapshot at {}",
            backup_path.display()
        );
        db.remove_library_duplicates(sensitivity, &backup_path)
            .map_err(|e| AppError::Database(e.to_string()))
    })
    .await
    .map_err(|e| AppError::InvalidState(format!("Duplicate cleanup task failed: {e}")))?
}

#[tauri::command]
pub fn show_in_folder(
    track_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    use std::path::Path;
    use std::process::Command;

    let path = super::path_authority::authorize_track_path(&state.db, &track_id, &path)?;
    info!("Showing file in folder: {}", path);

    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(AppError::NotFound(format!("File not found: {}", path)));
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, use explorer /select
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| {
                AppError::Io(std::io::Error::other(format!(
                    "Failed to open explorer: {}",
                    e
                )))
            })?;
    }

    #[cfg(target_os = "macos")]
    {
        // On macOS, use open -R to reveal in Finder
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| {
                AppError::Io(std::io::Error::other(format!(
                    "Failed to open Finder: {}",
                    e
                )))
            })?;
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, open the parent folder
        let parent = file_path
            .parent()
            .ok_or_else(|| AppError::NotFound("Cannot get parent directory".to_string()))?;

        Command::new("xdg-open").arg(parent).spawn().map_err(|e| {
            AppError::Io(std::io::Error::other(format!(
                "Failed to open file manager: {}",
                e
            )))
        })?;
    }

    Ok(())
}

/// Write a text file to the app data directory.
///
/// Security-gated: only allows writes inside the Tauri app data directory.
/// Used by the frontend for exporting data (e.g. discography reports from
/// `DiscographyWindow`). The path is canonicalized and validated against
/// directory traversal before writing.
#[tauri::command]
pub fn write_text_file(
    file_path: String,
    content: String,
    app_handle: tauri::AppHandle,
) -> AppResult<()> {
    use std::fs;
    use std::path::Path;

    info!("Writing text file: {}", file_path);

    // Security: only allow writes inside the app data directory
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| {
        AppError::Io(std::io::Error::other(format!(
            "Failed to resolve app data dir: {}",
            e
        )))
    })?;

    let canonical_target = Path::new(&file_path)
        .canonicalize()
        .or_else(|_| {
            // File might not exist yet — canonicalize the parent
            if let Some(parent) = Path::new(&file_path).parent() {
                parent
                    .canonicalize()
                    .map(|p| p.join(Path::new(&file_path).file_name().unwrap_or_default()))
            } else {
                Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "Invalid path",
                ))
            }
        })
        .map_err(|e| AppError::Validation(format!("Invalid file path: {}", e)))?;

    let canonical_allowed = app_data_dir.canonicalize().unwrap_or(app_data_dir);

    if !canonical_target.starts_with(&canonical_allowed) {
        return Err(AppError::Security(format!(
            "Security: writes are only allowed inside the app data directory ({})",
            canonical_allowed.display()
        )));
    }

    // Prevent directory traversal
    if file_path.contains("..") {
        return Err(AppError::Security(
            "Security: directory traversal is not allowed".to_string(),
        ));
    }

    // Require an explicit file name — reject bare directory paths.
    if canonical_target.file_name().is_none_or(|n| n.is_empty()) {
        return Err(AppError::Validation(
            "file_path must include a file name".to_string(),
        ));
    }

    // Write to the canonicalized path, not the original string, to close the
    // TOCTOU window between the starts_with check above and the write below.
    fs::write(&canonical_target, content).map_err(|e| {
        AppError::Io(std::io::Error::other(format!(
            "Failed to write file: {}",
            e
        )))
    })
}
