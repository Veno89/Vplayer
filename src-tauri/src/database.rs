use rusqlite::Connection;
use serde::Deserialize;
use log::warn;
use std::path::Path;
use std::sync::Mutex;

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

impl Default for TrackFilter {
    fn default() -> Self {
        Self {
            search_query: None,
            artist: None,
            album: None,
            genre: None,
            sort_by: None,
            sort_desc: false,
            play_count_min: None,
            play_count_max: None,
            min_rating: None,
            duration_from: None,
            duration_to: None,
            folder_id: None,
        }
    }
}

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    /// Acquire the database connection lock, recovering from Mutex poisoning.
    /// A poisoned Mutex means a thread panicked while holding the lock, but the
    /// underlying SQLite `Connection` is almost certainly still valid, so we recover
    /// the inner value and log a warning instead of crashing the whole application.
    pub(crate) fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|poisoned| {
            warn!("Database mutex was poisoned — recovering inner connection");
            poisoned.into_inner()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::Track;
    use crate::time_utils::now_millis;
    use std::sync::Arc;
    use std::thread;
    use std::path::PathBuf;

    fn temp_db_path(test_name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("vplayer_db_test_{}_{}.db", test_name, uuid::Uuid::new_v4()))
    }

    fn cleanup_db_files(path: &Path) {
        let _ = std::fs::remove_file(path);
        let wal = PathBuf::from(format!("{}-wal", path.to_string_lossy()));
        let shm = PathBuf::from(format!("{}-shm", path.to_string_lossy()));
        let _ = std::fs::remove_file(wal);
        let _ = std::fs::remove_file(shm);
    }

    fn sample_track(id: &str, path: &str) -> Track {
        Track {
            id: id.to_string(),
            path: path.to_string(),
            name: "Sample".to_string(),
            title: Some("Sample Title".to_string()),
            artist: Some("Sample Artist".to_string()),
            album: Some("Sample Album".to_string()),
            genre: Some("Rock".to_string()),
            year: Some(2024),
            track_number: Some(1),
            disc_number: Some(1),
            duration: 180.0,
            date_added: now_millis(),
            rating: 0,
            play_count: 0,
            last_played: 0,
        }
    }

    #[test]
    fn add_and_remove_folder_with_tracks_is_consistent() {
        let db_path = temp_db_path("folder_tx");
        let db = Database::new(&db_path).expect("db init failed");

        let folder_id = "folder_test_1";
        let folder_path = "C:/Music/TestFolder";
        let folder_name = "TestFolder";
        let tracks = vec![
            sample_track("track_1", "C:/Music/TestFolder/track1.mp3"),
            sample_track("track_2", "C:/Music/TestFolder/track2.mp3"),
        ];

        db.add_folder_with_tracks(folder_id, folder_path, folder_name, now_millis(), &tracks)
            .expect("add_folder_with_tracks failed");

        let folders = db.get_all_folders().expect("get_all_folders failed");
        assert!(folders.iter().any(|(id, path, _, _)| id == folder_id && path == folder_path));

        let all_tracks = db.get_all_tracks().expect("get_all_tracks failed");
        assert_eq!(all_tracks.len(), 2);

        db.remove_folder_with_tracks(folder_id, folder_path)
            .expect("remove_folder_with_tracks failed");

        let folders_after = db.get_all_folders().expect("get_all_folders after failed");
        assert!(!folders_after.iter().any(|(id, _, _, _)| id == folder_id));

        let tracks_after = db.get_all_tracks().expect("get_all_tracks after failed");
        assert!(tracks_after.is_empty());

        cleanup_db_files(&db_path);
    }

    #[test]
    fn delete_playlist_removes_playlist_and_memberships() {
        let db_path = temp_db_path("playlist_delete_tx");
        let db = Database::new(&db_path).expect("db init failed");

        let playlist_id = db.create_playlist("Test Playlist").expect("create_playlist failed");
        let track = sample_track("track_pl_1", "C:/Music/Playlist/track.mp3");
        db.add_track(&track).expect("add_track failed");
        db.add_track_to_playlist(&playlist_id, &track.id, 0)
            .expect("add_track_to_playlist failed");

        db.delete_playlist(&playlist_id).expect("delete_playlist failed");

        let playlists = db.get_all_playlists().expect("get_all_playlists failed");
        assert!(!playlists.iter().any(|(id, _, _)| id == &playlist_id));

        let playlist_tracks = db.get_playlist_tracks(&playlist_id).expect("get_playlist_tracks failed");
        assert!(playlist_tracks.is_empty());

        cleanup_db_files(&db_path);
    }

    #[test]
    fn migrates_legacy_tracks_schema_to_latest() {
        let db_path = temp_db_path("migration_v0");

        // Simulate a legacy database with an older tracks schema.
        {
            let conn = Connection::open(&db_path).expect("legacy db open failed");
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
            .expect("legacy schema setup failed");
        }

        let db = Database::new(&db_path).expect("migration init failed");
        let conn = db.conn();

        let mut stmt = conn
            .prepare("PRAGMA table_info(tracks)")
            .expect("pragma prepare failed");
        let columns = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .expect("pragma query failed")
            .collect::<std::result::Result<Vec<_>, _>>()
            .expect("column collect failed");

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
            assert!(columns.iter().any(|c| c == expected), "missing migrated column: {}", expected);
        }

        let album_art_table_exists: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'track_album_art'",
                [],
                |row| row.get(0),
            )
            .expect("sqlite_master query failed");
        assert_eq!(album_art_table_exists, 1, "track_album_art table should exist after migration");

        drop(stmt);
        drop(conn);
        drop(db);
        cleanup_db_files(&db_path);
    }

    #[test]
    fn concurrent_increment_play_count_is_consistent() {
        let db_path = temp_db_path("concurrent_play_count");
        let db = Arc::new(Database::new(&db_path).expect("db init failed"));

        let track = sample_track("track_concurrent_1", "C:/Music/Test/concurrent.mp3");
        db.add_track(&track).expect("seed track failed");

        let thread_count = 8;
        let increments_per_thread = 200;
        let mut handles = Vec::new();

        for _ in 0..thread_count {
            let db_cloned = Arc::clone(&db);
            let track_id = track.id.clone();
            handles.push(thread::spawn(move || {
                for _ in 0..increments_per_thread {
                    db_cloned
                        .increment_play_count(&track_id)
                        .expect("increment_play_count failed in thread");
                }
            }));
        }

        for handle in handles {
            handle.join().expect("worker thread panicked");
        }

        let all_tracks = db.get_all_tracks().expect("fetch tracks failed");
        let updated = all_tracks
            .iter()
            .find(|t| t.id == track.id)
            .expect("seed track missing after concurrent updates");

        assert_eq!(updated.play_count, thread_count * increments_per_thread);

        drop(db);
        cleanup_db_files(&db_path);
    }
}



