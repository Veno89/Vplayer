use crate::database::Database;
use crate::time_utils::now_millis;
use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// A receipt for an atomic membership edit. Undo refuses to overwrite later edits.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistRemoval {
    pub playlist_id: String,
    pub before: Vec<String>,
    pub after: Vec<String>,
    pub removed: usize,
}

fn ordered_ids(conn: &Connection, playlist_id: &str) -> Result<Vec<String>> {
    conn.query_row(
        "SELECT id FROM playlists WHERE id = ?1",
        [playlist_id],
        |_| Ok(()),
    )?;
    conn.prepare("SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position")?
        .query_map([playlist_id], |row| row.get(0))?
        .collect()
}

impl Database {
    pub fn remove_playlist_tracks(
        &self,
        playlist_id: &str,
        track_ids: &[String],
    ) -> Result<PlaylistRemoval> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let before = ordered_ids(&tx, playlist_id)?;
        let requested: HashSet<_> = track_ids.iter().collect();
        let after: Vec<_> = before
            .iter()
            .filter(|id| !requested.contains(id))
            .cloned()
            .collect();
        tx.execute(
            "UPDATE playlist_tracks SET position = -position - 1 WHERE playlist_id = ?1",
            [playlist_id],
        )?;
        {
            let mut delete =
                tx.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2")?;
            for id in &requested {
                delete.execute(params![playlist_id, id])?;
            }
            let mut update = tx.prepare(
                "UPDATE playlist_tracks SET position = ?1 WHERE playlist_id = ?2 AND track_id = ?3",
            )?;
            for (position, id) in after.iter().enumerate() {
                update.execute(params![position, playlist_id, id])?;
            }
        }
        tx.commit()?;
        Ok(PlaylistRemoval {
            playlist_id: playlist_id.to_owned(),
            removed: before.len() - after.len(),
            before,
            after,
        })
    }

    pub fn undo_playlist_removal(&self, receipt: &PlaylistRemoval) -> Result<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        if ordered_ids(&tx, &receipt.playlist_id)? != receipt.after {
            return Err(rusqlite::Error::InvalidQuery);
        }
        tx.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            [&receipt.playlist_id],
        )?;
        {
            let mut insert = tx.prepare(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            )?;
            for (position, id) in receipt.before.iter().enumerate() {
                insert.execute(params![receipt.playlist_id, id, position])?;
            }
        }
        tx.commit()
    }

    pub fn duplicate_playlist(&self, playlist_id: &str, name: &str) -> Result<String> {
        let id = format!("playlist_{}", uuid::Uuid::new_v4());
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        tx.query_row(
            "SELECT id FROM playlists WHERE id = ?1",
            [playlist_id],
            |_| Ok(()),
        )?;
        tx.execute(
            "INSERT INTO playlists (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![id, name, now_millis()],
        )?;
        tx.execute("INSERT INTO playlist_tracks (playlist_id, track_id, position) SELECT ?1, track_id, position FROM playlist_tracks WHERE playlist_id = ?2", params![id, playlist_id])?;
        tx.commit()?;
        Ok(id)
    }
}
