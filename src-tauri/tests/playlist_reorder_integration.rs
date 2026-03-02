use std::path::{Path, PathBuf};

use vplayer::database::Database;
use vplayer::scanner::Track;
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

fn sample_track(id: &str, path: &str, title: &str) -> Track {
    Track {
        id: id.to_string(),
        path: path.to_string(),
        name: title.to_string(),
        title: Some(title.to_string()),
        artist: Some("Integration Artist".to_string()),
        album: Some("Integration Album".to_string()),
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
fn reorder_playlist_tracks_updates_query_order() {
    let db_path = temp_db_path("playlist_reorder");
    let db = Database::new(&db_path).expect("db init should succeed");

    let playlist_id = db
        .create_playlist("Reorder Integration")
        .expect("create playlist should succeed");

    let tracks = vec![
        sample_track("reorder_track_1", "C:/Music/reorder-1.mp3", "First"),
        sample_track("reorder_track_2", "C:/Music/reorder-2.mp3", "Second"),
        sample_track("reorder_track_3", "C:/Music/reorder-3.mp3", "Third"),
    ];

    for (idx, track) in tracks.iter().enumerate() {
        db.add_track(track).expect("seed track insert should succeed");
        db.add_track_to_playlist(&playlist_id, &track.id, idx as i32)
            .expect("add track to playlist should succeed");
    }

    let before = db
        .get_playlist_tracks(&playlist_id)
        .expect("playlist query before reorder should succeed");
    let before_ids: Vec<&str> = before.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(before_ids, vec!["reorder_track_1", "reorder_track_2", "reorder_track_3"]);

    db.reorder_playlist_tracks(
        &playlist_id,
        vec![
            ("reorder_track_1".to_string(), 2),
            ("reorder_track_2".to_string(), 0),
            ("reorder_track_3".to_string(), 1),
        ],
    )
    .expect("reorder should succeed");

    let after = db
        .get_playlist_tracks(&playlist_id)
        .expect("playlist query after reorder should succeed");
    let after_ids: Vec<&str> = after.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(after_ids, vec!["reorder_track_2", "reorder_track_3", "reorder_track_1"]);

    drop(db);
    cleanup_db_files(&db_path);
}
