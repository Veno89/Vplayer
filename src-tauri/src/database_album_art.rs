use crate::database::Database;
use rusqlite::{params, params_from_iter, Result};
use std::collections::HashMap;

impl Database {
    // Album art operations (stored in separate track_album_art table)
    pub fn get_album_art(&self, track_id: &str) -> Result<Option<Vec<u8>>> {
        let conn = self.conn();
        let result: Result<Option<Vec<u8>>> = conn.query_row(
            "SELECT data FROM track_album_art WHERE track_id = ?1",
            params![track_id],
            |row| row.get(0),
        );
        result.or(Ok(None))
    }

    pub fn set_album_art(&self, track_id: &str, art_data: &[u8]) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO track_album_art (track_id, data) VALUES (?1, ?2)
             ON CONFLICT(track_id) DO UPDATE SET data = excluded.data",
            params![track_id, art_data],
        )?;
        Ok(())
    }

    pub fn has_album_art(&self, track_id: &str) -> bool {
        let conn = self.conn();
        let result: Result<i32> = conn.query_row(
            "SELECT 1 FROM track_album_art WHERE track_id = ?1",
            params![track_id],
            |row| row.get(0),
        );
        result.is_ok()
    }

    /// Batch fetch album art blobs for a set of track IDs.
    /// Returns entries in the same order as `track_ids`, with `None` for misses.
    pub fn get_album_art_batch(
        &self,
        track_ids: &[String],
    ) -> Result<Vec<(String, Option<Vec<u8>>)>> {
        if track_ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders = std::iter::repeat("?")
            .take(track_ids.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT track_id, data FROM track_album_art WHERE track_id IN ({})",
            placeholders
        );

        let conn = self.conn();
        let mut stmt = conn.prepare(&sql)?;
        let fetched = stmt
            .query_map(params_from_iter(track_ids.iter()), |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?))
            })?
            .collect::<Result<Vec<_>>>()?;

        let by_id: HashMap<String, Vec<u8>> = fetched.into_iter().collect();
        Ok(track_ids
            .iter()
            .map(|id| (id.clone(), by_id.get(id).cloned()))
            .collect())
    }
}
