#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// Core modules
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
mod commands;

use audio::AudioPlayer;
use database::Database;
use watcher::FolderWatcher;
use visualizer::Visualizer;
use std::sync::{Arc, Mutex};
use tauri::{Manager, Emitter};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::menu::{Menu, MenuItem};
use log::info;

// Re-export commands for use in invoke_handler
use commands::{
    // Audio commands
    load_track, play_audio, pause_audio, stop_audio, set_volume, seek_to,
    get_position, get_duration, is_playing, is_finished, recover_audio,
    get_audio_devices, set_audio_device, preload_track, swap_to_preloaded,
    clear_preload, has_preloaded, set_balance, get_balance,
    is_audio_healthy, needs_audio_reinit, get_inactive_duration,
    has_audio_device_changed, is_audio_device_available,
    // Library commands
    scan_folder, scan_folder_incremental, get_all_tracks, get_all_folders,
    remove_folder, clear_failed_tracks, set_track_rating, check_missing_files,
    update_track_path, find_duplicates, remove_track, remove_duplicate_folders, increment_play_count,
    get_recently_played, get_most_played, get_album_art, extract_and_cache_album_art,
    update_track_tags, show_in_folder, reset_play_count, write_text_file,
    // Playlist commands
    create_playlist, get_all_playlists, delete_playlist, rename_playlist,
    add_track_to_playlist, add_tracks_to_playlist, remove_track_from_playlist,
    reorder_playlist_tracks, get_playlist_tracks, export_playlist, import_playlist,
    // Smart playlist commands
    create_smart_playlist, get_all_smart_playlists, get_smart_playlist,
    update_smart_playlist, delete_smart_playlist, execute_smart_playlist,
    // Watcher commands
    start_folder_watch, stop_folder_watch, get_watched_folders,
    // Effects commands
    set_audio_effects, get_audio_effects, set_effects_enabled, is_effects_enabled,
    // Visualizer commands
    get_visualizer_data, set_visualizer_mode, set_beat_sensitivity,
    // Lyrics commands
    load_lyrics, get_lyric_at_time,
    // ReplayGain commands
    analyze_replaygain, get_track_replaygain, set_replaygain, clear_replaygain,
    // Cache commands
    clear_album_art_cache, get_cache_size, get_database_size, get_performance_stats,
    vacuum_database,
};

/// Application state shared across all Tauri commands
pub struct AppState {
    pub player: Arc<AudioPlayer>,
    pub db: Arc<database::Database>,
    pub watcher: Arc<Mutex<FolderWatcher>>,
    pub visualizer: Arc<Mutex<Visualizer>>,
}


fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            recover_audio,
            is_audio_healthy,
            needs_audio_reinit,
            get_inactive_duration,
            has_audio_device_changed,
            is_audio_device_available,
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
            add_tracks_to_playlist,
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
            remove_duplicate_folders,
            get_album_art,
            extract_and_cache_album_art,
            update_track_tags,
            show_in_folder,
            reset_play_count,
            write_text_file,
            preload_track,
            swap_to_preloaded,
            clear_preload,
            has_preloaded,
            set_balance,
            get_balance,
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
            set_replaygain,
            clear_replaygain,
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