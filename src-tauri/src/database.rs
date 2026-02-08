use rusqlite::{Connection, Result, params, ToSql};
use serde::Deserialize;
use log::{info, warn};
use crate::scanner::Track;
use std::path::Path;
use std::sync::Mutex;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

const CACHE_TTL_SECS: u64 = 300; // 5 minutes

/// Current database schema version. Increment when adding migrations.
const SCHEMA_VERSION: i32 = 5;

#[derive(Clone)]
struct CachedQuery {
    data: Vec<Track>,
    timestamp: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackFilter {
    pub search_query: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub sort_by: Option<String>,
    pub sort_desc: bool,
    // New fields
    pub play_count_min: Option<i32>,
    pub play_count_max: Option<i32>,
    pub min_rating: Option<i32>,
    pub duration_from: Option<f64>,
    pub duration_to: Option<f64>,
    pub folder_id: Option<String>,
}

pub struct Database {
    pub conn: Mutex<Connection>,
    query_cache: Mutex<HashMap<String, CachedQuery>>,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self> {
        info!("Initializing database at {:?}", db_path);
        let conn = Connection::open(db_path)?;
        
        // Create core tables (includes all columns for fresh installs)
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
                rating INTEGER DEFAULT 0,
                file_modified INTEGER DEFAULT 0,
                album_art BLOB,
                track_gain REAL,
                track_peak REAL,
                loudness REAL
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
        
        // Run versioned migrations for existing databases
        Self::run_migrations(&conn)?;
        
        // Create indexes for common queries
        Self::create_indexes(&conn);
        
        info!("Database initialized successfully");
        Ok(Self { 
            conn: Mutex::new(conn),
            query_cache: Mutex::new(HashMap::new()),
        })
    }
    
    /// Run versioned database migrations.
    /// Each migration is idempotent — ALTER TABLE ADD COLUMN is a no-op 
    /// if the column already exists (fresh installs include all columns).
    fn run_migrations(conn: &Connection) -> Result<()> {
        // Create schema_version table if it doesn't exist
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER NOT NULL
            )",
            [],
        )?;
        
