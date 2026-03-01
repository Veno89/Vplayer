use crate::database::Database;
use crate::scanner::Track;
use crate::time_utils::now_millis;
use rusqlite::{params, Result};

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
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at FROM playlists ORDER BY created_at DESC",
        )?;

        let playlists = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<Result<Vec<_>>>()?;

        Ok(playlists)
    }

    pub fn delete_playlist(&self, playlist_id: &str) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
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

    pub fn add_track_to_playlist(&self, playlist_id: &str, track_id: &str, position: i32) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            params![playlist_id, track_id, position],
        )?;
        Ok(())
    }

    /// Batch add multiple tracks to a playlist in a single transaction
    pub fn add_tracks_to_playlist_batch(
        &self,
        playlist_id: &str,
        track_ids: &[String],
        starting_position: i32,
    ) -> Result<usize> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;

        let mut count = 0;
        for (i, track_id) in track_ids.iter().enumerate() {
            let position = starting_position + i as i32;
            tx.execute(
                "INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
                params![playlist_id, track_id, position],
            )?;
            count += 1;
        }

        tx.commit()?;
        Ok(count)
    }

    pub fn remove_track_from_playlist(&self, playlist_id: &str, track_id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
            params![playlist_id, track_id],
        )?;
        Ok(())
    }

    pub fn reorder_playlist_tracks(&self, playlist_id: &str, track_positions: Vec<(String, i32)>) -> Result<()> {
        let conn = self.conn();

        // Use a transaction for atomic updates
        let tx = conn.unchecked_transaction()?;

        for (track_id, new_position) in track_positions {
            tx.execute(
                "UPDATE playlist_tracks SET position = ?1 WHERE playlist_id = ?2 AND track_id = ?3",
                params![new_position, playlist_id, track_id],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_playlist_tracks(&self, playlist_id: &str) -> Result<Vec<Track>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT t.id, t.path, t.name, t.title, t.artist, t.album, t.genre, t.year, t.track_number, t.disc_number, t.duration, t.date_added, t.rating, t.play_count, t.last_played
             FROM tracks t
             INNER JOIN playlist_tracks pt ON t.id = pt.track_id
             WHERE pt.playlist_id = ?1
             ORDER BY pt.position ASC",
        )?;

        let tracks = stmt
            .query_map(params![playlist_id], Track::from_row)?
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
