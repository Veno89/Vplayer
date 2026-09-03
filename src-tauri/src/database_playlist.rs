use crate::database::Database;
use crate::scanner::Track;
use crate::time_utils::now_millis;
use rusqlite::{OptionalExtension, Result, params};
use std::collections::HashSet;

impl Database {
    // Playlist operations
    pub fn create_playlist(&self, name: &str) -> Result<String> {
        let id = format!("playlist_{}", uuid::Uuid::new_v4());
        let created_at = now_millis();

        let conn = self.conn();
        conn.execute(
            "INSERT INTO playlists (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![id, name, created_at],
        )?;
        Ok(id)
    }

    pub fn get_all_playlists(&self) -> Result<Vec<(String, String, i64)>> {
        let conn = self.conn();
        let mut stmt =
            conn.prepare("SELECT id, name, created_at FROM playlists ORDER BY created_at DESC")?;

        let playlists = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<Result<Vec<_>>>()?;

        Ok(playlists)
    }

    pub fn delete_playlist(&self, playlist_id: &str) -> Result<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        // Allow deletion of any playlist including 'library'
        tx.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
        )?;
        tx.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])?;
        tx.commit()?;
        Ok(())
    }

    pub fn rename_playlist(&self, playlist_id: &str, new_name: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE playlists SET name = ?1 WHERE id = ?2",
            params![new_name, playlist_id],
        )?;
        Ok(())
    }

    pub fn add_track_to_playlist(
        &self,
        playlist_id: &str,
        track_id: &str,
        _position: i32,
    ) -> Result<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let next_position: i32 = tx.query_row(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            params![playlist_id, track_id, next_position],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Batch add multiple tracks to a playlist in a single transaction
    pub fn add_tracks_to_playlist_batch(
        &self,
        playlist_id: &str,
        track_ids: &[String],
        _starting_position: i32,
    ) -> Result<usize> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;

        let mut next_position: i32 = tx.query_row(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;
        let mut count = 0usize;
        let mut seen = HashSet::new();
        for track_id in track_ids {
            if !seen.insert(track_id) {
                continue;
            }
            let inserted = tx.execute(
                "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
                params![playlist_id, track_id, next_position],
            )?;
            if inserted == 1 {
                next_position += 1;
                count += 1;
            }
        }

        tx.commit()?;
        Ok(count)
    }

    pub fn remove_track_from_playlist(&self, playlist_id: &str, track_id: &str) -> Result<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;

        let removed_position: Option<i32> = tx
            .query_row(
                "SELECT position FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
                params![playlist_id, track_id],
                |row| row.get(0),
            )
            .optional()?;

        let Some(removed_position) = removed_position else {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        };

        tx.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
            params![playlist_id, track_id],
        )?;
        tx.execute(
            "UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = ?1 AND position > ?2",
            params![playlist_id, removed_position],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn reorder_playlist_tracks(
        &self,
        playlist_id: &str,
        track_positions: Vec<(String, i32)>,
    ) -> Result<()> {
        let mut conn = self.conn();

        let tx = conn.transaction()?;
        let existing_count: usize = tx.query_row(
            "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;
        if track_positions.len() != existing_count {
            return Err(rusqlite::Error::InvalidQuery);
        }
        if existing_count == 0 {
            tx.commit()?;
            return Ok(());
        }

        let mut track_ids = HashSet::with_capacity(track_positions.len());
        let mut positions = HashSet::with_capacity(track_positions.len());
        for (track_id, position) in &track_positions {
            if *position < 0
                || *position as usize >= existing_count
                || !track_ids.insert(track_id.as_str())
                || !positions.insert(*position)
            {
                return Err(rusqlite::Error::InvalidQuery);
            }
        }

        let matched: usize = tx.query_row(
            &format!(
                "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?1 AND track_id IN ({})",
                (0..track_positions.len())
                    .map(|index| format!("?{}", index + 2))
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            rusqlite::params_from_iter(
                std::iter::once(&playlist_id as &dyn rusqlite::types::ToSql).chain(
                    track_positions
                        .iter()
                        .map(|(track_id, _)| track_id as &dyn rusqlite::types::ToSql),
                ),
            ),
            |row| row.get(0),
        )?;
        if matched != existing_count {
            return Err(rusqlite::Error::InvalidQuery);
        }

        // Move every row into a temporary negative range first. This makes the
        // final updates safe even with the unique (playlist, position) index.
        tx.execute(
            "UPDATE playlist_tracks SET position = -position - 1 WHERE playlist_id = ?1",
            params![playlist_id],
        )?;
        for (track_id, new_position) in track_positions {
            tx.execute(
                "UPDATE playlist_tracks SET position = ?1 WHERE playlist_id = ?2 AND track_id = ?3",
                params![new_position, playlist_id, track_id],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// Commit a parsed playlist and any newly discovered tracks as one unit.
    /// A read/metadata failure happens before this call; a database failure rolls
    /// back both the playlist row and all of its membership rows.
    pub fn import_playlist_atomic(
        &self,
        name: &str,
        new_tracks: &[Track],
        track_ids: &[String],
    ) -> Result<String> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let playlist_id = format!("playlist_{}", uuid::Uuid::new_v4());
        tx.execute(
            "INSERT INTO playlists (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![playlist_id, name, now_millis()],
        )?;

        for track in new_tracks {
            tx.execute(
                crate::database_tracks::TRACK_UPSERT_SQL,
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
                    track.play_count,
                    track.last_played,
                    track.rating,
                    crate::database_tracks::file_modified_seconds(&track.path),
                ],
            )?;
        }

        let mut seen = HashSet::new();
        let mut position = 0i32;
        for track_id in track_ids {
            if !seen.insert(track_id) {
                continue;
            }
            tx.execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
                params![playlist_id, track_id, position],
            )?;
            position += 1;
        }
        if !new_tracks.is_empty() {
            tx.execute("DELETE FROM album_replaygain", [])?;
        }
        tx.commit()?;
        Ok(playlist_id)
    }

    pub fn get_playlist_tracks(&self, playlist_id: &str) -> Result<Vec<Track>> {
        self.get_playlist_tracks_page(playlist_id, None, None)
    }

    pub fn get_playlist_tracks_page(
        &self,
        playlist_id: &str,
        offset: Option<usize>,
        limit: Option<usize>,
    ) -> Result<Vec<Track>> {
        let conn = self.conn();

        let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) =
            match (offset, limit) {
                (Some(off), Some(lim)) => (
                    "SELECT t.id, t.path, t.name, t.title, t.artist, t.album, t.genre, t.year, t.track_number, t.disc_number, t.duration, t.date_added, t.rating, t.play_count, t.last_played \
                     FROM tracks t \
                     INNER JOIN playlist_tracks pt ON t.id = pt.track_id \
                     WHERE pt.playlist_id = ?1 \
                     ORDER BY pt.position ASC \
                     LIMIT ?2 OFFSET ?3"
                        .to_string(),
                    vec![
                        Box::new(playlist_id.to_string()) as Box<dyn rusqlite::types::ToSql>,
                        Box::new(lim as i64),
                        Box::new(off as i64),
                    ],
                ),
                _ => (
                    "SELECT t.id, t.path, t.name, t.title, t.artist, t.album, t.genre, t.year, t.track_number, t.disc_number, t.duration, t.date_added, t.rating, t.play_count, t.last_played \
                     FROM tracks t \
                     INNER JOIN playlist_tracks pt ON t.id = pt.track_id \
                     WHERE pt.playlist_id = ?1 \
                     ORDER BY pt.position ASC"
                        .to_string(),
                    vec![Box::new(playlist_id.to_string()) as Box<dyn rusqlite::types::ToSql>],
                ),
            };

        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql)?;
        let tracks = stmt
            .query_map(param_refs.as_slice(), Track::from_row)?
            .collect::<Result<Vec<_>>>()?;

        Ok(tracks)
    }

    pub fn get_playlist_track_count(&self, playlist_id: &str) -> Result<i32> {
        let conn = self.conn();
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }
}
