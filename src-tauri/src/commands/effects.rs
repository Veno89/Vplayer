// Audio effects commands
use crate::AppState;
use crate::effects::EffectsConfig;

/// Set audio effects configuration
#[tauri::command]
pub fn set_audio_effects(config: EffectsConfig, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.player.set_effects(config);
    Ok(())
}

/// Get current audio effects configuration
#[tauri::command]
pub fn get_audio_effects(state: tauri::State<'_, AppState>) -> Result<EffectsConfig, String> {
    Ok(state.player.get_effects())
}

/// Enable or disable audio effects
#[tauri::command]
pub fn set_effects_enabled(enabled: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.player.set_effects_enabled(enabled);
    Ok(())
}

/// Check if audio effects are enabled
#[tauri::command]
pub fn is_effects_enabled(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    Ok(state.player.is_effects_enabled())
}
