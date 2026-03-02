use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use vplayer::database::Database;
use vplayer::scanner::{Track, TRACK_SELECT_COLUMNS};
use vplayer::smart_playlists::{save_smart_playlist, Rule, SmartPlaylist};
use vplayer::time_utils::now_millis;

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
fn smart_playlist_executes_against_initialized_database() {
    let db_path = temp_db_path("smart_playlist_exec");

    // Initialize full app schema/migrations.
    let db = Database::new(&db_path).expect("db init should succeed");

    let tracks = vec![
        Track {
            id: "sp_track_1".to_string(),
            path: "C:/Music/rock-one.mp3".to_string(),
            name: "rock-one.mp3".to_string(),
            title: Some("Rock One".to_string()),
            artist: Some("Band A".to_string()),
            album: Some("Album A".to_string()),
            genre: Some("Rock".to_string()),
            year: Some(2020),
            track_number: Some(1),
            disc_number: Some(1),
            duration: 210.0,
            date_added: now_millis(),
            rating: 5,
            play_count: 42,
            last_played: now_millis(),
        },
        Track {
            id: "sp_track_2".to_string(),
            path: "C:/Music/pop-one.mp3".to_string(),
            name: "pop-one.mp3".to_string(),
            title: Some("Pop One".to_string()),
            artist: Some("Artist B".to_string()),
            album: Some("Album B".to_string()),
            genre: Some("Pop".to_string()),
            year: Some(2019),
            track_number: Some(1),
            disc_number: Some(1),
            duration: 180.0,
            date_added: now_millis(),
            rating: 4,
            play_count: 10,
            last_played: now_millis(),
        },
    ];

    for track in &tracks {
        db.add_track(track).expect("seed track insert should succeed");
    }

    // `add_track` preserves existing ratings and defaults new rows to 0,
    // so set ratings explicitly for this rule-driven test.
    db.set_track_rating("sp_track_1", 5)
        .expect("set rating for sp_track_1 should succeed");
    db.set_track_rating("sp_track_2", 4)
        .expect("set rating for sp_track_2 should succeed");

    // Use a fresh connection to mimic command-layer DB access.
    let conn = Connection::open(&db_path).expect("connection open should succeed");

    let playlist = SmartPlaylist {
        id: "sp_exec_1".to_string(),
        name: "Rock Highly Rated".to_string(),
        description: "Integration execution test".to_string(),
        rules: vec![
            Rule {
                field: "genre".to_string(),
                operator: "equals".to_string(),
                value: "Rock".to_string(),
            },
            Rule {
                field: "rating".to_string(),
                operator: "greater_equal".to_string(),
                value: "5".to_string(),
            },
        ],
        match_all: true,
        limit: Some(10),
        sort_by: Some("play_count".to_string()),
        sort_desc: true,
        live_update: true,
        created_at: now_millis(),
    };

    save_smart_playlist(&conn, &playlist).expect("smart playlist save should succeed");

    let (query, query_params) = playlist.to_sql().expect("to_sql should succeed");
    let mut stmt = conn.prepare(&query).expect("query prepare should succeed");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = query_params
        .iter()
        .map(|p| p as &dyn rusqlite::types::ToSql)
        .collect();

    let results = stmt
        .query_map(param_refs.as_slice(), Track::from_row)
        .expect("query execution should succeed")
        .collect::<rusqlite::Result<Vec<_>>>()
        .expect("result collection should succeed");

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "sp_track_1");

    // Sanity check that query shape still targets the standard track projection.
    assert!(query.starts_with(&format!("SELECT {}", TRACK_SELECT_COLUMNS)));

    // Ensure playlist persisted to smart_playlists table.
    let saved_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM smart_playlists WHERE id = ?1",
            params![playlist.id],
            |row| row.get(0),
        )
        .expect("smart playlist count query should succeed");
    assert_eq!(saved_count, 1);

    drop(stmt);
    drop(conn);
    drop(db);
    cleanup_db_files(&db_path);
}
