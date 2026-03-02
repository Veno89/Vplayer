// Audio playback commands
use crate::AppState;
use crate::audio::{AudioPlayer, AudioDevice};
use crate::error::{AppError, AppResult};
use crate::validation;
use log::info;

#[tauri::command]
pub fn load_track(path: String, state: tauri::State<AppState>) -> AppResult<()> {
    info!("Loading track: {}", path);
    // Validate path exists before loading
    validation::validate_path(&path).map_err(|e| AppError::Validation(e.to_string()))?;
    state.player.load(path).map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn play_audio(state: tauri::State<AppState>) -> AppResult<()> {
    state.player.play().map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn pause_audio(state: tauri::State<AppState>) -> AppResult<()> {
    state.player.pause().map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn stop_audio(state: tauri::State<AppState>) -> AppResult<()> {
    state.player.stop().map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn set_volume(volume: f32, state: tauri::State<AppState>) -> AppResult<()> {
    let valid_volume = validation::validate_volume(volume).map_err(|e| AppError::Validation(e.to_string()))?;
    state.player.set_volume(valid_volume).map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn set_balance(balance: f32, state: tauri::State<AppState>) -> AppResult<()> {
    // Balance is -1.0 (full left) to 1.0 (full right), 0.0 is center
    if !(-1.0..=1.0).contains(&balance) {
        return Err(AppError::Validation("Balance must be between -1.0 and 1.0".to_string()));
    }
    state.player.set_balance(balance).map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn get_balance(state: tauri::State<AppState>) -> f32 {
    state.player.get_balance()
}

#[tauri::command]
pub fn seek_to(position: f64, state: tauri::State<AppState>) -> AppResult<()> {
    if position.is_nan() || position < 0.0 {
        return Err(AppError::Validation("Seek position must be a non-negative number".to_string()));
    }
    state.player.seek(position).map_err(|e| AppError::Audio(e.to_string()))
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
pub fn recover_audio(state: tauri::State<AppState>) -> AppResult<bool> {
    info!("Attempting audio device recovery");
    state.player.recover().map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn is_audio_healthy(state: tauri::State<AppState>) -> bool {
    state.player.is_healthy()
}

#[tauri::command]
pub fn needs_audio_reinit(state: tauri::State<AppState>) -> bool {
    state.player.needs_reinit()
}

#[tauri::command]
pub fn get_inactive_duration(state: tauri::State<AppState>) -> f64 {
    state.player.get_inactive_duration()
}

#[tauri::command]
pub fn has_audio_device_changed(state: tauri::State<AppState>) -> bool {
    state.player.has_device_changed()
}

#[tauri::command]
pub fn is_audio_device_available(state: tauri::State<AppState>) -> bool {
    state.player.is_device_available()
}

#[tauri::command]
pub fn get_audio_devices() -> AppResult<Vec<AudioDevice>> {
    AudioPlayer::get_audio_devices().map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn set_audio_device(device_name: String, state: tauri::State<AppState>) -> AppResult<()> {
    if device_name.trim().is_empty() {
        return Err(AppError::Validation("Device name cannot be empty".to_string()));
    }
    state.player.set_output_device(&device_name).map_err(|e| AppError::Audio(e.to_string()))
}

// Gapless playback commands
#[tauri::command]
pub fn preload_track(path: String, state: tauri::State<AppState>) -> AppResult<()> {
    // Mirror load_track validation to avoid preloading invalid/malicious paths.
    validation::validate_path(&path).map_err(|e| AppError::Validation(e.to_string()))?;
    state.player.preload(path).map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn swap_to_preloaded(state: tauri::State<AppState>) -> AppResult<()> {
    state.player.swap_to_preloaded().map_err(|e| AppError::Audio(e.to_string()))
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
pub fn set_replaygain(gain_db: f32, preamp_db: f32, state: tauri::State<AppState>) -> AppResult<()> {
    state.player.set_replaygain(gain_db, preamp_db).map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub fn clear_replaygain(state: tauri::State<AppState>) {
    state.player.clear_replaygain()
}
