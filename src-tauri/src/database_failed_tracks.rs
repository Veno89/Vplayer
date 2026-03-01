use crate::database::Database;
use crate::time_utils::now_millis;
use rusqlite::{params, Result};

impl Database {
    // Failed tracks management
    pub fn add_failed_track(&self, path: &str, error: &str) -> Result<()> {
        let conn = self.conn();
        let now = now_millis() / 1000;

        conn.execute(
            "INSERT OR REPLACE INTO failed_tracks (path, error, failed_at) VALUES (?1, ?2, ?3)",
            params![path, error, now],
        )?;
        Ok(())
    }

    pub fn is_failed_track(&self, path: &str) -> bool {
        let conn = self.conn();
        let result: Result<i32> = conn.query_row(
            "SELECT 1 FROM failed_tracks WHERE path = ?1",
            params![path],
            |row| row.get(0),
        );
        result.is_ok()
    }

    pub fn clear_failed_tracks(&self) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM failed_tracks", [])?;
        Ok(())
    }
}
