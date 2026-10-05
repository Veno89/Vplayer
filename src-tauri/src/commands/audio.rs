// Audio playback commands
use crate::AppState;
use crate::audio::{AudioDevice, AudioPlayer};
use crate::error::{AppError, AppResult};
use crate::validation;
use log::info;
use serde::Serialize;

/// Combined audio health status — avoids multiple IPC round-trips.
#[derive(Debug, Clone, Serialize)]
pub struct AudioHealthStatus {
    pub healthy: bool,
    pub needs_reinit: bool,
    pub inactive_duration: f64,
    pub device_changed: bool,
    pub device_available: bool,
}

/// Run blocking audio work on the blocking pool. Synchronous Tauri commands
/// execute on the main thread, so device enumeration, file I/O, and stream
/// setup there would freeze the window.
async fn run_audio<T, F>(state: &tauri::State<'_, AppState>, work: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce(&AudioPlayer) -> AppResult<T> + Send + 'static,
{
    let player = state.player.clone();
    tauri::async_runtime::spawn_blocking(move || work(&player))
        .await
        .map_err(|e| AppError::Audio(format!("Thread panic: {}", e)))?
}

/// Get all audio health info in a single IPC call (one device enumeration).
#[tauri::command]
pub async fn get_audio_health(state: tauri::State<'_, AppState>) -> AppResult<AudioHealthStatus> {
    run_audio(&state, |player| {
        let (needs_reinit, device_changed, device_available) = player.health_report();
        Ok(AudioHealthStatus {
            healthy: player.is_healthy(),
            needs_reinit,
            inactive_duration: player.get_inactive_duration(),
            device_changed,
            device_available,
        })
    })
    .await
}

#[tauri::command]
pub async fn load_track(
    track_id: String,
    path: String,
    request_id: u64,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    info!("Loading track: {}", path);
    // Validate path exists before loading
    validation::validate_path(&path).map_err(|e| AppError::Validation(e.to_string()))?;
    let path = super::path_authority::authorize_track_path(&state.db, &track_id, &path)?;

    // Run blocking audio operations off the main IPC thread
    run_audio(&state, move |player| {
        player
            .load_request(path, request_id)
            .map_err(|e| AppError::Audio(e.to_string()))
    })
    .await
}

#[tauri::command]
pub async fn play_audio(state: tauri::State<'_, AppState>) -> AppResult<()> {
    run_audio(&state, |player| {
        player.play().map_err(|e| AppError::Audio(e.to_string()))
    })
    .await
}

#[tauri::command]
pub async fn pause_audio(state: tauri::State<'_, AppState>) -> AppResult<()> {
    run_audio(&state, |player| {
        player.pause().map_err(|e| AppError::Audio(e.to_string()))
    })
    .await
}

#[tauri::command]
pub async fn stop_audio(state: tauri::State<'_, AppState>) -> AppResult<()> {
    run_audio(&state, |player| {
        player.stop().map_err(|e| AppError::Audio(e.to_string()))
    })
    .await
}

#[tauri::command]
pub async fn set_volume(volume: f32, state: tauri::State<'_, AppState>) -> AppResult<()> {
    let valid_volume =
        validation::validate_volume(volume).map_err(|e| AppError::Validation(e.to_string()))?;
    state
        .player
        .set_volume(valid_volume)
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn set_balance(balance: f32, state: tauri::State<AppState>) -> AppResult<()> {
    // Balance is -1.0 (full left) to 1.0 (full right), 0.0 is center
    if !(-1.0..=1.0).contains(&balance) {
        return Err(AppError::Validation(
            "Balance must be between -1.0 and 1.0".to_string(),
        ));
    }
    state
        .player
        .set_balance(balance)
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn get_balance(state: tauri::State<AppState>) -> f32 {
    state.player.get_balance()
}

#[tauri::command]
pub async fn seek_to(position: f64, state: tauri::State<'_, AppState>) -> AppResult<()> {
    if position.is_nan() || position < 0.0 {
        return Err(AppError::Validation(
            "Seek position must be a non-negative number".to_string(),
        ));
    }
    run_audio(&state, move |player| {
        player
            .seek(position)
            .map_err(|e| AppError::Audio(e.to_string()))
    })
    .await
}

#[tauri::command]
pub fn get_position(state: tauri::State<AppState>) -> f64 {
    state.player.get_position()
}

#[tauri::command]
pub fn get_duration(state: tauri::State<AppState>) -> f64 {
    state.player.get_duration()
}

#[tauri::command]
pub fn is_playing(state: tauri::State<AppState>) -> bool {
    state.player.is_playing()
}

#[tauri::command]
pub fn is_finished(state: tauri::State<AppState>) -> bool {
    state.player.is_finished()
}

#[tauri::command]
pub async fn recover_audio(state: tauri::State<'_, AppState>) -> AppResult<bool> {
    info!("Attempting audio device recovery");
    run_audio(&state, |player| {
        player.recover().map_err(|e| AppError::Audio(e.to_string()))
    })
    .await
}

#[tauri::command]
pub async fn get_audio_devices() -> AppResult<Vec<AudioDevice>> {
    tauri::async_runtime::spawn_blocking(AudioPlayer::get_audio_devices)
        .await
        .map_err(|e| AppError::Audio(format!("Thread panic: {}", e)))?
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn set_audio_device(
    device_name: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    if device_name.trim().is_empty() {
        return Err(AppError::Validation(
            "Device name cannot be empty".to_string(),
        ));
    }
    run_audio(&state, move |player| {
        player
            .set_output_device(&device_name)
            .map_err(|e| AppError::Audio(e.to_string()))
    })
    .await
}

// Gapless playback commands
#[tauri::command]
pub async fn preload_track(
    track_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    // Mirror load_track validation to avoid preloading invalid/malicious paths.
    validation::validate_path(&path).map_err(|e| AppError::Validation(e.to_string()))?;
    let path = super::path_authority::authorize_track_path(&state.db, &track_id, &path)?;
    run_audio(&state, move |player| {
        player
            .preload(path)
            .map_err(|e| AppError::Audio(e.to_string()))
    })
    .await
}

#[tauri::command]
pub async fn swap_to_preloaded(state: tauri::State<'_, AppState>) -> AppResult<()> {
    run_audio(&state, |player| {
        player
            .swap_to_preloaded()
            .map_err(|e| AppError::Audio(e.to_string()))
    })
    .await
}

#[tauri::command]
pub fn clear_preload(state: tauri::State<AppState>) {
    state.player.clear_preload()
}

#[tauri::command]
pub fn has_preloaded(state: tauri::State<AppState>) -> bool {
    state.player.has_preloaded()
}

#[tauri::command]
pub fn get_preloaded_path(state: tauri::State<AppState>) -> Option<String> {
    state.player.get_preloaded_path()
}

// ReplayGain commands
#[tauri::command]
pub fn set_replaygain(
    gain_db: f32,
    preamp_db: f32,
    state: tauri::State<AppState>,
) -> AppResult<()> {
    state
        .player
        .set_replaygain(gain_db, preamp_db)
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn clear_replaygain(state: tauri::State<AppState>) {
    state.player.clear_replaygain()
}
