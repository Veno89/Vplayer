// Audio playback commands
use crate::AppState;
use crate::audio::{AudioPlayer, AudioDevice};
use log::info;

#[tauri::command]
pub fn load_track(path: String, state: tauri::State<AppState>) -> Result<(), String> {
    info!("Loading track: {}", path);
    state.player.load(path).map_err(|e| e.into())
}

#[tauri::command]
pub fn play_audio(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.play().map_err(|e| e.into())
}

#[tauri::command]
pub fn pause_audio(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.pause().map_err(|e| e.into())
}

#[tauri::command]
pub fn stop_audio(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.stop().map_err(|e| e.into())
}

#[tauri::command]
pub fn set_volume(volume: f32, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.set_volume(volume).map_err(|e| e.into())
}

#[tauri::command]
pub fn seek_to(position: f64, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.seek(position).map_err(|e| e.into())
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
pub fn recover_audio(state: tauri::State<AppState>) -> Result<bool, String> {
    info!("Attempting audio device recovery");
    state.player.recover().map_err(|e| e.into())
}

#[tauri::command]
pub fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    AudioPlayer::get_audio_devices().map_err(|e| e.into())
}

#[tauri::command]
pub fn set_audio_device(device_name: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.set_output_device(&device_name).map_err(|e| e.into())
}

// Gapless playback commands
#[tauri::command]
pub fn preload_track(path: String, state: tauri::State<AppState>) -> Result<(), String> {
    state.player.preload(path).map_err(|e| e.into())
}

#[tauri::command]
pub fn swap_to_preloaded(state: tauri::State<AppState>) -> Result<(), String> {
    state.player.swap_to_preloaded().map_err(|e| e.into())
}

#[tauri::command]
pub fn clear_preload(state: tauri::State<AppState>) {
    state.player.clear_preload()
}

#[tauri::command]
pub fn has_preloaded(state: tauri::State<AppState>) -> bool {
    state.player.has_preloaded()
}
