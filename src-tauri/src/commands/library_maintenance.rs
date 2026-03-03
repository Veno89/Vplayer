// Library maintenance commands — split from library.rs
use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::scanner::Track;
use log::info;
use tauri::Manager;

#[tauri::command]
pub fn clear_failed_tracks(state: tauri::State<'_, AppState>) -> AppResult<()> {
    state.db.clear_failed_tracks().map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn check_missing_files(state: tauri::State<'_, AppState>) -> AppResult<Vec<(String, String)>> {
    info!("Checking for missing files");
    use std::path::Path;
    
    let all_paths = state.db.get_all_track_paths().map_err(|e| AppError::Database(e.to_string()))?;
    let mut missing = Vec::new();
    
    for (track_id, path) in all_paths {
        if !Path::new(&path).exists() {
            missing.push((track_id, path));
        }
    }
    
    info!("Found {} missing files", missing.len());
    Ok(missing)
}

#[tauri::command]
pub fn remove_duplicate_folders(state: tauri::State<'_, AppState>) -> AppResult<usize> {
    info!("Removing duplicate folders");
    state.db.remove_duplicate_folders().map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn show_in_folder(path: String) -> AppResult<()> {
    use std::path::Path;
    use std::process::Command;
    
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
            .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to open explorer: {}", e))))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        // On macOS, use open -R to reveal in Finder
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to open Finder: {}", e))))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // On Linux, open the parent folder
        let parent = file_path.parent()
            .ok_or_else(|| AppError::NotFound("Cannot get parent directory".to_string()))?;
        
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to open file manager: {}", e))))?;
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
pub fn write_text_file(file_path: String, content: String, app_handle: tauri::AppHandle) -> AppResult<()> {
    use std::fs;
    use std::path::Path;
    
    info!("Writing text file: {}", file_path);
    
    // Security: only allow writes inside the app data directory
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to resolve app data dir: {}", e))))?;
    
    let canonical_target = Path::new(&file_path).canonicalize()
        .or_else(|_| {
            // File might not exist yet — canonicalize the parent
            if let Some(parent) = Path::new(&file_path).parent() {
                parent.canonicalize().map(|p| p.join(Path::new(&file_path).file_name().unwrap_or_default()))
            } else {
                Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid path"))
            }
        })
        .map_err(|e| AppError::Validation(format!("Invalid file path: {}", e)))?;
    
    let canonical_allowed = app_data_dir.canonicalize()
        .unwrap_or(app_data_dir);
    
    if !canonical_target.starts_with(&canonical_allowed) {
        return Err(AppError::Security(format!("Security: writes are only allowed inside the app data directory ({})", canonical_allowed.display())));
    }
    
    // Prevent directory traversal
    if file_path.contains("..") {
        return Err(AppError::Security("Security: directory traversal is not allowed".to_string()));
    }

    fs::write(&file_path, content)
        .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to write file: {}", e))))
}
