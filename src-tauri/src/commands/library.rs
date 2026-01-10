// Library and scanner commands
use crate::AppState;
use crate::scanner::{Scanner, Track};
use log::info;
use tauri::Window;
use base64::{Engine as _, engine::general_purpose};

#[tauri::command]
pub async fn scan_folder(
    folder_path: String, 
    window: Window,
    state: tauri::State<'_, AppState>
) -> Result<Vec<Track>, String> {
    info!("Starting folder scan: {}", folder_path);
    // Scan with progress events and database for failed tracks tracking
    let tracks = Scanner::scan_directory(&folder_path, Some(&window), None, Some(&state.db))?;
    
    info!("Scan complete, adding {} tracks to database", tracks.len());
    // Save tracks to database
    for track in &tracks {
        state.db.add_track(track).map_err(|e| e.to_string())?;
    }
    
    // Save folder info
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    
    let folder_id = format!("folder_{}", now);
    let folder_name = std::path::Path::new(&folder_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&folder_path)
        .to_string();
    
    state.db.add_folder(&folder_id, &folder_path, &folder_name, now)
        .map_err(|e| e.to_string())?;
    
    Ok(tracks)
}

#[tauri::command]
pub async fn scan_folder_incremental(
    folder_path: String, 
    window: Window,
    state: tauri::State<'_, AppState>
) -> Result<Vec<Track>, String> {
    info!("Starting incremental folder scan: {}", folder_path);
    
    // Perform incremental scan (only new/modified files)
    let tracks = Scanner::scan_directory_incremental(&folder_path, Some(&window), None, &state.db)?;
    
    info!("Incremental scan complete, updating {} tracks in database", tracks.len());
    
    // Update tracks in database with modification times
    for track in &tracks {
        // Get file modification time
        let path = std::path::Path::new(&track.path);
        if let Ok(metadata) = std::fs::metadata(path) {
            if let Ok(modified) = metadata.modified() {
                let mtime = modified.duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;
                
                state.db.add_track_with_mtime(track, mtime)
                    .map_err(|e| e.to_string())?;
            } else {
                // Fallback to regular add if mtime unavailable
                state.db.add_track(track).map_err(|e| e.to_string())?;
            }
        } else {
            // Fallback to regular add if metadata unavailable
            state.db.add_track(track).map_err(|e| e.to_string())?;
        }
    }
    
    Ok(tracks)
}

