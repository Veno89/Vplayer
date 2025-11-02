#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod audio;
mod scanner;
mod database;

use audio::AudioPlayer;
use scanner::{Scanner, Track};
use database::Database;
use std::sync::Arc;
use tauri::Manager;

struct AppState {
    player: Arc<AudioPlayer>,
    db: Arc<database::Database>,
}

#[tauri::command]
fn load_track(path: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.load(path)
}

#[tauri::command]
fn play_audio(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.play()
}

#[tauri::command]
fn pause_audio(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.pause()
}

#[tauri::command]
fn stop_audio(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.stop()
}

#[tauri::command]
fn set_volume(volume: f32, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.set_volume(volume)
}

#[tauri::command]
fn seek_to(position: f64, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.seek(position)
}

#[tauri::command]
fn is_playing(state: tauri::State<AppState>) -> bool {
    state.player.is_playing()
}

#[tauri::command]
async fn scan_folder(folder_path: String, state: tauri::State<'_, AppState>) -> Result<Vec<Track>, String> {
    let tracks = Scanner::scan_directory(&folder_path)?;
    
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
fn get_all_tracks(state: tauri::State<AppState>) -> Result<Vec<Track>, String> {
    state.db.get_all_tracks().map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_folder(folder_id: String, folder_path: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.db.remove_tracks_by_folder(&folder_path).map_err(|e| e.to_string())?;
    state.db.remove_folder(&folder_id).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .setup(|app| {
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
            
            app.manage(AppState {
                player: Arc::new(player),
                db: Arc::new(db),
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_track,
            play_audio,
            pause_audio,
            stop_audio,
            set_volume,
            seek_to,
            is_playing,
            scan_folder,
            get_all_tracks,
            remove_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

