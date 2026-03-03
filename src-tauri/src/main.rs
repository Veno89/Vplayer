#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// Core modules
mod audio;
mod scanner;
mod context_log;
mod database;
mod database_album_art;
mod database_failed_tracks;
mod database_folders;
mod database_playlist;
mod database_schema;
mod database_tracks;
mod error;
mod watcher;
mod playlist_io;
mod query_builder;
mod smart_playlists;
mod validation;
mod lyrics;
mod replaygain;
mod replaygain_store;
mod tag_service;
mod effects;
mod visualizer;
mod commands;
mod time_utils;

use audio::AudioPlayer;
use database::Database;
use watcher::FolderWatcher;
use visualizer::Visualizer;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, Emitter};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::menu::{Menu, MenuItem};
use log::{info, warn};
use serde::{Deserialize, Serialize};

/// Payload emitted every ~100 ms while a track is loaded.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PlaybackTick {
    position: f64,
    duration: f64,
    is_playing: bool,
    is_finished: bool,
    is_paused: bool,
}

// Re-export commands for use in invoke_handler
use commands::{
    // Audio commands
    load_track, play_audio, pause_audio, stop_audio, set_volume, seek_to,
    get_position, get_duration, is_playing, is_finished, recover_audio,
    get_audio_devices, set_audio_device, preload_track, swap_to_preloaded,
    clear_preload, has_preloaded, get_preloaded_path, set_balance, get_balance,
    is_audio_healthy, needs_audio_reinit, get_inactive_duration,
    has_audio_device_changed, is_audio_device_available, get_audio_health,
    // Library commands
    scan_folder, scan_folder_incremental, get_all_tracks, get_filtered_tracks, get_tracks_page, get_all_folders,
    remove_folder, clear_failed_tracks, set_track_rating, check_missing_files,
    update_track_path, find_duplicates, remove_track, remove_duplicate_folders, increment_play_count,
    get_recently_played, get_most_played, get_album_art, get_album_art_batch, extract_and_cache_album_art,
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
    get_visualizer_data, set_visualizer_mode, set_beat_sensitivity, get_track_waveform,
    // Lyrics commands
    load_lyrics, get_lyric_at_time,
    // ReplayGain commands
    analyze_replaygain, get_track_replaygain, get_album_replaygain, analyze_album_replaygain, set_replaygain, clear_replaygain,
    // Cache commands
    clear_album_art_cache, get_cache_size, get_database_size, get_performance_stats,
    vacuum_database, enforce_cache_limit,
    // Tray commands
    set_tray_settings, get_tray_settings,
};

/// Application state shared across all Tauri commands
pub struct AppState {
    pub player: Arc<AudioPlayer>,
    pub db: Arc<database::Database>,
    pub watcher: Arc<Mutex<FolderWatcher>>,
    pub visualizer: Arc<Mutex<Visualizer>>,
    pub tray_settings: Arc<Mutex<TraySettings>>,
}

/// Settings that control system-tray behaviour.
/// Updated at runtime from the JS frontend via IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraySettings {
    pub close_to_tray: bool,
    pub minimize_to_tray: bool,
    pub start_minimized: bool,
}

impl Default for TraySettings {
    fn default() -> Self {
        Self {
            close_to_tray: false,
            minimize_to_tray: true,
            start_minimized: false,
        }
    }
}

