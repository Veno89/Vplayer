#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// Core modules
mod audio;
mod commands;
mod context_log;
mod database;
mod database_album_art;
mod database_failed_tracks;
mod database_folders;
mod database_library_integrity;
mod database_playlist;
mod database_schema;
mod database_tracks;
mod effects;
mod error;
mod lyrics;
mod playlist_io;
mod query_builder;
mod replaygain;
mod replaygain_store;
mod scanner;
mod smart_playlists;
mod tag_service;
mod time_utils;
mod validation;
mod visualizer;
mod watcher;

use audio::AudioPlayer;
use audio::monitor::{MonitorEvent, PlaybackMonitor};
use database::Database;
use log::info;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use visualizer::Visualizer;
use watcher::FolderWatcher;

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

/// Payload of `track-ended`. `error` is set when the track could not be read
/// to its end; the frontend reports it and moves on.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TrackEndedPayload {
    load_request_id: u64,
    error: Option<String>,
}

fn emit_monitor_event(app: &tauri::AppHandle, event: MonitorEvent) {
    let _ = match event {
        MonitorEvent::Tick(snapshot) => app.emit(
            "playback-tick",
            PlaybackTick {
                position: snapshot.position,
                duration: snapshot.duration,
                is_playing: snapshot.is_playing,
                is_finished: snapshot.is_finished,
                is_paused: snapshot.is_paused,
            },
        ),
        MonitorEvent::TrackEnded {
            load_request_id,
            error,
        } => app.emit(
            "track-ended",
            TrackEndedPayload {
                load_request_id,
                error,
            },
        ),
        MonitorEvent::DeviceLost => app.emit("device-lost", ()),
        MonitorEvent::DeviceRecovered => app.emit("device-recovered", ()),
        MonitorEvent::PlaybackError(message) => app.emit("playback-error", message),
    };
}

fn emit_window_visibility(app: &tauri::AppHandle, visible: bool) {
    let _ = app.emit("app-window-visibility-changed", visible);
}

// Re-export commands for use in invoke_handler
use commands::{
    add_track_to_playlist,
    add_tracks_to_playlist,
    analyze_album_replaygain,
    // ReplayGain commands
    analyze_replaygain,
    cancel_scan,
    check_missing_files,
    // Cache/System commands
    clear_album_art_cache,
    clear_failed_tracks,
    clear_preload,
    clear_replaygain,
    // Playlist commands
    create_playlist,
    // Smart playlist commands
    create_smart_playlist,
    delete_playlist,
    delete_smart_playlist,
    enforce_cache_limit,
    execute_smart_playlist,
    export_playlist,
    extract_and_cache_album_art,
    find_duplicates,
    get_album_art,
    get_album_art_batch,
    get_album_replaygain,
    get_all_folders,
    get_all_playlists,
    get_all_smart_playlists,
    get_all_tracks,
    get_audio_devices,
    get_audio_effects,
    get_audio_health,
    get_balance,
    get_cache_size,
    get_database_size,
    get_duration,
    get_filtered_tracks,
    get_library_integrity,
    get_most_played,
    get_performance_stats,
    get_playlist_tracks,
    get_position,
    get_preloaded_path,
    get_recently_played,
    get_runtime_diagnostics,
    get_smart_playlist,
    get_track_ids_for_folder,
    get_track_replaygain,
    get_track_waveform,
    get_tracks_page,
    get_tray_settings,
    // Visualizer commands
    get_visualizer_data,
    get_watched_folders,
    has_preloaded,
    import_playlist,
    increment_play_count,
    is_effects_enabled,
    is_finished,
    is_playing,
    // Lyrics commands
    load_lyrics,
    // Audio commands
    load_track,
    pause_audio,
    play_audio,
    preload_track,
    recover_audio,
    remove_duplicate_folders,
    remove_folder,
    remove_library_duplicates,
    remove_track,
    remove_track_from_playlist,
    rename_playlist,
    reorder_playlist_tracks,
    repair_library_integrity,
    reset_play_count,
    // Library commands
    scan_folder,
    scan_folder_incremental,
    seek_to,
    set_audio_device,
    // Effects commands
    set_audio_effects,
    set_balance,
    set_beat_sensitivity,
    set_effects_enabled,
    set_replaygain,
    set_track_rating,
    // Tray commands
    set_tray_settings,
    set_visualizer_active,
    set_visualizer_mode,
    set_volume,
    show_in_folder,
    // Watcher commands
    start_folder_watch,
    stop_audio,
    stop_folder_watch,
    swap_to_preloaded,
    update_smart_playlist,
    update_track_path,
    update_track_tags,
    vacuum_database,
    write_text_file,
};

/// Application state shared across all Tauri commands
pub struct AppState {
    pub player: Arc<AudioPlayer>,
    pub db: Arc<database::Database>,
    pub watcher: Arc<Mutex<FolderWatcher>>,
    pub visualizer: Arc<Mutex<Visualizer>>,
    pub tray_settings: Arc<Mutex<TraySettings>>,
    pub scan_operations:
        Arc<Mutex<std::collections::HashMap<String, Arc<std::sync::atomic::AtomicBool>>>>,
    pub app_start_time: i64,
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
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            info!("Initializing VPlayer application");
            let player = Arc::new(
                AudioPlayer::new()
                    .map_err(|e| format!("Failed to initialize audio player: {}", e))?,
            );