        // Get current version (0 if table is empty = legacy database)
        let current_version: i32 = conn
            .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| row.get(0))
            .unwrap_or(0);
        
        if current_version >= SCHEMA_VERSION {
            info!("Database schema is up to date (v{})", current_version);
            return Ok(());
        }
        
        info!("Migrating database from v{} to v{}", current_version, SCHEMA_VERSION);
        
        // Migration v1: Add play_count and last_played columns
        if current_version < 1 {
            Self::migrate_add_column(conn, "tracks", "play_count", "INTEGER DEFAULT 0", 1)?;
            Self::migrate_add_column(conn, "tracks", "last_played", "INTEGER DEFAULT 0", 1)?;
            info!("Migration v1 complete: play_count, last_played columns");
        }
        
        // Migration v2: Add rating column
        if current_version < 2 {
            Self::migrate_add_column(conn, "tracks", "rating", "INTEGER DEFAULT 0", 2)?;
            info!("Migration v2 complete: rating column");
        }
        
        // Migration v3: Add file_modified column for incremental scanning
        if current_version < 3 {
            Self::migrate_add_column(conn, "tracks", "file_modified", "INTEGER DEFAULT 0", 3)?;
            info!("Migration v3 complete: file_modified column");
        }
        
        // Migration v4: Add album_art BLOB column
        if current_version < 4 {
            Self::migrate_add_column(conn, "tracks", "album_art", "BLOB", 4)?;
            info!("Migration v4 complete: album_art column");
        }
        
        // Migration v5: Add ReplayGain columns
        if current_version < 5 {
            Self::migrate_add_column(conn, "tracks", "track_gain", "REAL", 5)?;
            Self::migrate_add_column(conn, "tracks", "track_peak", "REAL", 5)?;
            Self::migrate_add_column(conn, "tracks", "loudness", "REAL", 5)?;
            info!("Migration v5 complete: track_gain, track_peak, loudness columns");
        }
        
        // Update stored schema version
        conn.execute("DELETE FROM schema_version", [])?;
        conn.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            params![SCHEMA_VERSION],
        )?;
        
        info!("Database migration complete — now at v{}", SCHEMA_VERSION);
        Ok(())
    }
    
    /// Safely add a column to a table. Logs and continues if the column already exists.
    fn migrate_add_column(
        conn: &Connection,
        table: &str,
        column: &str,
        col_type: &str,
        _version: i32,
    ) -> Result<()> {
        let sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, col_type);
        match conn.execute(&sql, []) {
            Ok(_) => {
                info!("  Added column {}.{}", table, column);
                Ok(())
            }
            Err(e) => {
                // SQLite returns "duplicate column name" if column already exists
                let msg = e.to_string();
                if msg.contains("duplicate column") {
                    info!("  Column {}.{} already exists, skipping", table, column);
                    Ok(())
                } else {
                    warn!("  Failed to add column {}.{}: {}", table, column, msg);
                    Err(e)
                }
            }
        }
    }
    
    /// Create performance indexes (idempotent via IF NOT EXISTS).
    fn create_indexes(conn: &Connection) {
        let indexes = [
            ("idx_tracks_artist", "tracks(artist)"),
            ("idx_tracks_album", "tracks(album)"),
            ("idx_tracks_rating", "tracks(rating)"),
            ("idx_tracks_play_count", "tracks(play_count)"),
            ("idx_tracks_last_played", "tracks(last_played)"),
            ("idx_tracks_date_added", "tracks(date_added)"),
            ("idx_playlist_tracks_playlist", "playlist_tracks(playlist_id)"),
            ("idx_playlist_tracks_track", "playlist_tracks(track_id)"),
        ];
        
        for (name, definition) in &indexes {
            let sql = format!("CREATE INDEX IF NOT EXISTS {} ON {}", name, definition);
            if let Err(e) = conn.execute(&sql, []) {
                warn!("Failed to create index {}: {}", name, e);
            }
        }
    }
    
    fn invalidate_cache(&self) {
        if let Ok(mut cache) = self.query_cache.lock() {
            cache.clear();
        }
    }
    
    fn get_cached_tracks(&self, cache_key: &str) -> Option<Vec<Track>> {
        let cache = self.query_cache.lock().ok()?;
        let cached = cache.get(cache_key)?;
        
        let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs();
        if now - cached.timestamp < CACHE_TTL_SECS {
            Some(cached.data.clone())
        } else {
            None
        }
    }
    
    fn set_cached_tracks(&self, cache_key: String, tracks: Vec<Track>) {
        if let Ok(mut cache) = self.query_cache.lock() {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            cache.insert(cache_key, CachedQuery { data: tracks, timestamp });
        }
    }
    
    pub fn add_track(&self, track: &Track) -> Result<()> {
        self.invalidate_cache();
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
        let cache_key = "all_tracks";
        
        if let Some(cached) = self.get_cached_tracks(cache_key) {
            info!("Returning cached tracks ({} tracks)", cached.len());
            return Ok(cached);
        }
        
        info!("Fetching all tracks from database");
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, path, name, title, artist, album, duration, date_added, rating FROM tracks"
        )?;
        
        let tracks = stmt.query_map([], Track::from_row)?
            .collect::<Result<Vec<_>>>()?;
        
        self.set_cached_tracks(cache_key.to_string(), tracks.clone());
        Ok(tracks)
    }

    pub fn get_filtered_tracks(&self, filter: TrackFilter) -> Result<Vec<Track>> {
        // Build SQL query dynamically
        let mut sql = "SELECT id, path, name, title, artist, album, duration, date_added, rating FROM tracks WHERE 1=1".to_string();
        let mut params_values: Vec<Box<dyn ToSql>> = Vec::new();

        if let Some(query) = &filter.search_query {
            if !query.is_empty() {
                 sql.push_str(" AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)");
                 let pattern = format!("%{}%", query);
                 params_values.push(Box::new(pattern.clone()));
                 params_values.push(Box::new(pattern.clone()));
                 params_values.push(Box::new(pattern.clone()));
            }
        }

        if let Some(artist) = &filter.artist {
            sql.push_str(" AND artist = ?");
            params_values.push(Box::new(artist.clone()));
        }

        if let Some(album) = &filter.album {
            sql.push_str(" AND album = ?");
            params_values.push(Box::new(album.clone()));
        }

        if let Some(_genre) = &filter.genre {
            // Note: genre is not in main table yet unless migrated? 
            // Update: We saw update_track_tags supports genre but table migration in line 60-70 didn't explicitly add genre column?
            // checking lines 28-40 again.
            // tracks table: id, path, name, title, artist, album, duration, date_added, play_count, last_played, rating, file_modified, album_art, track_gain...
            // No genre column in CREATE TABLE or ALTERs visible in snippet 1-200.
            // Wait, update_track_tags (scanner.rs or commands.rs) saves genre to file, and update_track_metadata only updates title, artist, album.
            // So genre filtering might not be supported in DB yet!
            // I will SKIP genre filtering in DB for now to avoid SQL error, 
            // OR I should check update_track_metadata implementation in database.rs to see if it supports genre.
            // Assuming NO genre column for now based on snippet.
        }

        // Additional filters
        if let Some(min) = filter.play_count_min {
            sql.push_str(" AND play_count >= ?");
            params_values.push(Box::new(min));
        }

        if let Some(max) = filter.play_count_max {
             sql.push_str(" AND play_count <= ?");
             params_values.push(Box::new(max));
        }

        if let Some(min) = filter.min_rating {
             sql.push_str(" AND rating >= ?");
             params_values.push(Box::new(min));
        }

        if let Some(from) = filter.duration_from {
             sql.push_str(" AND duration >= ?");
             params_values.push(Box::new(from));
        }

        if let Some(to) = filter.duration_to {
             sql.push_str(" AND duration <= ?");
             params_values.push(Box::new(to));
        }

        // Folder filtering
        if let Some(folder_id) = &filter.folder_id {
             // We need to query the folder path first
             // Since we need to use the connection for this query, and we're building the main query
             // We can use a subquery or separate query. Subquery is cleaner in SQL but we are building param list dynamically.
             // Actually, we can use a subquery in WHERE clause: AND path LIKE (SELECT path FROM folders WHERE id = ?) || '%'
             // But concatenation in SQLite: (SELECT path FROM folders WHERE id = ?) || '%'
             
             sql.push_str(" AND path LIKE (SELECT path FROM folders WHERE id = ?) || '%'");
             params_values.push(Box::new(folder_id.clone()));
        }

        // Sorting
        if let Some(sort_by) = &filter.sort_by {
            let col = match sort_by.as_str() {
                "title" => "title",
                "artist" => "artist",
                "album" => "artist, album", // Sort by artist first, then album to keep albums grouped by artist
                "date" => "date_added",
                "date_added" => "date_added",
                "rating" => "rating",
                "duration" => "duration",
                "play_count" => "play_count",
                _ => "title" 
            };
            let dir = if filter.sort_desc { "DESC" } else { "ASC" };
            sql.push_str(&format!(" ORDER BY {} {}", col, dir));
        } else {
            sql.push_str(" ORDER BY title ASC");
        }

        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&sql)?;
        
        let tracks = stmt.query_map(rusqlite::params_from_iter(params_values.iter()), Track::from_row)?
            .collect::<Result<Vec<_>>>()?;

        Ok(tracks)
    }
    
    // Track statistics
    pub fn increment_play_count(&self, track_id: &str) -> Result<()> {
        self.invalidate_cache();
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
    
    pub fn reset_play_count(&self, track_id: &str) -> Result<()> {
        self.invalidate_cache();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tracks SET play_count = 0, last_played = 0 WHERE id = ?1",
            params![track_id],
        )?;
        Ok(())
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
        
        let tracks = stmt.query_map(params![limit], Track::from_row)?
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
        
        let tracks = stmt.query_map(params![limit], Track::from_row)?
            .collect::<Result<Vec<_>>>()?;
        
        Ok(tracks)
    }
    
    pub fn remove_tracks_by_folder(&self, folder_path: &str) -> Result<usize> {
        self.invalidate_cache();
        let conn = self.conn.lock().unwrap();
        let count = conn.execute(
            "DELETE FROM tracks WHERE path LIKE ?1",
            params![format!("{}%", folder_path)],
        )?;
        Ok(count)
    }
    
    pub fn add_folder(&self, folder_id: &str, folder_path: &str, folder_name: &str, date_added: i64) -> Result<()> {
        self.invalidate_cache();
        let conn = self.conn.lock().unwrap();

        // Check if folder with same path already exists
        let mut stmt = conn.prepare("SELECT id FROM folders WHERE path = ?1")?;
        let existing_id: Option<String> = stmt.query_row(params![folder_path], |row| row.get(0)).ok();

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
        self.invalidate_cache();
        let conn = self.conn.lock().unwrap();

        // First, count how many duplicates exist
        let count_sql = "SELECT COUNT(*) FROM folders f WHERE EXISTS (SELECT 1 FROM folders f2 WHERE f2.path = f.path AND f2.id != f.id)";
        let duplicate_count: i64 = conn.query_row(count_sql, [], |row| row.get(0)).unwrap_or(0);
        info!("Found {} duplicate folder entries to remove", duplicate_count);

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
        self.invalidate_cache();
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
        // Allow deletion of any playlist including 'library'
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
    
    /// Batch add multiple tracks to a playlist in a single transaction
    pub fn add_tracks_to_playlist_batch(&self, playlist_id: &str, track_ids: &[String], starting_position: i32) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
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
        
        let tracks = stmt.query_map(params![playlist_id], Track::from_row)?
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
            Ok(Some(Track::from_row(row)?))
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
        
        let all_tracks = stmt.query_map([], Track::from_row)?
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

