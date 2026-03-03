// Library track CRUD commands — split from library.rs
use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::scanner::{Scanner, Track};
use log::info;
use base64::{Engine as _, engine::general_purpose};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TracksPageResponse {
    pub tracks: Vec<Track>,
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
    pub has_more: bool,
}

#[tauri::command]
pub fn get_all_tracks(state: tauri::State<AppState>) -> AppResult<Vec<Track>> {
    state.db.get_all_tracks().map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn get_filtered_tracks(filter: crate::database::TrackFilter, state: tauri::State<AppState>) -> AppResult<Vec<Track>> {
    state.db.get_filtered_tracks(filter).map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn get_tracks_page(
    offset: usize,
    limit: usize,
    filter: Option<crate::database::TrackFilter>,
    state: tauri::State<'_, AppState>,
) -> AppResult<TracksPageResponse> {
    let safe_limit = if limit == 0 { 200 } else { limit.min(2000) };
    let filter = filter.unwrap_or_default();

    let (tracks, total) = state
        .db
        .get_tracks_page(filter, offset, safe_limit)
        .map_err(|e| AppError::Database(e.to_string()))?;

    let has_more = offset.saturating_add(tracks.len()) < total;

    Ok(TracksPageResponse {
        tracks,
        total,
        offset,
        limit: safe_limit,
        has_more,
    })
}

#[tauri::command]
pub fn get_all_folders(state: tauri::State<AppState>) -> AppResult<Vec<(String, String, String, i64)>> {
    state.db.get_all_folders().map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn remove_folder(folder_id: String, folder_path: String, state: tauri::State<AppState>) -> AppResult<()> {
    state.db
        .remove_folder_with_tracks(&folder_id, &folder_path)
    .map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn set_track_rating(track_id: String, rating: i32, state: tauri::State<'_, AppState>) -> AppResult<()> {
    let validated_rating = crate::validation::validate_rating(rating)
        .map_err(|e| AppError::Validation(e.to_string()))?;
    info!("Setting track rating: {} -> {}", track_id, validated_rating);
    state.db.set_track_rating(&track_id, validated_rating).map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn update_track_path(track_id: String, new_path: String, state: tauri::State<'_, AppState>) -> AppResult<()> {
    info!("Updating track path: {} -> {}", track_id, new_path);
    state.db.update_track_path(&track_id, &new_path).map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn find_duplicates(state: tauri::State<'_, AppState>, sensitivity: Option<String>) -> AppResult<Vec<Vec<Track>>> {
    let level = sensitivity.as_deref().unwrap_or("medium");
    info!("Finding duplicate tracks (sensitivity={})", level);
    let mut groups = state.db.find_duplicates().map_err(|e| AppError::Database(e.to_string()))?;

    // Filter groups based on sensitivity
    match level {
        "low" => {
            // Low: keep only groups where all tracks share the exact same file name
            groups.retain(|grp| {
                if grp.len() < 2 { return false; }
                let first_name = std::path::Path::new(&grp[0].path)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_lowercase());
                grp.iter().all(|t| {
                    std::path::Path::new(&t.path)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_lowercase()) == first_name
                })
            });
        }
        "high" => {
            // High: keep everything the DB returns (title+artist+album, ≤2s duration)
            // — no extra filtering
        }
        _ => {
            // Medium (default): keep groups where all durations are within 2 seconds
            // This is already enforced by the DB query, so nothing to filter
        }
    }

    Ok(groups)
}

#[tauri::command]
pub fn remove_track(track_id: String, state: tauri::State<'_, AppState>) -> AppResult<()> {
    info!("Removing track: {}", track_id);
    state.db.remove_track(&track_id).map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn increment_play_count(track_id: String, state: tauri::State<AppState>) -> AppResult<()> {
    state.db.increment_play_count(&track_id).map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn get_recently_played(limit: usize, state: tauri::State<AppState>) -> AppResult<Vec<Track>> {
    state.db.get_recently_played(limit).map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn get_most_played(limit: usize, state: tauri::State<AppState>) -> AppResult<Vec<Track>> {
    state.db.get_most_played(limit).map_err(|e| AppError::Database(e.to_string()))
}

#[tauri::command]
pub fn get_album_art(track_id: String, state: tauri::State<'_, AppState>) -> AppResult<Option<String>> {
    info!("Getting album art for track: {}", track_id);
    match state.db.get_album_art(&track_id) {
        Ok(Some(art_data)) => {
            let base64_data = general_purpose::STANDARD.encode(&art_data);
            Ok(Some(base64_data))
        },
        Ok(None) => Ok(None),
        Err(e) => Err(AppError::Database(format!("Failed to get album art: {}", e))),
    }
}

#[tauri::command]
pub fn get_album_art_batch(
    track_ids: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<(String, Option<String>)>> {
    info!("Getting album art batch for {} tracks", track_ids.len());
    let items = state
        .db
        .get_album_art_batch(&track_ids)
        .map_err(|e| AppError::Database(format!("Failed to get album art batch: {}", e)))?;

    Ok(items
        .into_iter()
        .map(|(track_id, art)| {
            let encoded = art.map(|bytes| general_purpose::STANDARD.encode(&bytes));
            (track_id, encoded)
        })
        .collect())
}

#[tauri::command]
pub fn extract_and_cache_album_art(track_id: String, track_path: String, state: tauri::State<'_, AppState>) -> AppResult<Option<String>> {
    info!("Extracting album art for: {}", track_path);
    
    // Check if already cached
    if state.db.has_album_art(&track_id) {
        return get_album_art(track_id, state);
    }
    
    // Extract from file
    match Scanner::extract_album_art(&track_path) {
        Ok(Some(art_data)) => {
            // Cache in database
            state.db.set_album_art(&track_id, &art_data)
                .map_err(|e| AppError::Database(format!("Failed to cache album art: {}", e)))?;
            
            let base64_data = general_purpose::STANDARD.encode(&art_data);
            Ok(Some(base64_data))
        },
        Ok(None) => Ok(None),
        Err(e) => Err(AppError::Scanner(format!("Failed to extract album art: {}", e))),
    }
}

#[derive(serde::Deserialize)]
pub struct TagUpdate {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
    pub comment: Option<String>,
    pub track_number: Option<String>,
    pub disc_number: Option<String>,
}

#[tauri::command]
pub fn update_track_tags(track_id: String, track_path: String, tags: TagUpdate, state: tauri::State<'_, AppState>) -> AppResult<()> {
    use crate::tag_service::{apply_tags_to_file, TagUpdateInput};
    
    // Validate path before writing to the file system
    crate::validation::validate_path(&track_path).map_err(|e| AppError::Validation(e.to_string()))?;
    
    info!("Updating tags for: {}", track_path);
    
    let tag_update = TagUpdateInput {
        title: tags.title.clone(),
        artist: tags.artist.clone(),
        album: tags.album.clone(),
        year: tags.year.clone(),
        genre: tags.genre.clone(),
        comment: tags.comment.clone(),
        track_number: tags.track_number.clone(),
        disc_number: tags.disc_number.clone(),
    };
    apply_tags_to_file(&track_path, &tag_update).map_err(AppError::Decode)?;
    
    // Update database with all edited metadata fields
    let year_i32 = tags.year.as_ref().and_then(|y| y.parse::<i32>().ok());
    let track_num_i32 = tags.track_number.as_ref().and_then(|t| t.parse::<i32>().ok());
    let disc_num_i32 = tags.disc_number.as_ref().and_then(|d| d.parse::<i32>().ok());
    state.db.update_track_metadata(
        &track_id,
        &tags.title,
        &tags.artist,
        &tags.album,
        &tags.genre,
        &year_i32,
        &track_num_i32,
        &disc_num_i32,
    ).map_err(|e| AppError::Database(format!("Failed to update database: {}", e)))?;
    
    info!("Tags updated successfully");
    Ok(())
}

#[tauri::command]
pub fn reset_play_count(track_id: String, state: tauri::State<AppState>) -> AppResult<()> {
    info!("Resetting play count for track: {}", track_id);
    state.db.reset_play_count(&track_id).map_err(|e| AppError::Database(e.to_string()))
}
