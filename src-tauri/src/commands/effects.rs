// Audio effects commands
use crate::effects::EffectsConfig;
use crate::error::{AppError, AppResult};
use crate::AppState;

/// Set audio effects configuration
#[tauri::command]
pub fn set_audio_effects(
    config: EffectsConfig,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    config.validate().map_err(AppError::Validation)?;
    state.player.set_effects(config);
    Ok(())
}

/// Get current audio effects configuration
#[tauri::command]
pub fn get_audio_effects(state: tauri::State<'_, AppState>) -> AppResult<EffectsConfig> {
    Ok(state.player.get_effects())
}

/// Enable or disable audio effects
#[tauri::command]
pub fn set_effects_enabled(enabled: bool, state: tauri::State<'_, AppState>) -> AppResult<()> {
    state.player.set_effects_enabled(enabled);
    Ok(())
}

/// Check if audio effects are enabled
#[tauri::command]
pub fn is_effects_enabled(state: tauri::State<'_, AppState>) -> AppResult<bool> {
    Ok(state.player.is_effects_enabled())
}