// ── IPC commands for tray settings and cache enforcement ──────────────────
// Moved to commands/tray.rs and commands/cache.rs


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
            let player = Arc::new(AudioPlayer::new()
                .map_err(|e| format!("Failed to initialize audio player: {}", e))?);
            
            // Keep a clone for the position-broadcast thread
            let player_for_broadcast = player.clone();
            
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
                player: player.clone(),
                db: Arc::new(db),
                watcher: Arc::new(Mutex::new(watcher)),
                visualizer: Arc::new(Mutex::new(visualizer)),
                tray_settings: Arc::new(Mutex::new(TraySettings::default())),
            });
            
            // ── Position-broadcast thread (#4) ──────────────────────────
            // Emits `playback-tick` every ~100 ms while playing, and
            // `track-ended` when the sink empties after playback.
            //
            // Uses `broadcast_snapshot()` to capture is_playing, is_finished,
            // position, and duration under a single lock — preventing the race
            // where state changes between separate queries.
            //
            // Adaptive sleep: 100ms while playing for smooth UI updates,
            // 1000ms while idle to save CPU during long pauses/overnight.
            //
            // Device-loss guard: when we detect a transition from playing to
            // finished, we check if the audio device is still available before
            // emitting `track-ended`. If the device disappeared, we emit
            // `device-lost` instead so the frontend can show a reconnect
            // prompt rather than advancing to the next track.
            let broadcast_handle = app.handle().clone();
            let broadcast_wake = player_for_broadcast.broadcast_wake();
            std::thread::spawn(move || {
                let mut was_playing = false;
                // ── Device-loss auto-recovery state ──────────────────
                let mut device_lost = false;
                let mut device_check_counter: u32 = 0;

                loop {
                    // ── Device-lost recovery mode ────────────────────
                    // While the device is gone we poll every 1 s for it
                    // to reappear.  When it does, play() handles the
                    // full reinit → reload → seek → resume cycle.
                    if device_lost {
                        if player_for_broadcast.is_device_available() {
                            info!("Audio device reappeared — attempting auto-recovery");
                            match player_for_broadcast.play() {
                                Ok(()) => {
                                    info!("Auto-recovery successful — playback resumed");
                                    let _ = broadcast_handle.emit("device-recovered", ());
                                    device_lost = false;
                                    was_playing = true;
                                }
                                Err(e) => {
                                    warn!("Auto-recovery play() failed: {} — will retry", e);
                                }
                            }
                        }
                        std::thread::sleep(Duration::from_millis(1000));
                        continue;
                    }

                    let snap = player_for_broadcast.broadcast_snapshot();

                    // ── Proactive device-loss detection while playing ─
                    // Every ~1 s (10 ticks × 100 ms) check whether the
                    // audio device disappeared or changed underneath us.
                    if snap.is_playing {
                        device_check_counter += 1;
                        if device_check_counter >= 10 {
                            device_check_counter = 0;
                            if !player_for_broadcast.is_device_available()
                                || player_for_broadcast.has_device_changed()
                            {
                                info!("Device lost/changed during playback — pausing for recovery");
                                // Pause so the position clock stops (prevents drift)
                                let _ = player_for_broadcast.pause();
                                player_for_broadcast.clear_preload();
                                let _ = broadcast_handle.emit("device-lost", ());
                                device_lost = true;
                                was_playing = false;
                                std::thread::sleep(Duration::from_millis(1000));
                                continue;
                            }
                        }

                        // Emit tick
                        let tick = PlaybackTick {
                            position: snap.position,
                            duration: snap.duration,
                            is_playing: true,
                            is_finished: false,
                            is_paused: false,
                        };
                        let _ = broadcast_handle.emit("playback-tick", tick);
                    } else {
                        device_check_counter = 0;
                    }

                    // Detect track-end transition: was playing → now finished
                    if was_playing && !snap.is_playing && snap.is_finished && !snap.is_paused {
                        // Guard: if the device disappeared, the sink empties but
                        // the track didn't truly finish — it was interrupted.
                        if player_for_broadcast.is_device_available() {
                            let _ = broadcast_handle.emit("track-ended", ());
                        } else {
                            info!("Device lost during playback — suppressing track-ended");
                            let _ = broadcast_handle.emit("device-lost", ());
                            device_lost = true;
                            was_playing = false;
                            std::thread::sleep(Duration::from_millis(1000));
                            continue;
                        }
                    }

                    was_playing = snap.is_playing;

                    // Adaptive sleep: fast ticks while playing, condvar-wait while idle
                    if snap.is_playing {
                        std::thread::sleep(Duration::from_millis(100));
                    } else {
                        // Block until play/load wakes us or a 30 s timeout fires
                        // (timeout is a safety net for edge cases like external
                        // device reconnection that bypasses our signal path).
                        broadcast_wake.wait_idle(Duration::from_secs(30));
                    }
                }
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
            get_audio_health,
            get_audio_devices,
            set_audio_device,
            scan_folder,
            scan_folder_incremental,
            get_all_tracks,
            get_filtered_tracks,
            get_tracks_page,
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
            get_album_art_batch,
            extract_and_cache_album_art,
            update_track_tags,
            show_in_folder,
            reset_play_count,
            write_text_file,
            preload_track,
            swap_to_preloaded,
            clear_preload,
            has_preloaded,
            get_preloaded_path,
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
            get_album_replaygain,
            analyze_album_replaygain,
            set_replaygain,
            clear_replaygain,
            set_audio_effects,
            get_audio_effects,
            set_effects_enabled,
            is_effects_enabled,
            get_visualizer_data,
            set_visualizer_mode,
            set_beat_sensitivity,
            get_track_waveform,
            clear_album_art_cache,
            get_cache_size,
            get_database_size,
            set_tray_settings,
            get_tray_settings,
            enforce_cache_limit,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::WindowEvent { label: _, event, .. } = event {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Check whether the user wants to hide to tray on close
                    let should_hide = app_handle
                        .try_state::<AppState>()
                        .map(|s| s.tray_settings.lock().unwrap().close_to_tray)
                        .unwrap_or(false);

                    if should_hide {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.hide();
                        }
                        api.prevent_close();
                    }
                    // else: allow the window to close normally → app exits
                }
            }
        });
}