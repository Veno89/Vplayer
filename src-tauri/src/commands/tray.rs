// Tray settings commands
use crate::AppState;
use crate::TraySettings;
use log::info;

#[tauri::command]
pub fn set_tray_settings(
    state: tauri::State<'_, AppState>,
    close_to_tray: bool,
    minimize_to_tray: bool,
    start_minimized: bool,
) {
    let mut s = state.tray_settings.lock().unwrap_or_else(|p| p.into_inner());
    s.close_to_tray = close_to_tray;
    s.minimize_to_tray = minimize_to_tray;
    s.start_minimized = start_minimized;
    info!(
        "Tray settings updated: close_to_tray={}, minimize_to_tray={}, start_minimized={}",
        close_to_tray, minimize_to_tray, start_minimized
    );
}

#[tauri::command]
pub fn get_tray_settings(state: tauri::State<'_, AppState>) -> TraySettings {
    state.tray_settings.lock().unwrap_or_else(|p| p.into_inner()).clone()
}
