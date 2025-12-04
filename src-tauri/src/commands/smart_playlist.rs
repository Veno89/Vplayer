// Smart playlist commands
use crate::AppState;
use crate::scanner::Track;
use crate::smart_playlists::{self, SmartPlaylist};

#[tauri::command]
pub fn create_smart_playlist(playlist: SmartPlaylist, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.conn.lock().unwrap();
    smart_playlists::save_smart_playlist(&conn, &playlist)
        .map_err(|e| format!("Failed to create smart playlist: {}", e))
}

#[tauri::command]
pub fn get_all_smart_playlists(state: tauri::State<'_, AppState>) -> Result<Vec<SmartPlaylist>, String> {
    let conn = state.db.conn.lock().unwrap();
    smart_playlists::load_all_smart_playlists(&conn)
        .map_err(|e| format!("Failed to load smart playlists: {}", e))
}

#[tauri::command]
pub fn get_smart_playlist(id: String, state: tauri::State<'_, AppState>) -> Result<SmartPlaylist, String> {
    let conn = state.db.conn.lock().unwrap();
    smart_playlists::load_smart_playlist(&conn, &id)
        .map_err(|e| format!("Failed to load smart playlist: {}", e))
}

#[tauri::command]
pub fn update_smart_playlist(playlist: SmartPlaylist, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.conn.lock().unwrap();
    smart_playlists::save_smart_playlist(&conn, &playlist)
        .map_err(|e| format!("Failed to update smart playlist: {}", e))
}

#[tauri::command]
pub fn delete_smart_playlist(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.conn.lock().unwrap();
    smart_playlists::delete_smart_playlist(&conn, &id)
        .map_err(|e| format!("Failed to delete smart playlist: {}", e))
}

#[tauri::command]
pub fn execute_smart_playlist(id: String, state: tauri::State<'_, AppState>) -> Result<Vec<Track>, String> {
    let conn = state.db.conn.lock().unwrap();
    
    // Load the smart playlist
    let playlist = smart_playlists::load_smart_playlist(&conn, &id)
        .map_err(|e| format!("Failed to load smart playlist: {}", e))?;
    
    // Generate SQL query
    let query = playlist.to_sql()
        .map_err(|e| format!("Failed to generate query: {}", e))?;
    
    // Execute query
    let mut stmt = conn.prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;
    
    let tracks = stmt.query_map([], |row| {
        Ok(Track {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            title: row.get(3)?,
            artist: row.get(4)?,
            album: row.get(5)?,
            duration: row.get(6)?,
            date_added: row.get(7)?,
            rating: row.get(8).unwrap_or(0),
        })
    })
    .map_err(|e| format!("Failed to execute query: {}", e))?
    .collect::<rusqlite::Result<Vec<_>>>()
    .map_err(|e| format!("Failed to collect results: {}", e))?;
    
    Ok(tracks)
}
