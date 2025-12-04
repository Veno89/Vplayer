// Folder watcher commands
use crate::AppState;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn start_folder_watch(folder_path: String, state: tauri::State<AppState>, app_handle: AppHandle) -> Result<(), String> {
    let mut watcher = state.watcher.lock().map_err(|e| format!("Failed to lock watcher: {}", e))?;
    
    // Start watching if not already started
    if watcher.get_watched_paths().is_empty() {
        let app_handle_clone = app_handle.clone();
        watcher.start_watching(move |path| {
            // Emit event to frontend when file changes detected
            let _ = app_handle_clone.emit("folder-changed", path.to_string_lossy().to_string());
        }).map_err(|e| format!("Failed to start watching: {}", e))?;
    }
    
    // Add the path to watch list
    watcher.add_path(&folder_path).map_err(|e| format!("Failed to add path: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn stop_folder_watch(folder_path: String, state: tauri::State<AppState>) -> Result<(), String> {
    let mut watcher = state.watcher.lock().map_err(|e| format!("Failed to lock watcher: {}", e))?;
    watcher.remove_path(&folder_path).map_err(|e| format!("Failed to remove path: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_watched_folders(state: tauri::State<AppState>) -> Result<Vec<String>, String> {
    let watcher = state.watcher.lock().map_err(|e| format!("Failed to lock watcher: {}", e))?;
    let paths = watcher.get_watched_paths()
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    Ok(paths)
}