#[tauri::command]
pub fn get_all_tracks(state: tauri::State<AppState>) -> Result<Vec<Track>, String> {
    state.db.get_all_tracks().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_folders(state: tauri::State<AppState>) -> Result<Vec<(String, String, String, i64)>, String> {
    state.db.get_all_folders().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_folder(folder_id: String, folder_path: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.db.remove_tracks_by_folder(&folder_path).map_err(|e| e.to_string())?;
    state.db.remove_folder(&folder_id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_failed_tracks(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.db.clear_failed_tracks().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_track_rating(track_id: String, rating: i32, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Setting track rating: {} -> {}", track_id, rating);
    state.db.set_track_rating(&track_id, rating).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_missing_files(state: tauri::State<'_, AppState>) -> Result<Vec<(String, String)>, String> {
    info!("Checking for missing files");
    use std::path::Path;
    
    let all_paths = state.db.get_all_track_paths().map_err(|e| e.to_string())?;
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
pub fn update_track_path(track_id: String, new_path: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Updating track path: {} -> {}", track_id, new_path);
    state.db.update_track_path(&track_id, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn find_duplicates(state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Track>>, String> {
    info!("Finding duplicate tracks");
    state.db.find_duplicates().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_track(track_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Removing track: {}", track_id);
    state.db.remove_track(&track_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn increment_play_count(track_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.db.increment_play_count(&track_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recently_played(limit: usize, state: tauri::State<AppState>) -> Result<Vec<Track>, String> {
    state.db.get_recently_played(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_most_played(limit: usize, state: tauri::State<AppState>) -> Result<Vec<Track>, String> {
    state.db.get_most_played(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_album_art(track_id: String, state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    info!("Getting album art for track: {}", track_id);
    match state.db.get_album_art(&track_id) {
        Ok(Some(art_data)) => {
            let base64_data = general_purpose::STANDARD.encode(&art_data);
            Ok(Some(base64_data))
        },
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to get album art: {}", e)),
    }
}

#[tauri::command]
pub fn extract_and_cache_album_art(track_id: String, track_path: String, state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    info!("Extracting album art for: {}", track_path);
    
    // Check if already cached
    if state.db.has_album_art(&track_id) {
        return get_album_art(track_id, state);
    }
    
    // Extract from file
    match Scanner::extract_album_art(&track_path) {
        Ok(Some(art_data)) => {
            // Cache in database
            state.db.set_album_art(&track_id, &art_data)
                .map_err(|e| format!("Failed to cache album art: {}", e))?;
            
            let base64_data = general_purpose::STANDARD.encode(&art_data);
            Ok(Some(base64_data))
        },
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to extract album art: {}", e)),
    }
}

#[derive(serde::Deserialize)]
pub struct TagUpdate {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
    pub comment: Option<String>,
    pub track_number: Option<String>,
    pub disc_number: Option<String>,
}

#[tauri::command]
pub fn update_track_tags(track_id: String, track_path: String, tags: TagUpdate, state: tauri::State<'_, AppState>) -> Result<(), String> {
    use lofty::{Probe, Accessor, TagExt, ItemKey, TaggedFileExt};
    use std::fs::OpenOptions;
    
    info!("Updating tags for: {}", track_path);
    
    // Open file and read tags
    let tagged_file = Probe::open(&track_path)
        .map_err(|e| format!("Failed to open file: {}", e))?
        .read()
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let mut tag = tagged_file.primary_tag()
        .or_else(|| tagged_file.first_tag())
        .ok_or_else(|| "No tag found in file".to_string())?
        .to_owned();
    
    // Update tags
    if let Some(ref title) = tags.title {
        tag.set_title(title.clone());
    }
    if let Some(ref artist) = tags.artist {
        tag.set_artist(artist.clone());
    }
    if let Some(ref album) = tags.album {
        tag.set_album(album.clone());
    }
    if let Some(ref year) = tags.year {
        tag.insert_text(ItemKey::Year, year.clone());
    }
    if let Some(ref genre) = tags.genre {
        tag.insert_text(ItemKey::Genre, genre.clone());
    }
    if let Some(ref comment) = tags.comment {
        tag.insert_text(ItemKey::Comment, comment.clone());
    }
    if let Some(ref track_number) = tags.track_number {
        if let Ok(num) = track_number.parse::<u32>() {
            tag.set_track(num);
        }
    }
    if let Some(ref disc_number) = tags.disc_number {
        if let Ok(num) = disc_number.parse::<u32>() {
            tag.set_disk(num);
        }
    }
    
    // Save to file
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&track_path)
        .map_err(|e| format!("Failed to open file for writing: {}", e))?;
    
    tag.save_to(&mut file)
        .map_err(|e| format!("Failed to save tags: {}", e))?;
    
    // Update database
    state.db.update_track_metadata(&track_id, &tags.title, &tags.artist, &tags.album)
        .map_err(|e| format!("Failed to update database: {}", e))?;
    
    info!("Tags updated successfully");
    Ok(())
}

#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    use std::path::Path;
    use std::process::Command;
    
    info!("Showing file in folder: {}", path);
    
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }
    
    #[cfg(target_os = "windows")]
    {
        // On Windows, use explorer /select
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        // On macOS, use open -R to reveal in Finder
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // On Linux, open the parent folder
        let parent = file_path.parent()
            .ok_or_else(|| "Cannot get parent directory".to_string())?;
        
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn reset_play_count(track_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    info!("Resetting play count for track: {}", track_id);
    state.db.reset_play_count(&track_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    use std::fs;
    info!("Writing text file: {}", file_path);
    fs::write(&file_path, content).map_err(|e| format!("Failed to write file: {}", e))
}
