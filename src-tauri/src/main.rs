#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod audio;
mod scanner;
mod database;
mod error;
mod watcher;

use audio::{AudioPlayer, AudioDevice};
use scanner::{Scanner, Track};
use database::Database;
use watcher::FolderWatcher;
use std::sync::Arc;
use tauri::{Manager, Window, Emitter, AppHandle};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use log::info;

struct AppState {
    player: Arc<AudioPlayer>,
    db: Arc<database::Database>,
    watcher: Arc<Mutex<FolderWatcher>>,
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
            
            app.manage(AppState {
                player: Arc::new(player),
                db: Arc::new(db),
                watcher: Arc::new(Mutex::new(watcher)),
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
            
            // Setup system tray
            let app_handle = app.handle().clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("VPlayer")
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click { button, .. } = event {
                        if button == tauri::tray::MouseButton::Left {
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