            // Keep a clone for the position-broadcast thread
            let player_for_broadcast = player.clone();

            // Initialize database
            let app_data_dir = app
                .path()
                .app_data_dir()
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
                scan_operations: Arc::new(Mutex::new(std::collections::HashMap::new())),
                app_start_time: crate::time_utils::now_millis(),
            });

            // ── Playback monitor thread ────────────────────────────────
            // Emits `playback-tick` every ~100 ms while playing, reports the
            // end of each track exactly once (`track-ended`), and supervises
            // the output device (`device-lost` / `device-recovered` /
            // `playback-error`). While idle it blocks on the broadcast condvar,
            // which play/load signal.
            let broadcast_handle = app.handle().clone();
            let broadcast_wake = player_for_broadcast.broadcast_wake();
            std::thread::Builder::new()
                .name("vplayer-playback-monitor".to_string())
                .spawn(move || {
                    let mut monitor = PlaybackMonitor::new();
                    loop {
                        let (events, wait) = monitor.step(&player_for_broadcast);
                        for event in events {
                            emit_monitor_event(&broadcast_handle, event);
                        }
                        broadcast_wake.wait_idle(wait);
                    }
                })
                .map_err(|e| format!("Failed to start playback monitor: {e}"))?;

            // Register global shortcuts
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

            let app_handle = app.handle().clone();

            // Play/Pause - Media Play/Pause key
            if let Ok(shortcut) = "MediaPlayPause".parse::<Shortcut>() {
                let _ =
                    app.global_shortcut()
                        .on_shortcut(shortcut, move |_app, _shortcut, _event| {
                            // Emit event to frontend
                            let _ = app_handle.emit("global-shortcut", "play-pause");
                        });
            }

            // Next Track - Media Next Track key
            if let Ok(shortcut) = "MediaTrackNext".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ =
                    app.global_shortcut()
                        .on_shortcut(shortcut, move |_app, _shortcut, _event| {
                            let _ = app_handle.emit("global-shortcut", "next-track");
                        });
            }

            // Previous Track - Media Previous Track key
            if let Ok(shortcut) = "MediaTrackPrevious".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ =
                    app.global_shortcut()
                        .on_shortcut(shortcut, move |_app, _shortcut, _event| {
                            let _ = app_handle.emit("global-shortcut", "prev-track");
                        });
            }

            // Stop - Media Stop key
            if let Ok(shortcut) = "MediaStop".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ =
                    app.global_shortcut()
                        .on_shortcut(shortcut, move |_app, _shortcut, _event| {
                            let _ = app_handle.emit("global-shortcut", "stop");
                        });
            }

            // Volume Up - Volume Up key
            if let Ok(shortcut) = "VolumeUp".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ =
                    app.global_shortcut()
                        .on_shortcut(shortcut, move |_app, _shortcut, _event| {
                            let _ = app_handle.emit("global-shortcut", "volume-up");
                        });
            }

            // Volume Down - Volume Down key
            if let Ok(shortcut) = "VolumeDown".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ =
                    app.global_shortcut()
                        .on_shortcut(shortcut, move |_app, _shortcut, _event| {
                            let _ = app_handle.emit("global-shortcut", "volume-down");
                        });
            }

            // Mute - Volume Mute key
            if let Ok(shortcut) = "VolumeMute".parse::<Shortcut>() {
                let app_handle = app.handle().clone();
                let _ =
                    app.global_shortcut()
                        .on_shortcut(shortcut, move |_app, _shortcut, _event| {
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
                .icon(
                    app.default_window_icon()
                        .ok_or("No window icon configured — add an icon to tauri.conf.json")?
                        .clone(),
                )
                .tooltip("VPlayer")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            emit_window_visibility(app, true);
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button,
                        button_state,
                        ..
                    } = event
                        && button == MouseButton::Left
                        && button_state == MouseButtonState::Up
                    {
                        // Show/hide main window on left click
                        if let Some(window) = app_handle.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                                emit_window_visibility(&app_handle, false);
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                                emit_window_visibility(&app_handle, true);
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
            get_audio_health,
            get_audio_devices,
            set_audio_device,
            scan_folder,
            scan_folder_incremental,
            cancel_scan,
            get_track_ids_for_folder,
            get_all_tracks,
            get_filtered_tracks,
            get_library_integrity,
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
            remove_library_duplicates,
            repair_library_integrity,
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
            get_runtime_diagnostics,
            vacuum_database,
            load_lyrics,
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
            set_visualizer_active,
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
            if let tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } = event
            {
                // Check whether the user wants to hide to tray on close
                let should_hide = app_handle
                    .try_state::<AppState>()
                    .map(|s| {
                        s.tray_settings
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .close_to_tray
                    })
                    .unwrap_or(false);

                if should_hide {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                        emit_window_visibility(app_handle, false);
                    }
                    api.prevent_close();
                }
                // else: allow the window to close normally → app exits
            }
        });
}
