use crate::database::Database;
use log::{info, warn};
use rusqlite::{params, Connection, Result};
use std::path::Path;
use std::sync::Mutex;

/// Current database schema version. Increment when adding migrations.
const SCHEMA_VERSION: i32 = 8;

impl Database {
    pub fn new(db_path: &Path) -> Result<Self> {
        info!("Initializing database at {:?}", db_path);
        let conn = Connection::open(db_path)?;

        // Enable WAL mode for better concurrent read performance,
        // NORMAL synchronous for durability with WAL, and foreign key enforcement.
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;",
        )?;

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
                loudness REAL,
                genre TEXT,
                year INTEGER,
                track_number INTEGER,
                disc_number INTEGER
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS track_album_art (
                track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
                data BLOB NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS album_replaygain (
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                album_gain REAL NOT NULL,
                album_peak REAL NOT NULL,
                loudness REAL NOT NULL,
                track_count INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (artist, album)
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

        info!(
            "Migrating database from v{} to v{}",
            current_version, SCHEMA_VERSION
        );

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

        // Migration v6: Add genre, year, track_number, disc_number columns
        if current_version < 6 {
            Self::migrate_add_column(conn, "tracks", "genre", "TEXT", 6)?;
            Self::migrate_add_column(conn, "tracks", "year", "INTEGER", 6)?;
            Self::migrate_add_column(conn, "tracks", "track_number", "INTEGER", 6)?;
            Self::migrate_add_column(conn, "tracks", "disc_number", "INTEGER", 6)?;
            info!("Migration v6 complete: genre, year, track_number, disc_number columns");
        }

        // Migration v7: Move album_art to a separate table to keep the tracks
        // table lean. Large BLOB data in the main table bloats the SQLite page
        // cache and slows index scans.
        if current_version < 7 {
            conn.execute(
                "CREATE TABLE IF NOT EXISTS track_album_art (
                    track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
                    data BLOB NOT NULL
                )",
                [],
            )?;
            // Copy existing album art data to the new table
            conn.execute(
                "INSERT OR IGNORE INTO track_album_art (track_id, data)
                 SELECT id, album_art FROM tracks WHERE album_art IS NOT NULL",
                [],
            )?;
            // Null out the old column to reclaim page space on next VACUUM.
            // (SQLite < 3.35 doesn't support DROP COLUMN, so we just clear it.)
            conn.execute("UPDATE tracks SET album_art = NULL WHERE album_art IS NOT NULL", [])?;
            info!("Migration v7 complete: album art moved to track_album_art table");
        }

        // Migration v8: Add album-level ReplayGain cache table.
        if current_version < 8 {
            conn.execute(
                "CREATE TABLE IF NOT EXISTS album_replaygain (
                    artist TEXT NOT NULL,
                    album TEXT NOT NULL,
                    album_gain REAL NOT NULL,
                    album_peak REAL NOT NULL,
                    loudness REAL NOT NULL,
                    track_count INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (artist, album)
                )",
                [],
            )?;
            info!("Migration v8 complete: album_replaygain table created");
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
            ("idx_tracks_genre", "tracks(genre)"),
            ("idx_tracks_artist", "tracks(artist)"),
            ("idx_tracks_album", "tracks(album)"),
            ("idx_tracks_path", "tracks(path)"),
            ("idx_tracks_title_artist_album", "tracks(title, artist, album)"),
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
}
