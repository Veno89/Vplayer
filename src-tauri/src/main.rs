#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod audio;
mod scanner;
mod database;
mod error;
mod watcher;
mod playlist_io;
mod smart_playlists;
mod validation;
mod lyrics;
mod replaygain;
mod effects;
mod visualizer;
use audio::{AudioPlayer, AudioDevice};
use scanner::{Scanner, Track};
use database::Database;
use watcher::FolderWatcher;
use playlist_io::PlaylistIO;
use smart_playlists::SmartPlaylist;
use lyrics::Lrc;
use replaygain::{ReplayGainData, analyze_track, store_replaygain, get_replaygain};
use effects::EffectsConfig;
use visualizer::{Visualizer, VisualizerData, VisualizerMode};
use std::sync::Arc;
use tauri::{Manager, Window, Emitter, AppHandle};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::menu::{Menu, MenuItem};
use log::{info, warn};

struct AppState {
    player: Arc<AudioPlayer>,
    db: Arc<database::Database>,
    watcher: Arc<Mutex<FolderWatcher>>,
    visualizer: Arc<Mutex<Visualizer>>,
}

use std::sync::Mutex;

#[tauri::command]
fn load_track(path: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.load(path).map_err(|e| e.into())
}

#[tauri::command]
fn play_audio(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.play().map_err(|e| e.into())
}

#[tauri::command]
fn pause_audio(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.pause().map_err(|e| e.into())
}

#[tauri::command]
fn stop_audio(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.stop().map_err(|e| e.into())
}

#[tauri::command]
fn set_volume(volume: f32, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.set_volume(volume).map_err(|e| e.into())
}

#[tauri::command]
fn seek_to(position: f64, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.seek(position).map_err(|e| e.into())
}

#[tauri::command]
fn get_position(state: tauri::State<AppState>) -> f64 {
    state.player.get_position()
}

#[tauri::command]
fn get_duration(state: tauri::State<AppState>) -> f64 {
    state.player.get_duration()
}

#[tauri::command]
fn is_playing(state: tauri::State<AppState>) -> bool {
    state.player.is_playing()
}

#[tauri::command]
fn is_finished(state: tauri::State<AppState>) -> bool {
    state.player.is_finished()
}

#[tauri::command]
fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    AudioPlayer::get_audio_devices().map_err(|e| e.into())
}

#[tauri::command]
fn set_audio_device(device_name: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.set_output_device(&device_name).map_err(|e| e.into())
}

// Gapless playback commands
#[tauri::command]
fn preload_track(path: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.preload(path).map_err(|e| e.into())
}

#[tauri::command]
fn swap_to_preloaded(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.swap_to_preloaded().map_err(|e| e.into())
}

#[tauri::command]
fn clear_preload(state: tauri::State<AppState>) {
    state.player.clear_preload()
}

#[tauri::command]
fn has_preloaded(state: tauri::State<AppState>) -> bool {
    state.player.has_preloaded()
}

