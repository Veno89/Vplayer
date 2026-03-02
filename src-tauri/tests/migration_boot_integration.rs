use std::path::{Path, PathBuf};

use rusqlite::Connection;
use vplayer::database::Database;

fn temp_db_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "vplayer_integration_{}_{}.db",
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

#[test]
fn legacy_database_boot_runs_migrations() {
    let db_path = temp_db_path("migration_boot");

    {
        let conn = Connection::open(&db_path).expect("legacy db open should succeed");
        conn.execute_batch(
            "
            CREATE TABLE tracks (
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
            );
            ",
        )
        .expect("legacy schema setup should succeed");
    }

    let db = Database::new(&db_path).expect("database boot with migration should succeed");
    drop(db);

    let conn = Connection::open(&db_path).expect("db reopen should succeed");

    let mut stmt = conn
        .prepare("PRAGMA table_info(tracks)")
        .expect("pragma prepare should succeed");
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .expect("pragma query should succeed")
        .collect::<std::result::Result<Vec<_>, _>>()
        .expect("column collect should succeed");

    for expected in [
        "play_count",
        "last_played",
        "rating",
        "file_modified",
        "track_gain",
        "track_peak",
        "loudness",
        "genre",
        "year",
        "track_number",
        "disc_number",
    ] {
        assert!(
            columns.iter().any(|c| c == expected),
            "missing migrated column: {}",
            expected
        );
    }

    let album_art_table_exists: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'track_album_art'",
            [],
            |row| row.get(0),
        )
        .expect("sqlite_master query should succeed");
    assert_eq!(album_art_table_exists, 1);

    let schema_version: i32 = conn
        .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| row.get(0))
        .expect("schema_version query should succeed");
    assert_eq!(schema_version, 8);

    drop(stmt);
    drop(conn);
    cleanup_db_files(&db_path);
}
