use crate::database::Database;
use rusqlite::{Result, params, params_from_iter};
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
            "INSERT INTO track_album_art (track_id, data, cached_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(track_id) DO UPDATE SET data = excluded.data, cached_at = excluded.cached_at",
            params![track_id, art_data, crate::time_utils::now_millis()],
        )?;
        Ok(())
    }

    pub fn album_art_cache_size(&self) -> Result<u64> {
        let conn = self.conn();
        let size: i64 = conn.query_row(
            "SELECT COALESCE(SUM(length(data)), 0) FROM track_album_art",
            [],
            |row| row.get(0),
        )?;
        Ok(size.max(0) as u64)
    }

    pub fn clear_album_art_blobs(&self) -> Result<usize> {
        self.conn().execute("DELETE FROM track_album_art", [])
    }

    pub fn evict_album_art_bytes(&self, bytes_to_free: u64) -> Result<u64> {
        if bytes_to_free == 0 {
            return Ok(0);
        }
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let mut stmt = tx.prepare(
            "SELECT track_id, length(data) FROM track_album_art ORDER BY cached_at ASC, track_id ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?))
            })?
            .collect::<Result<Vec<_>>>()?;
        drop(stmt);
        let mut freed = 0u64;
        for (track_id, size) in rows {
            if freed >= bytes_to_free {
                break;
            }
            tx.execute(
                "DELETE FROM track_album_art WHERE track_id = ?1",
                params![track_id],
            )?;
            freed = freed.saturating_add(size);
        }
        tx.commit()?;
        Ok(freed)
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

        let placeholders = std::iter::repeat_n("?", track_ids.len())
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