#[tauri::command]
async fn scan_folder(
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
async fn scan_folder_incremental(
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
fn get_all_tracks(state: tauri::State<AppState>) -> Result<Vec<Track>, String> {
    state.db.get_all_tracks().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_folders(state: tauri::State<AppState>) -> Result<Vec<(String, String, String, i64)>, String> {
    state.db.get_all_folders().map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_folder(folder_id: String, folder_path: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.db.remove_tracks_by_folder(&folder_path).map_err(|e| e.to_string())?;
    state.db.remove_folder(&folder_id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_playlist(name: String, state: tauri::State<AppState>) -> Result<String, String> {
    state.db.create_playlist(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_playlists(state: tauri::State<AppState>) -> Result<Vec<(String, String, i64)>, String> {
    state.db.get_all_playlists().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_playlist(playlist_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.db.delete_playlist(&playlist_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_playlist(playlist_id: String, new_name: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.db.rename_playlist(&playlist_id, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_track_to_playlist(playlist_id: String, track_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let position = state.db.get_playlist_track_count(&playlist_id).map_err(|e| e.to_string())?;
    state.db.add_track_to_playlist(&playlist_id, &track_id, position).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_track_from_playlist(playlist_id: String, track_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.db.remove_track_from_playlist(&playlist_id, &track_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_playlist_tracks(
    playlist_id: String, 
    track_positions: Vec<(String, i32)>, 
    state: tauri::State<AppState>
) -> Result<(), String> {
    state.db.reorder_playlist_tracks(&playlist_id, track_positions).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_playlist_tracks(playlist_id: String, state: tauri::State<AppState>) -> Result<Vec<Track>, String> {
    state.db.get_playlist_tracks(&playlist_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn increment_play_count(track_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.db.increment_play_count(&track_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_recently_played(limit: usize, state: tauri::State<AppState>) -> Result<Vec<Track>, String> {
    state.db.get_recently_played(limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_most_played(limit: usize, state: tauri::State<AppState>) -> Result<Vec<Track>, String> {
    state.db.get_most_played(limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_folder_watch(folder_path: String, state: tauri::State<AppState>, app_handle: AppHandle) -> Result<(), String> {
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
fn stop_folder_watch(folder_path: String, state: tauri::State<AppState>) -> Result<(), String> {
    let mut watcher = state.watcher.lock().map_err(|e| format!("Failed to lock watcher: {}", e))?;
    watcher.remove_path(&folder_path).map_err(|e| format!("Failed to remove path: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_watched_folders(state: tauri::State<AppState>) -> Result<Vec<String>, String> {
    let watcher = state.watcher.lock().map_err(|e| format!("Failed to lock watcher: {}", e))?;
    let paths = watcher.get_watched_paths()
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    Ok(paths)
}

#[tauri::command]
fn clear_failed_tracks(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.db.clear_failed_tracks().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_track_rating(track_id: String, rating: i32, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Setting track rating: {} -> {}", track_id, rating);
    state.db.set_track_rating(&track_id, rating).map_err(|e| e.to_string())
}

#[tauri::command]
fn check_missing_files(state: tauri::State<'_, AppState>) -> Result<Vec<(String, String)>, String> {
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
fn update_track_path(track_id: String, new_path: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Updating track path: {} -> {}", track_id, new_path);
    state.db.update_track_path(&track_id, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn find_duplicates(state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Track>>, String> {
    info!("Finding duplicate tracks");
    state.db.find_duplicates().map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_track(track_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Removing track: {}", track_id);
    state.db.remove_track(&track_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_album_art(track_id: String, state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    info!("Getting album art for track: {}", track_id);
    match state.db.get_album_art(&track_id) {
        Ok(Some(art_data)) => {
            use base64::{Engine as _, engine::general_purpose};
            let base64_data = general_purpose::STANDARD.encode(&art_data);
            Ok(Some(base64_data))
        },
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to get album art: {}", e)),
    }
}

#[tauri::command]
fn extract_and_cache_album_art(track_id: String, track_path: String, state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    info!("Extracting album art for: {}", track_path);
    
    // Check if already cached
    if state.db.has_album_art(&track_id) {
        return get_album_art(track_id, state);
    }
    
    // Extract from file
    match scanner::Scanner::extract_album_art(&track_path) {
        Ok(Some(art_data)) => {
            // Cache in database
            state.db.set_album_art(&track_id, &art_data)
                .map_err(|e| format!("Failed to cache album art: {}", e))?;
            
            use base64::{Engine as _, engine::general_purpose};
            let base64_data = general_purpose::STANDARD.encode(&art_data);
            Ok(Some(base64_data))
        },
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to extract album art: {}", e)),
    }
}

#[derive(serde::Deserialize)]
struct TagUpdate {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    year: Option<String>,
    genre: Option<String>,
    comment: Option<String>,
    track_number: Option<String>,
    disc_number: Option<String>,
}

#[tauri::command]
fn update_track_tags(track_id: String, track_path: String, tags: TagUpdate, state: tauri::State<'_, AppState>) -> Result<(), String> {
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
fn export_playlist(playlist_id: String, output_path: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Exporting playlist {} to {}", playlist_id, output_path);
    
    // Get playlist tracks from database
    let tracks = state.db.get_playlist_tracks(&playlist_id)
        .map_err(|e| format!("Failed to get playlist tracks: {}", e))?;
    
    // Convert to (title, path) tuples
    let track_data: Vec<(String, String)> = tracks.iter()
        .map(|t| {
            let title = t.title.as_ref()
                .unwrap_or(&t.name)
                .clone();
            (title, t.path.clone())
        })
        .collect();
    
    // Export to M3U
    PlaylistIO::export_m3u(&track_data, &output_path)
        .map_err(|e| format!("Failed to export playlist: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn import_playlist(playlist_name: String, input_path: String, state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    info!("Importing playlist from {} as {}", input_path, playlist_name);
    
    // Import M3U file
    let tracks = PlaylistIO::import_m3u(&input_path)
        .map_err(|e| format!("Failed to import playlist: {}", e))?;
    
    // Create playlist in database
    let playlist_id = state.db.create_playlist(&playlist_name)
        .map_err(|e| format!("Failed to create playlist: {}", e))?;
    
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
                            .map_err(|e| format!("Failed to add track: {}", e))?;
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
        
        // Add to playlist
        let position = imported_track_ids.len() as i32;
        state.db.add_track_to_playlist(&playlist_id, &track_id, position)
            .map_err(|e| format!("Failed to add track to playlist: {}", e))?;
        
        imported_track_ids.push(track_id);
    }
    
    info!("Successfully imported {} tracks", imported_track_ids.len());
    Ok(imported_track_ids)
}

#[tauri::command]
fn create_smart_playlist(playlist: SmartPlaylist, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.conn.lock().unwrap();
    smart_playlists::save_smart_playlist(&conn, &playlist)
        .map_err(|e| format!("Failed to create smart playlist: {}", e))
}

#[tauri::command]
fn get_all_smart_playlists(state: tauri::State<'_, AppState>) -> Result<Vec<SmartPlaylist>, String> {
    let conn = state.db.conn.lock().unwrap();
    smart_playlists::load_all_smart_playlists(&conn)
        .map_err(|e| format!("Failed to load smart playlists: {}", e))
}

#[tauri::command]
fn get_smart_playlist(id: String, state: tauri::State<'_, AppState>) -> Result<SmartPlaylist, String> {
    let conn = state.db.conn.lock().unwrap();
    smart_playlists::load_smart_playlist(&conn, &id)
        .map_err(|e| format!("Failed to load smart playlist: {}", e))
}

#[tauri::command]
fn update_smart_playlist(playlist: SmartPlaylist, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.conn.lock().unwrap();
    smart_playlists::save_smart_playlist(&conn, &playlist)
        .map_err(|e| format!("Failed to update smart playlist: {}", e))
}

#[tauri::command]
fn delete_smart_playlist(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.conn.lock().unwrap();
    smart_playlists::delete_smart_playlist(&conn, &id)
        .map_err(|e| format!("Failed to delete smart playlist: {}", e))
}

#[tauri::command]
fn execute_smart_playlist(id: String, state: tauri::State<'_, AppState>) -> Result<Vec<Track>, String> {
    let conn = state.db.conn.lock().unwrap();
    
    // Load the smart playlist
    let playlist = smart_playlists::load_smart_playlist(&conn, &id)
        .map_err(|e| format!("Failed to load smart playlist: {}", e))?;
    
    // Generate SQL query
    let query = playlist.to_sql()
        .map_err(|e| format!("Failed to generate query: {}", e))?;
    
    // Execute query
    let mut stmt = conn.prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;
    
    let tracks = stmt.query_map([], |row| {
        Ok(Track {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            title: row.get(3)?,
            artist: row.get(4)?,
            album: row.get(5)?,
            duration: row.get(6)?,
            date_added: row.get(7)?,
            rating: row.get(8).unwrap_or(0),
        })
    })
    .map_err(|e| format!("Failed to execute query: {}", e))?
    .collect::<rusqlite::Result<Vec<_>>>()
    .map_err(|e| format!("Failed to collect results: {}", e))?;
    
    Ok(tracks)
}

#[tauri::command]
fn get_performance_stats(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let conn = state.db.conn.lock().unwrap();
    
    // Get database stats
    let track_count: i32 = conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
        .unwrap_or(0);
    let playlist_count: i32 = conn.query_row("SELECT COUNT(*) FROM playlists", [], |row| row.get(0))
        .unwrap_or(0);
    let smart_playlist_count: i32 = conn.query_row("SELECT COUNT(*) FROM smart_playlists", [], |row| row.get(0))
        .unwrap_or(0);
    
    // Get database file size
    let db_size: i64 = conn.query_row("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()", [], |row| row.get(0))
        .unwrap_or(0);
    
    // Get index usage stats
    let index_count: i32 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'", [], |row| row.get(0))
        .unwrap_or(0);
    
    // Calculate average query times (simplified - just track count queries)
    let start = std::time::Instant::now();
    let mut stmt = conn.prepare("SELECT id FROM tracks LIMIT 1000").map_err(|e| format!("Query error: {}", e))?;
    let _track_ids: Vec<String> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(Result::ok)
        .collect();
    let query_time_ms = start.elapsed().as_millis();
    drop(stmt);
    
    // Memory stats (approximation)
    let memory_usage = std::mem::size_of_val(&*conn) + (track_count as usize * 1024); // Rough estimate
    
    Ok(serde_json::json!({
        "database": {
            "tracks": track_count,
            "playlists": playlist_count,
            "smart_playlists": smart_playlist_count,
            "size_bytes": db_size,
            "size_mb": (db_size as f64 / 1024.0 / 1024.0),
            "indexes": index_count,
        },
        "performance": {
            "query_time_ms": query_time_ms,
            "memory_usage_bytes": memory_usage,
            "memory_usage_mb": (memory_usage as f64 / 1024.0 / 1024.0),
        },
        "recommendations": {
            "vacuum_recommended": db_size > 10_000_000, // > 10MB
            "optimize_queries": query_time_ms > 100,
        }
    }))
}

#[tauri::command]
fn vacuum_database(state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Running database vacuum to reclaim space and optimize");
    let conn = state.db.conn.lock().unwrap();
    conn.execute("VACUUM", [])
        .map_err(|e| format!("Failed to vacuum database: {}", e))?;
    info!("Database vacuum completed successfully");
    Ok(())
}

/**
 * Load lyrics from an LRC file for a given track.
 * Returns the parsed LRC data including lines and metadata.
 */
#[tauri::command]
fn load_lyrics(track_path: String) -> Result<Lrc, String> {
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

/**
 * Get the current lyric line for a given timestamp.
 * Returns the lyric line that should be displayed at the specified time.
 */
#[tauri::command]
fn get_lyric_at_time(track_path: String, time: f64) -> Result<Option<(f64, String)>, String> {
    let lrc_path = std::path::Path::new(&track_path)
        .with_extension("lrc");
    
    if !lrc_path.exists() {
        return Ok(None);
    }
    
    let lrc = Lrc::from_file(&lrc_path)
        .map_err(|e| format!("Failed to load lyrics: {}", e))?;
    
    Ok(lrc.get_lyric_at(time).map(|line| (line.timestamp, line.text.clone())))
}

/**
 * Set audio effects configuration
 */
#[tauri::command]
fn set_audio_effects(config: EffectsConfig, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.player.set_effects(config);
    Ok(())
}

/**
 * Get current audio effects configuration
 */
#[tauri::command]
fn get_audio_effects(state: tauri::State<'_, AppState>) -> Result<EffectsConfig, String> {
    Ok(state.player.get_effects())
}

/**
 * Enable or disable audio effects
 */
#[tauri::command]
fn set_effects_enabled(enabled: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.player.set_effects_enabled(enabled);
    Ok(())
}

/**
 * Check if audio effects are enabled
 */
#[tauri::command]
fn is_effects_enabled(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    Ok(state.player.is_effects_enabled())
}

/**
 * Process audio samples for visualization
 */
#[tauri::command]
fn get_visualizer_data(samples: Vec<f32>, delta_time: f32, state: tauri::State<'_, AppState>) -> Result<VisualizerData, String> {
    let mut vis = state.visualizer.lock().unwrap();
    Ok(vis.process(&samples, delta_time))
}

/**
 * Set visualizer mode
 */
#[tauri::command]
fn set_visualizer_mode(mode: VisualizerMode, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut vis = state.visualizer.lock().unwrap();
    vis.set_mode(mode);
    Ok(())
}

/**
 * Set beat detection sensitivity
 */
#[tauri::command]
fn set_beat_sensitivity(sensitivity: f32, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut vis = state.visualizer.lock().unwrap();
    vis.set_beat_sensitivity(sensitivity);
    Ok(())
}

/**
 * Analyze track for ReplayGain data and store in database
 */
#[tauri::command]
fn analyze_replaygain(track_path: String, state: tauri::State<'_, AppState>) -> Result<ReplayGainData, String> {
    info!("Analyzing ReplayGain for: {}", track_path);
    
    let data = analyze_track(&track_path)?;
    store_replaygain(&state.db.conn, &track_path, &data)?;
    
    Ok(data)
}

/**
 * Get ReplayGain data for a track
 */
#[tauri::command]
fn get_track_replaygain(track_path: String, state: tauri::State<'_, AppState>) -> Result<Option<ReplayGainData>, String> {
    get_replaygain(&state.db.conn, &track_path)
}

/**
 * Clear album art cache
 */
#[tauri::command]
fn clear_album_art_cache(app: AppHandle) -> Result<(), String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?
        .join("album_art");
    
    if cache_dir.exists() {
        std::fs::remove_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to clear cache: {}", e))?;
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to recreate cache dir: {}", e))?;
    }
    Ok(())
}

/**
 * Get cache size in bytes
 */
#[tauri::command]
fn get_cache_size(app: AppHandle) -> Result<u64, String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?;
    
    fn dir_size(path: &std::path::Path) -> std::io::Result<u64> {
        let mut size = 0;
        if path.is_dir() {
            for entry in std::fs::read_dir(path)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    size += dir_size(&path)?;
                } else {
                    size += entry.metadata()?.len();
                }
            }
        }
        Ok(size)
    }
    
    dir_size(&cache_dir).map_err(|e| format!("Failed to calculate size: {}", e))
}

/**
 * Get database size in bytes
 */
#[tauri::command]
fn get_database_size(app: AppHandle) -> Result<u64, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("vplayer.db");
    
    std::fs::metadata(db_path)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to get database size: {}", e))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            info!("Initializing VPlayer application");
            // Initialize audio player
            let player = AudioPlayer::new()
                .map_err(|e| format!("Failed to initialize audio player: {}", e))?;
            
            // Initialize database
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("Failed to create app data dir: {}", e))?;
            
            let db_path = app_data_dir.join("vplayer.db");
            let db = Database::new(&db_path)
                .map_err(|e| format!("Failed to initialize database: {}", e))?;
            
            // Initialize folder watcher
            let watcher = FolderWatcher::new()
                .map_err(|e| format!("Failed to initialize folder watcher: {}", e))?;
            
            // Initialize visualizer
            let visualizer = Visualizer::new(44100, 64);
            
            app.manage(AppState {
                player: Arc::new(player),
                db: Arc::new(db),
                watcher: Arc::new(Mutex::new(watcher)),
                visualizer: Arc::new(Mutex::new(visualizer)),
            });
            
            // Register global shortcuts
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
            
            let app_handle = app.handle().clone();
            
            // Play/Pause - Media Play/Pause key
            if let Ok(shortcut) = "MediaPlayPause".parse::<Shortcut>() {
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    // Emit event to frontend
                    let _ = app_handle.emit("global-shortcut", "play-pause");
                });
            }
            
            // Next Track - Media Next Track key
            if let Ok(shortcut) = "MediaTrackNext".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    let _ = app_handle.emit("global-shortcut", "next-track");
                });
            }
            
            // Previous Track - Media Previous Track key
            if let Ok(shortcut) = "MediaTrackPrevious".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    let _ = app_handle.emit("global-shortcut", "prev-track");
                });
            }
            
            // Stop - Media Stop key
            if let Ok(shortcut) = "MediaStop".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    let _ = app_handle.emit("global-shortcut", "stop");
                });
            }
            
            // Volume Up - Volume Up key
            if let Ok(shortcut) = "VolumeUp".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    let _ = app_handle.emit("global-shortcut", "volume-up");
                });
            }
            
            // Volume Down - Volume Down key
            if let Ok(shortcut) = "VolumeDown".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    let _ = app_handle.emit("global-shortcut", "volume-down");
                });
            }
            
            // Mute - Volume Mute key
            if let Ok(shortcut) = "VolumeMute".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    let _ = app_handle.emit("global-shortcut", "mute");
                });
            }
            
            // Setup system tray
            let app_handle = app.handle().clone();
            
            // Build tray menu
            let show_item = MenuItem::with_id(app, "show", "Show Player", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("VPlayer")
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click { button, button_state, .. } = event {
                        if button == MouseButton::Left && button_state == MouseButtonState::Up {
                            // Show/hide main window on left click
                            if let Some(window) = app_handle.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    }
                })
                .build(app)
                .map_err(|e| format!("Failed to build tray icon: {}", e))?;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_track,
            play_audio,
            pause_audio,
            stop_audio,
            set_volume,
            seek_to,
            get_position,
            get_duration,
            is_playing,
            is_finished,
            get_audio_devices,
            set_audio_device,
            scan_folder,
            scan_folder_incremental,
            get_all_tracks,
            get_all_folders,
            remove_folder,
            create_playlist,
            get_all_playlists,
            delete_playlist,
            rename_playlist,
            add_track_to_playlist,
            remove_track_from_playlist,
            reorder_playlist_tracks,
            get_playlist_tracks,
            increment_play_count,
            get_recently_played,
            get_most_played,
            start_folder_watch,
            stop_folder_watch,
            get_watched_folders,
            clear_failed_tracks,
            set_track_rating,
            check_missing_files,
            update_track_path,
            find_duplicates,
            remove_track,
            get_album_art,
            extract_and_cache_album_art,
            update_track_tags,
            preload_track,
            swap_to_preloaded,
            clear_preload,
            has_preloaded,
            export_playlist,
            import_playlist,
            create_smart_playlist,
            get_all_smart_playlists,
            get_smart_playlist,
            update_smart_playlist,
            delete_smart_playlist,
            execute_smart_playlist,
            get_performance_stats,
            vacuum_database,
            load_lyrics,
            get_lyric_at_time,
            analyze_replaygain,
            get_track_replaygain,
            set_audio_effects,
            get_audio_effects,
            set_effects_enabled,
            is_effects_enabled,
            get_visualizer_data,
            set_visualizer_mode,
            set_beat_sensitivity,
            clear_album_art_cache,
            get_cache_size,
            get_database_size,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::WindowEvent { label: _, event, .. } = event {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Get main window and hide it
                    if let Some(window) = app_handle.get_webview_window("main") {
                        window.hide().unwrap();
                        api.prevent_close();
                    }
                }
            }
        });
}