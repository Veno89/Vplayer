use crate::database::Database;
use crate::error::{AppError, AppResult};
use rusqlite::OptionalExtension;

/// Resolve a renderer-supplied track reference through the library database.
/// The ID is the authority; the path is accepted only as a consistency check.
pub(crate) fn authorize_track_path(
    database: &Database,
    track_id: &str,
    supplied_path: &str,
) -> AppResult<String> {
    let stored_path = database
        .get_track_path(track_id)
        .map_err(|error| AppError::Database(error.to_string()))?
        .ok_or_else(|| AppError::NotFound(format!("Unknown track ID: {track_id}")))?;
    let stored = std::fs::canonicalize(&stored_path).map_err(|error| {
        AppError::NotFound(format!("Stored track path is unavailable: {error}"))
    })?;
    let supplied = std::fs::canonicalize(supplied_path).map_err(|error| {
        AppError::NotFound(format!("Requested track path is unavailable: {error}"))
    })?;
    if stored != supplied {
        return Err(AppError::Validation(
            "Track ID does not authorize the requested path".to_string(),
        ));
    }
    Ok(stored.to_string_lossy().into_owned())
}

/// Resolve an existing library root through the folders table. Commands that
/// maintain or query an established root must not accept arbitrary paths.
pub(crate) fn authorize_folder_path(database: &Database, supplied_path: &str) -> AppResult<String> {
    let conn = database.conn();
    conn.query_row(
        "SELECT path FROM folders WHERE path = ?1 COLLATE NOCASE",
        [supplied_path],
        |row| row.get(0),
    )
    .optional()
    .map_err(|error| AppError::Database(error.to_string()))?
    .ok_or_else(|| AppError::Validation("Folder path is not a registered library root".to_string()))
}
