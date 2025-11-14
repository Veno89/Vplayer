use rusqlite::{Connection, Result, params};
use log::info;
use crate::scanner::Track;
use std::path::Path;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self> {
        info!("Initializing database at {:?}", db_path);
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
                date_added INTEGER NOT NULL,
                play_count INTEGER DEFAULT 0,
                last_played INTEGER DEFAULT 0,
                rating INTEGER DEFAULT 0
            )",
            [],
        )?;
        
        // Migration: Add play_count and last_played columns if they don't exist
        let _ = conn.execute(
            "ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0",
            [],
        );
        
        let _ = conn.execute(
            "ALTER TABLE tracks ADD COLUMN last_played INTEGER DEFAULT 0",
            [],
        );
        
        // Migration: Add rating column if it doesn't exist
        let _ = conn.execute(
            "ALTER TABLE tracks ADD COLUMN rating INTEGER DEFAULT 0",
            [],
        );
        
        // Migration: Add file_modified column for incremental scanning
        let _ = conn.execute(
            "ALTER TABLE tracks ADD COLUMN file_modified INTEGER DEFAULT 0",
            [],
        );
        
        // Migration: Add album_art column for storing album art
        let _ = conn.execute(
            "ALTER TABLE tracks ADD COLUMN album_art BLOB",
            [],
        );
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                name TEXT NOT NULL,
                date_added INTEGER NOT NULL
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id TEXT NOT NULL,
                track_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
                PRIMARY KEY (playlist_id, track_id)
            )",
            [],
        )?;
        
        // Table for failed track paths (to skip on future scans)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS failed_tracks (
                path TEXT PRIMARY KEY,
                error TEXT NOT NULL,
                failed_at INTEGER NOT NULL
            )",
            [],
        )?;
        
        // Initialize smart playlists table
        crate::smart_playlists::create_smart_playlist_table(&conn)?;
        
        // Create indexes for common queries to improve performance
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist)",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album)",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(rating)",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count)",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_last_played ON tracks(last_played)",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_date_added ON tracks(date_added)",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id)",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id)",
            [],
        );
        
        info!("Database initialized successfully");
        Ok(Self { conn: Mutex::new(conn) })
    }
    
    pub fn add_track(&self, track: &Track) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO tracks (id, path, name, title, artist, album, duration, date_added, play_count, last_played, rating)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, COALESCE((SELECT play_count FROM tracks WHERE id = ?1), 0), COALESCE((SELECT last_played FROM tracks WHERE id = ?1), 0), COALESCE((SELECT rating FROM tracks WHERE id = ?1), 0))",
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
        info!("Fetching all tracks from database");
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, path, name, title, artist, album, duration, date_added, rating FROM tracks"
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
                rating: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(tracks)
    }
    
    // Track statistics
    pub fn increment_play_count(&self, track_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        
        conn.execute(
            "UPDATE tracks SET play_count = play_count + 1, last_played = ?1 WHERE id = ?2",
            params![now, track_id],
        )?;
        Ok(())
    }
    
    #[allow(dead_code)]
    pub fn get_play_count(&self, track_id: &str) -> Result<i32> {
        let conn = self.conn.lock().unwrap();
        let count: i32 = conn.query_row(
            "SELECT play_count FROM tracks WHERE id = ?1",
            params![track_id],
            |row| row.get(0),
        ).unwrap_or(0);
        Ok(count)
    }
    
    pub fn get_recently_played(&self, limit: usize) -> Result<Vec<Track>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, path, name, title, artist, album, duration, date_added, rating 
             FROM tracks 
             WHERE last_played > 0 
             ORDER BY last_played DESC 
             LIMIT ?1"
        )?;
        
        let tracks = stmt.query_map(params![limit], |row| {
            Ok(Track {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                duration: row.get(6)?,
                date_added: row.get(7)?,
                rating: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(tracks)
    }
    
    pub fn get_most_played(&self, limit: usize) -> Result<Vec<Track>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, path, name, title, artist, album, duration, date_added, rating 
             FROM tracks 
             WHERE play_count > 0 
             ORDER BY play_count DESC 
             LIMIT ?1"
        )?;
        
        let tracks = stmt.query_map(params![limit], |row| {
            Ok(Track {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                duration: row.get(6)?,
                date_added: row.get(7)?,
                rating: row.get(8)?,
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
    
    #[allow(dead_code)]
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
    
    // Playlist operations
    pub fn create_playlist(&self, name: &str) -> Result<String> {
        let id = format!("playlist_{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis());
        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO playlists (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![id, name, created_at],
        )?;
        Ok(id)
    }
    
    pub fn get_all_playlists(&self) -> Result<Vec<(String, String, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at FROM playlists ORDER BY created_at DESC"
        )?;
        
        let playlists = stmt.query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
            ))
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(playlists)
    }
    
    pub fn delete_playlist(&self, playlist_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
        )?;
        conn.execute(
            "DELETE FROM playlists WHERE id = ?1",
            params![playlist_id],
        )?;
        Ok(())
    }
    
    pub fn rename_playlist(&self, playlist_id: &str, new_name: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE playlists SET name = ?1 WHERE id = ?2",
            params![new_name, playlist_id],
        )?;
        Ok(())
    }
    
    pub fn add_track_to_playlist(&self, playlist_id: &str, track_id: &str, position: i32) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            params![playlist_id, track_id, position],
        )?;
        Ok(())
    }
    
    pub fn remove_track_from_playlist(&self, playlist_id: &str, track_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
            params![playlist_id, track_id],
        )?;
        Ok(())
    }
    
    pub fn reorder_playlist_tracks(&self, playlist_id: &str, track_positions: Vec<(String, i32)>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
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
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT t.id, t.path, t.name, t.title, t.artist, t.album, t.duration, t.date_added, t.rating
             FROM tracks t
             INNER JOIN playlist_tracks pt ON t.id = pt.track_id
             WHERE pt.playlist_id = ?1
             ORDER BY pt.position ASC"
        )?;
        
        let tracks = stmt.query_map(params![playlist_id], |row| {
            Ok(Track {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                duration: row.get(6)?,
                date_added: row.get(7)?,
                rating: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(tracks)
    }
    
    pub fn get_playlist_track_count(&self, playlist_id: &str) -> Result<i32> {
        let conn = self.conn.lock().unwrap();
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }
    
    // Failed tracks management
    pub fn add_failed_track(&self, path: &str, error: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        
        conn.execute(
            "INSERT OR REPLACE INTO failed_tracks (path, error, failed_at) VALUES (?1, ?2, ?3)",
            params![path, error, now],
        )?;
        Ok(())
    }
    
    pub fn is_failed_track(&self, path: &str) -> bool {
        let conn = self.conn.lock().unwrap();
        let result: Result<i32> = conn.query_row(
            "SELECT 1 FROM failed_tracks WHERE path = ?1",
            params![path],
            |row| row.get(0),
        );
        result.is_ok()
    }
    
    pub fn clear_failed_tracks(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM failed_tracks", [])?;
        Ok(())
    }
    
    // Star rating for tracks
    pub fn set_track_rating(&self, track_id: &str, rating: i32) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let clamped_rating = rating.max(0).min(5); // 0-5 stars
        conn.execute(
            "UPDATE tracks SET rating = ?1 WHERE id = ?2",
            params![clamped_rating, track_id],
        )?;
        Ok(())
    }
    
    // Get all track paths for validation
    pub fn get_all_track_paths(&self) -> Result<Vec<(String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, path FROM tracks")?;
        
        let paths = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(paths)
    }
    
    // Update track path (for relocating missing files)
    pub fn update_track_path(&self, track_id: &str, new_path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tracks SET path = ?1 WHERE id = ?2",
            params![new_path, track_id],
        )?;
        Ok(())
    }
    
    pub fn update_track_metadata(&self, track_id: &str, title: &Option<String>, artist: &Option<String>, album: &Option<String>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tracks SET title = ?1, artist = ?2, album = ?3 WHERE id = ?4",
            params![title, artist, album, track_id],
        )?;
        Ok(())
    }
    
    pub fn get_track_by_path(&self, path: &str) -> Result<Option<Track>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, path, name, title, artist, album, duration, date_added, rating FROM tracks WHERE path = ?1"
        )?;
        
        let mut rows = stmt.query(params![path])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Track {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                duration: row.get(6)?,
                date_added: row.get(7)?,
                rating: row.get(8)?,
            }))
        } else {
            Ok(None)
        }
    }
    
    // Find duplicate tracks based on metadata similarity
    pub fn find_duplicates(&self) -> Result<Vec<Vec<Track>>> {
        info!("Searching for duplicate tracks");
        let conn = self.conn.lock().unwrap();
        
        // Find tracks with matching (title, artist, album, duration within 2 seconds)
        // Group by these fields and return groups with count > 1
        let mut stmt = conn.prepare(
            "SELECT id, path, name, title, artist, album, duration, date_added, rating
             FROM tracks
             WHERE (title IS NOT NULL AND artist IS NOT NULL)
             ORDER BY title, artist, album, duration"
        )?;
        
        let all_tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                duration: row.get(6)?,
                date_added: row.get(7)?,
                rating: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        // Group tracks by similarity
        let mut duplicate_groups: Vec<Vec<Track>> = Vec::new();
        let mut current_group: Vec<Track> = Vec::new();
        
        for (i, track) in all_tracks.iter().enumerate() {
            if i == 0 {
                current_group.push(track.clone());
                continue;
            }
            
            let prev_track = &all_tracks[i - 1];
            
            // Check if tracks are similar (same title, artist, album, and duration within 2 seconds)
            let title_match = track.title == prev_track.title;
            let artist_match = track.artist == prev_track.artist;
            let album_match = track.album == prev_track.album;
            let duration_match = (track.duration - prev_track.duration).abs() < 2.0;
            
            if title_match && artist_match && album_match && duration_match {
                // Add to current group
                if current_group.is_empty() || current_group.last().unwrap().id != prev_track.id {
                    current_group.push(prev_track.clone());
                }
                current_group.push(track.clone());
            } else {
                // Start new group
                if current_group.len() > 1 {
                    duplicate_groups.push(current_group.clone());
                }
                current_group.clear();
                current_group.push(track.clone());
            }
        }
        
        // Don't forget the last group
        if current_group.len() > 1 {
            duplicate_groups.push(current_group);
        }
        
        info!("Found {} groups of duplicates", duplicate_groups.len());
        Ok(duplicate_groups)
    }
    
    // Remove a track from the library
    pub fn remove_track(&self, track_id: &str) -> Result<()> {
        info!("Removing track: {}", track_id);
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM tracks WHERE id = ?1",
            params![track_id],
        )?;
        Ok(())
    }
    
    // Get tracks for a specific folder with their modification times
    pub fn get_folder_tracks(&self, folder_path: &str) -> Result<Vec<(String, String, i64)>> {
        info!("Getting tracks for folder: {}", folder_path);
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, path, file_modified FROM tracks WHERE path LIKE ?1"
        )?;
        
        let tracks = stmt.query_map(params![format!("{}%", folder_path)], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2).unwrap_or(0),
            ))
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(tracks)
    }
    
    // Update track with file modification time
    pub fn add_track_with_mtime(&self, track: &Track, file_modified: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO tracks (id, path, name, title, artist, album, duration, date_added, play_count, last_played, rating, file_modified)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, COALESCE((SELECT play_count FROM tracks WHERE id = ?1), 0), COALESCE((SELECT last_played FROM tracks WHERE id = ?1), 0), COALESCE((SELECT rating FROM tracks WHERE id = ?1), 0), ?9)",
            params![
                track.id,
                track.path,
                track.name,
                track.title,
                track.artist,
                track.album,
                track.duration,
                track.date_added,
                file_modified,
            ],
        )?;
        Ok(())
    }
    
    // Album art operations
    pub fn get_album_art(&self, track_id: &str) -> Result<Option<Vec<u8>>> {
        let conn = self.conn.lock().unwrap();
        let result: Result<Option<Vec<u8>>> = conn.query_row(
            "SELECT album_art FROM tracks WHERE id = ?1",
            params![track_id],
            |row| row.get(0),
        );
        result.or(Ok(None))
    }
    
    pub fn set_album_art(&self, track_id: &str, art_data: &[u8]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tracks SET album_art = ?1 WHERE id = ?2",
            params![art_data, track_id],
        )?;
        Ok(())
    }
    
    pub fn has_album_art(&self, track_id: &str) -> bool {
        let conn = self.conn.lock().unwrap();
        let result: Result<i32> = conn.query_row(
            "SELECT 1 FROM tracks WHERE id = ?1 AND album_art IS NOT NULL",
            params![track_id],
            |row| row.get(0),
        );
        result.is_ok()
    }
}

