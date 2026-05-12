use crate::database::Database;
use crate::scanner::Track;
use log::info;
use rusqlite::{params, OptionalExtension, Result};

impl Database {
    fn escape_like_pattern(value: &str) -> String {
        value
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    }

    fn folder_track_patterns(folder_path: &str) -> (String, String) {
        let trimmed = folder_path.trim_end_matches(['\\', '/']);
        let base = if trimmed.is_empty() || trimmed.ends_with(':') {
            folder_path
        } else {
            trimmed
        };
        let escaped_base = Self::escape_like_pattern(base);

        if base.ends_with('\\') || base.ends_with('/') {
            let prefix = format!("{}%", escaped_base);
            return (prefix.clone(), prefix);
        }

        (
            format!("{}\\%", escaped_base),
            format!("{}/%", escaped_base),
        )
    }

    pub fn remove_tracks_by_folder(&self, folder_path: &str) -> Result<usize> {
        let conn = self.conn();
        // Escape SQL LIKE wildcards in the folder path to prevent unintended matches
        let escaped = folder_path
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let count = conn.execute(
            "DELETE FROM tracks WHERE path LIKE ?1 ESCAPE '\\'",
            params![format!("{}%", escaped)],
        )?;
        Ok(count)
    }

    pub fn add_folder(
        &self,
        folder_id: &str,
        folder_path: &str,
        folder_name: &str,
        date_added: i64,
    ) -> Result<()> {
        let conn = self.conn();

        // Check if folder with same path already exists
        let mut stmt = conn.prepare("SELECT id FROM folders WHERE path = ?1")?;
        let existing_id: Option<String> =
            stmt.query_row(params![folder_path], |row| row.get(0)).ok();

        if let Some(existing_id) = existing_id {
            // Update existing folder entry with new date_added
            conn.execute(
                "UPDATE folders SET date_added = ?1 WHERE id = ?2",
                params![date_added, existing_id],
            )?;
        } else {
            // Insert new folder
            conn.execute(
                "INSERT INTO folders (id, path, name, date_added) VALUES (?1, ?2, ?3, ?4)",
                params![folder_id, folder_path, folder_name, date_added],
            )?;
        }

        Ok(())
    }

    pub fn remove_duplicate_folders(&self) -> Result<usize> {
        let conn = self.conn();

        // First, count how many duplicates exist
        let count_sql = "SELECT COUNT(*) FROM folders f WHERE EXISTS (SELECT 1 FROM folders f2 WHERE f2.path = f.path AND f2.id != f.id)";
        let duplicate_count: i64 = conn.query_row(count_sql, [], |row| row.get(0)).unwrap_or(0);
        info!(
            "Found {} duplicate folder entries to remove",
            duplicate_count
        );

        // Delete duplicate folders, keeping only one entry per path (the one with highest ID)
        let sql = "
            DELETE FROM folders
            WHERE id IN (
                SELECT f.id
                FROM folders f
                WHERE EXISTS (
                    SELECT 1 FROM folders f2
                    WHERE f2.path = f.path AND f2.id > f.id
                )
            )
        ";

        let affected_rows = conn.execute(sql, [])?;
        info!("Removed {} duplicate folder entries", affected_rows);
        Ok(affected_rows)
    }

    pub fn get_all_folders(&self) -> Result<Vec<(String, String, String, i64)>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, path, name, date_added FROM folders")?;

        let folders = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(folders)
    }

    pub fn remove_folder(&self, folder_id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])?;
        Ok(())
    }

    /// Remove folder row and all tracks under its path in one transaction.
    pub fn remove_folder_with_tracks(&self, folder_id: &str, folder_path: &str) -> Result<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;

        let stored_path: Option<String> = tx
            .query_row(
                "SELECT path FROM folders WHERE id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .optional()?;
        let effective_path = stored_path.as_deref().unwrap_or(folder_path);
        let (backslash_pattern, slash_pattern) = Self::folder_track_patterns(effective_path);

        tx.execute(
            "DELETE FROM tracks
             WHERE path = ?1
                OR path LIKE ?2 ESCAPE '\\'
                OR path LIKE ?3 ESCAPE '\\'",
            params![effective_path, backslash_pattern, slash_pattern],
        )?;
        let removed_folders = tx.execute(
            "DELETE FROM folders WHERE id = ?1 OR path = ?2 OR path = ?3",
            params![folder_id, folder_path, effective_path],
        )?;

        if removed_folders == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        tx.commit()?;
        Ok(())
    }

    /// Insert folder and scanned tracks atomically.
    pub fn add_folder_with_tracks(
        &self,
        folder_id: &str,
        folder_path: &str,
        folder_name: &str,
        date_added: i64,
        tracks: &[Track],
    ) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;

        let mut stmt = tx.prepare("SELECT id FROM folders WHERE path = ?1")?;
        let existing_id: Option<String> =
            stmt.query_row(params![folder_path], |row| row.get(0)).ok();
        drop(stmt);

        if let Some(existing_id) = existing_id {
            tx.execute(
                "UPDATE folders SET date_added = ?1 WHERE id = ?2",
                params![date_added, existing_id],
            )?;
        } else {
            tx.execute(
                "INSERT INTO folders (id, path, name, date_added) VALUES (?1, ?2, ?3, ?4)",
                params![folder_id, folder_path, folder_name, date_added],
            )?;
        }

        for track in tracks {
            tx.execute(
                "INSERT OR REPLACE INTO tracks (id, path, name, title, artist, album, genre, year, track_number, disc_number, duration, date_added, play_count, last_played, rating)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, COALESCE((SELECT play_count FROM tracks WHERE id = ?1), 0), COALESCE((SELECT last_played FROM tracks WHERE id = ?1), 0), COALESCE((SELECT rating FROM tracks WHERE id = ?1), 0))",
                params![
                    track.id,
                    track.path,
                    track.name,
                    track.title,
                    track.artist,
                    track.album,
                    track.genre,
                    track.year,
                    track.track_number,
                    track.disc_number,
                    track.duration,
                    track.date_added,
                ],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// Return just the track IDs whose path starts with `folder_path`.
    /// Used by the frontend after an incremental scan to discover all tracks
    /// already registered under a given folder (new and pre-existing).
    pub fn get_track_ids_for_folder(&self, folder_path: &str) -> Result<Vec<String>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id FROM tracks WHERE path LIKE ?1")?;
        let ids = stmt
            .query_map(params![format!("{}%", folder_path)], |row| row.get(0))?
            .collect::<Result<Vec<String>>>()?;
        Ok(ids)
    }

    // Get tracks for a specific folder with their modification times
    pub fn get_folder_tracks(&self, folder_path: &str) -> Result<Vec<(String, String, i64)>> {
        info!("Getting tracks for folder: {}", folder_path);
        let conn = self.conn();
        let mut stmt =
            conn.prepare("SELECT id, path, file_modified FROM tracks WHERE path LIKE ?1")?;

        let tracks = stmt
            .query_map(params![format!("{}%", folder_path)], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2).unwrap_or(0)))
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(tracks)
    }
}
