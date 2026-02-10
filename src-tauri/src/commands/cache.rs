// Cache and system commands
use crate::AppState;
use tauri::{AppHandle, Manager};
use log::info;

/// Clear album art cache
#[tauri::command]
pub fn clear_album_art_cache(app: AppHandle) -> Result<(), String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?
        .join("album_art");
    
    if cache_dir.exists() {
        std::fs::remove_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to clear cache: {}", e))?;
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to recreate cache dir: {}", e))?;
    }
    Ok(())
}

/// Get cache size in bytes
#[tauri::command]
pub fn get_cache_size(app: AppHandle) -> Result<u64, String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?;
    
    fn dir_size(path: &std::path::Path) -> std::io::Result<u64> {
        let mut size = 0;
        if path.is_dir() {
            for entry in std::fs::read_dir(path)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    size += dir_size(&path)?;
                } else {
                    size += entry.metadata()?.len();
                }
            }
        }
        Ok(size)
    }
    
    dir_size(&cache_dir).map_err(|e| format!("Failed to calculate size: {}", e))
}

/// Get database size in bytes
#[tauri::command]
pub fn get_database_size(app: AppHandle) -> Result<u64, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("vplayer.db");
    
    std::fs::metadata(db_path)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to get database size: {}", e))
}

/// Get performance statistics
#[tauri::command]
pub fn get_performance_stats(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let conn = state.db.conn.lock().unwrap();
    
    // Get database stats
    let track_count: i32 = conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
        .unwrap_or(0);
    let playlist_count: i32 = conn.query_row("SELECT COUNT(*) FROM playlists", [], |row| row.get(0))
        .unwrap_or(0);
    let smart_playlist_count: i32 = conn.query_row("SELECT COUNT(*) FROM smart_playlists", [], |row| row.get(0))
        .unwrap_or(0);
    
    // Get database file size
    let db_size: i64 = conn.query_row("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()", [], |row| row.get(0))
        .unwrap_or(0);
    
    // Get index usage stats
    let index_count: i32 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'", [], |row| row.get(0))
        .unwrap_or(0);
    
    // Calculate average query times (simplified - just track count queries)
    let start = std::time::Instant::now();
    let mut stmt = conn.prepare("SELECT id FROM tracks LIMIT 1000").map_err(|e| format!("Query error: {}", e))?;
    let _track_ids: Vec<String> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(Result::ok)
        .collect();
    let query_time_ms = start.elapsed().as_millis();
    drop(stmt);
    
    // Memory stats (approximation)
    let memory_usage = std::mem::size_of_val(&*conn) + (track_count as usize * 1024); // Rough estimate
    
    Ok(serde_json::json!({
        "database": {
            "tracks": track_count,
            "playlists": playlist_count,
            "smart_playlists": smart_playlist_count,
            "size_bytes": db_size,
            "size_mb": (db_size as f64 / 1024.0 / 1024.0),
            "indexes": index_count,
        },
        "performance": {
            "query_time_ms": query_time_ms,
            "memory_usage_bytes": memory_usage,
            "memory_usage_mb": (memory_usage as f64 / 1024.0 / 1024.0),
        },
        "recommendations": {
            "vacuum_recommended": db_size > 10_000_000, // > 10MB
            "optimize_queries": query_time_ms > 100,
        }
    }))
}

/// Run database vacuum to reclaim space and optimize
#[tauri::command]
pub fn vacuum_database(state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Running database vacuum to reclaim space and optimize");
    let conn = state.db.conn.lock().unwrap();
    conn.execute("VACUUM", [])
        .map_err(|e| format!("Failed to vacuum database: {}", e))?;
    info!("Database vacuum completed successfully");
    Ok(())
}

/// Evict oldest album-art cache files until total size is ≤ `limit_mb` MB.
#[tauri::command]
pub fn enforce_cache_limit(app: tauri::AppHandle, limit_mb: u64) -> Result<u64, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?
        .join("album_art");

    if !cache_dir.exists() {
        return Ok(0);
    }

    let limit_bytes = limit_mb * 1024 * 1024;

    // Collect all files with metadata
    let mut files: Vec<(std::path::PathBuf, u64, std::time::SystemTime)> = Vec::new();
    let mut total_size: u64 = 0;

    for entry in std::fs::read_dir(&cache_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if meta.is_file() {
            let modified = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
            total_size += meta.len();
            files.push((entry.path(), meta.len(), modified));
        }
    }

    if total_size <= limit_bytes {
        return Ok(0);
    }

    // Sort oldest first
    files.sort_by_key(|(_, _, time)| *time);

    let mut removed: u64 = 0;
    for (path, size, _) in &files {
        if total_size <= limit_bytes {
            break;
        }
        if std::fs::remove_file(path).is_ok() {
            total_size -= size;
            removed += 1;
        }
    }

    info!("Cache limit enforced: removed {} files, new size ~{} bytes", removed, total_size);
    Ok(removed)
}
