use std::path::{Path, PathBuf};

use rusqlite::Connection;
use vplayer::database::Database;

fn temp_db_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "vplayer_migration_{}_{}.db",
        test_name,
        uuid::Uuid::new_v4()
    ))
}

fn cleanup_db_files(path: &Path) {
    let _ = std::fs::remove_file(path);
    let wal = PathBuf::from(format!("{}-wal", path.to_string_lossy()));
    let shm = PathBuf::from(format!("{}-shm", path.to_string_lossy()));
    let _ = std::fs::remove_file(wal);
    let _ = std::fs::remove_file(shm);
}

/// Helper: create a minimal legacy database (no schema_version table).
fn create_legacy_db(path: &Path) {
    let conn = Connection::open(path).expect("open");
    conn.execute_batch(
        "CREATE TABLE tracks (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL,
            name TEXT NOT NULL,
            title TEXT,
            artist TEXT,
            album TEXT,
            duration REAL NOT NULL,
            date_added INTEGER NOT NULL
        );
        CREATE TABLE folders (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL,
            name TEXT NOT NULL,
            date_added INTEGER NOT NULL
        );
        CREATE TABLE playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE playlist_tracks (
            playlist_id TEXT NOT NULL,
            track_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, track_id)
        );
        CREATE TABLE failed_tracks (
            path TEXT PRIMARY KEY,
            error TEXT NOT NULL,
            failed_at INTEGER NOT NULL
        );",
    )
    .expect("legacy schema");
}

/// Helper: create a legacy DB, then pin it at a specific version by inserting
/// the version into schema_version. Columns up to that version are added.
fn create_db_at_version(path: &Path, version: i32) {
    create_legacy_db(path);
    let conn = Connection::open(path).expect("open");

    // Create schema_version table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
        [],
    )
    .expect("create schema_version");

    // Apply column additions for each version up to `version`
    let migrations: &[(i32, &[(&str, &str)])] = &[
        (1, &[("play_count", "INTEGER DEFAULT 0"), ("last_played", "INTEGER DEFAULT 0")]),
        (2, &[("rating", "INTEGER DEFAULT 0")]),
        (3, &[("file_modified", "INTEGER DEFAULT 0")]),
        (4, &[("album_art", "BLOB")]),
        (5, &[("track_gain", "REAL"), ("track_peak", "REAL"), ("loudness", "REAL")]),
        (6, &[("genre", "TEXT"), ("year", "INTEGER"), ("track_number", "INTEGER"), ("disc_number", "INTEGER")]),
    ];

    for &(v, cols) in migrations {
        if v > version { break; }
        for &(col, col_type) in cols {
            let sql = format!("ALTER TABLE tracks ADD COLUMN {} {}", col, col_type);
            let _ = conn.execute(&sql, []); // ignore "duplicate column"
        }
    }

    // v7: create track_album_art table
    if version >= 7 {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS track_album_art (
                track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
                data BLOB NOT NULL
            )",
            [],
        )
        .expect("v7 table");
    }

    // v8: create album_replaygain table
    if version >= 8 {
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
        )
        .expect("v8 table");
    }

    conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [version])
        .expect("set version");
}

fn get_track_columns(path: &Path) -> Vec<String> {
    let conn = Connection::open(path).expect("open");
    let mut stmt = conn.prepare("PRAGMA table_info(tracks)").expect("pragma");
    stmt.query_map([], |row| row.get::<_, String>(1))
        .expect("query")
        .collect::<std::result::Result<Vec<_>, _>>()
        .expect("collect")
}

fn get_schema_version(path: &Path) -> i32 {
    let conn = Connection::open(path).expect("open");
    conn.query_row("SELECT version FROM schema_version LIMIT 1", [], |row| row.get(0))
        .unwrap_or(0)
}

fn table_exists(path: &Path, table: &str) -> bool {
    let conn = Connection::open(path).expect("open");
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |row| row.get(0),
        )
        .expect("query");
    count > 0
}

// ----- Migration step tests -----

#[test]
fn migration_v0_to_v8_adds_all_columns() {
    let path = temp_db_path("v0_to_v8");
    create_legacy_db(&path);

    let db = Database::new(&path).expect("boot should succeed");
    drop(db);

    let cols = get_track_columns(&path);
    for expected in [
        "play_count", "last_played", "rating", "file_modified",
        "track_gain", "track_peak", "loudness",
        "genre", "year", "track_number", "disc_number",
    ] {
        assert!(cols.iter().any(|c| c == expected), "missing: {}", expected);
    }
    assert!(table_exists(&path, "track_album_art"));
    assert!(table_exists(&path, "album_replaygain"));
    assert_eq!(get_schema_version(&path), 8);
    cleanup_db_files(&path);
}

