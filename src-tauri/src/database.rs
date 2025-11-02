use rusqlite::{Connection, Result, params};
use crate::scanner::Track;
use std::path::Path;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                name TEXT NOT NULL,
                title TEXT,
                artist TEXT,
                album TEXT,
                duration REAL NOT NULL,
                date_added INTEGER NOT NULL
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                name TEXT NOT NULL,
                date_added INTEGER NOT NULL
            )",
            [],
        )?;
        
        Ok(Self { conn: Mutex::new(conn) })
    }
    
    pub fn add_track(&self, track: &Track) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO tracks (id, path, name, title, artist, album, duration, date_added)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                track.id,
                track.path,
                track.name,
                track.title,
                track.artist,
                track.album,
                track.duration,
                track.date_added,
            ],
        )?;
        Ok(())
    }
    
    pub fn get_all_tracks(&self) -> Result<Vec<Track>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, path, name, title, artist, album, duration, date_added FROM tracks"
        )?;
        
        let tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                duration: row.get(6)?,
                date_added: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(tracks)
    }
    
    pub fn remove_tracks_by_folder(&self, folder_path: &str) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let count = conn.execute(
            "DELETE FROM tracks WHERE path LIKE ?1",
            params![format!("{}%", folder_path)],
        )?;
        Ok(count)
    }
    
    pub fn add_folder(&self, folder_id: &str, folder_path: &str, folder_name: &str, date_added: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO folders (id, path, name, date_added) VALUES (?1, ?2, ?3, ?4)",
            params![folder_id, folder_path, folder_name, date_added],
        )?;
        Ok(())
    }
    
    pub fn get_all_folders(&self) -> Result<Vec<(String, String, String, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, path, name, date_added FROM folders"
        )?;
        
        let folders = stmt.query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
            ))
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(folders)
    }
    
    pub fn remove_folder(&self, folder_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM folders WHERE id = ?1",
            params![folder_id],
        )?;
        Ok(())
    }
}
