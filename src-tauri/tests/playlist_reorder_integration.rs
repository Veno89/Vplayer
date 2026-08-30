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

    let tracks = [
        sample_track("reorder_track_1", "C:/Music/reorder-1.mp3", "First"),
        sample_track("reorder_track_2", "C:/Music/reorder-2.mp3", "Second"),
        sample_track("reorder_track_3", "C:/Music/reorder-3.mp3", "Third"),
    ];

    for (idx, track) in tracks.iter().enumerate() {
        db.add_track(track)
            .expect("seed track insert should succeed");
        db.add_track_to_playlist(&playlist_id, &track.id, idx as i32)
            .expect("add track to playlist should succeed");
    }

    let before = db
        .get_playlist_tracks(&playlist_id)
        .expect("playlist query before reorder should succeed");
    let before_ids: Vec<&str> = before.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(
        before_ids,
        vec!["reorder_track_1", "reorder_track_2", "reorder_track_3"]
    );

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
    assert_eq!(
        after_ids,
        vec!["reorder_track_2", "reorder_track_3", "reorder_track_1"]
    );

    drop(db);
    cleanup_db_files(&db_path);
}

#[test]
fn reorder_rejects_invalid_membership_without_mutation() {
    let db_path = temp_db_path("playlist_reorder_invalid");
    let db = Database::new(&db_path).expect("db init should succeed");
    let playlist_id = db
        .create_playlist("Invalid Reorder Integration")
        .expect("create playlist should succeed");
    let tracks = vec![
        sample_track("invalid_track_1", "C:/Music/invalid-1.mp3", "First"),
        sample_track("invalid_track_2", "C:/Music/invalid-2.mp3", "Second"),
        sample_track("invalid_track_3", "C:/Music/invalid-3.mp3", "Third"),
    ];
    for track in &tracks {
        db.add_track(track)
            .expect("seed track insert should succeed");
        db.add_track_to_playlist(&playlist_id, &track.id, 0)
            .expect("add track to playlist should succeed");
    }

    let invalid_orders = [
        vec![
            ("invalid_track_1".to_string(), 0),
            ("invalid_track_2".to_string(), 1),
        ],
        vec![
            ("invalid_track_1".to_string(), 0),
            ("invalid_track_1".to_string(), 1),
            ("invalid_track_3".to_string(), 2),
        ],
        vec![
            ("invalid_track_1".to_string(), 0),
            ("invalid_track_2".to_string(), 1),
            ("not_a_member".to_string(), 2),
        ],
    ];

    for order in invalid_orders {
        assert!(db.reorder_playlist_tracks(&playlist_id, order).is_err());
        let ids: Vec<String> = db
            .get_playlist_tracks(&playlist_id)
            .expect("playlist should remain queryable")
            .into_iter()
            .map(|track| track.id)
            .collect();
        assert_eq!(
            ids,
            vec!["invalid_track_1", "invalid_track_2", "invalid_track_3"]
        );
    }

    drop(db);
    cleanup_db_files(&db_path);
}

#[test]
fn duplicate_add_is_idempotent_and_keeps_positions_contiguous() {
    let db_path = temp_db_path("playlist_duplicate_add");
    let db = Database::new(&db_path).expect("db init should succeed");
    let playlist_id = db
        .create_playlist("Duplicate Add Integration")
        .expect("create playlist should succeed");
    let first = sample_track("duplicate_track_1", "C:/Music/duplicate-1.mp3", "First");
    let second = sample_track("duplicate_track_2", "C:/Music/duplicate-2.mp3", "Second");
    db.add_track(&first).expect("insert first track");
    db.add_track(&second).expect("insert second track");

    db.add_track_to_playlist(&playlist_id, &first.id, 99)
        .expect("first add");
    db.add_track_to_playlist(&playlist_id, &first.id, 99)
        .expect("duplicate add should be idempotent");
    let added = db
        .add_tracks_to_playlist_batch(
            &playlist_id,
            &[first.id.clone(), second.id.clone(), second.id.clone()],
            99,
        )
        .expect("batch add");
    assert_eq!(added, 1);

    let ids: Vec<String> = db
        .get_playlist_tracks(&playlist_id)
        .expect("playlist query")
        .into_iter()
        .map(|track| track.id)
        .collect();
    assert_eq!(ids, vec![first.id, second.id]);

    drop(db);
    cleanup_db_files(&db_path);
}