#[test]
fn migration_v3_to_v8_adds_remaining_columns() {
    let path = temp_db_path("v3_to_v8");
    create_db_at_version(&path, 3);

    let db = Database::new(&path).expect("boot from v3");
    drop(db);

    let cols = get_track_columns(&path);
    // v4+
    for expected in ["track_gain", "track_peak", "loudness", "genre", "year", "track_number", "disc_number"] {
        assert!(cols.iter().any(|c| c == expected), "missing: {}", expected);
    }
    assert!(table_exists(&path, "track_album_art"));
    assert!(table_exists(&path, "album_replaygain"));
    assert_eq!(get_schema_version(&path), 8);
    cleanup_db_files(&path);
}

#[test]
fn migration_v6_to_v8_creates_new_tables() {
    let path = temp_db_path("v6_to_v8");
    create_db_at_version(&path, 6);

    let db = Database::new(&path).expect("boot from v6");
    drop(db);

    assert!(table_exists(&path, "track_album_art"), "v7 table should be created");
    assert!(table_exists(&path, "album_replaygain"), "v8 table should be created");
    assert_eq!(get_schema_version(&path), 8);
    cleanup_db_files(&path);
}

#[test]
fn migration_v7_album_art_data_is_moved() {
    let path = temp_db_path("v7_art_move");
    // Start at v6 (has album_art BLOB column, no track_album_art table)
    create_db_at_version(&path, 6);

    // Insert a track with album art in the old column
    {
        let conn = Connection::open(&path).expect("open");
        conn.execute(
            "INSERT INTO tracks (id, path, name, duration, date_added, album_art)
             VALUES ('t1', '/music/song.mp3', 'song.mp3', 180.0, 1000, X'DEADBEEF')",
            [],
        ).expect("insert track");
    }

    let db = Database::new(&path).expect("boot from v6 with data");
    drop(db);

    // Verify the art was migrated to track_album_art
    let conn = Connection::open(&path).expect("reopen");
    let art: Vec<u8> = conn
        .query_row("SELECT data FROM track_album_art WHERE track_id = 't1'", [], |row| row.get(0))
        .expect("art should exist in new table");
    assert_eq!(art, vec![0xDE, 0xAD, 0xBE, 0xEF]);

    // Old column should be nulled out
    let old_art: Option<Vec<u8>> = conn
        .query_row("SELECT album_art FROM tracks WHERE id = 't1'", [], |row| row.get(0))
        .expect("query old column");
    assert!(old_art.is_none(), "old album_art column should be NULL after migration");

    drop(conn);
    cleanup_db_files(&path);
}

#[test]
fn migration_is_idempotent() {
    let path = temp_db_path("idempotent");
    create_legacy_db(&path);

    // Boot twice from the same DB file
    let db = Database::new(&path).expect("first boot");
    drop(db);
    let db = Database::new(&path).expect("second boot");
    drop(db);

    assert_eq!(get_schema_version(&path), 8);

    // Verify all tables are intact
    assert!(table_exists(&path, "tracks"));
    assert!(table_exists(&path, "folders"));
    assert!(table_exists(&path, "playlists"));
    assert!(table_exists(&path, "track_album_art"));
    assert!(table_exists(&path, "album_replaygain"));

    cleanup_db_files(&path);
}

#[test]
fn fresh_database_starts_at_latest_version() {
    let path = temp_db_path("fresh");
    let db = Database::new(&path).expect("fresh db");
    drop(db);

    assert_eq!(get_schema_version(&path), 8);

    let cols = get_track_columns(&path);
    assert!(cols.iter().any(|c| c == "disc_number"), "fresh DB should have all columns");
    assert!(table_exists(&path, "track_album_art"));
    assert!(table_exists(&path, "album_replaygain"));

    cleanup_db_files(&path);
}

#[test]
fn indexes_are_created() {
    let path = temp_db_path("indexes");
    let db = Database::new(&path).expect("db init");
    drop(db);

    let conn = Connection::open(&path).expect("open");
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
        .expect("prepare");
    let indexes: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .expect("query")
        .collect::<std::result::Result<Vec<_>, _>>()
        .expect("collect");

    let expected = [
        "idx_tracks_genre", "idx_tracks_artist", "idx_tracks_album",
        "idx_tracks_path", "idx_tracks_title_artist_album",
        "idx_tracks_rating", "idx_tracks_play_count", "idx_tracks_last_played",
        "idx_tracks_date_added", "idx_tracks_duration", "idx_tracks_year",
        "idx_folders_path", "idx_playlist_tracks_playlist", "idx_playlist_tracks_track",
    ];

    for name in expected {
        assert!(indexes.iter().any(|i| i == name), "missing index: {}", name);
    }

    drop(stmt);
    drop(conn);
    cleanup_db_files(&path);
}
