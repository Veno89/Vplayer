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
fn playlist_crud_and_membership_roundtrip() {
    let db_path = temp_db_path("playlist_roundtrip");
    let db = Database::new(&db_path).expect("db init should succeed");

    let playlist_id = db
        .create_playlist("Integration Playlist")
        .expect("create playlist should succeed");

    let track = sample_track("it_track_1", "C:/Music/integration-track.mp3");
    db.add_track(&track).expect("track insert should succeed");
    db.add_track_to_playlist(&playlist_id, &track.id, 0)
        .expect("track membership insert should succeed");

    let playlists = db
        .get_all_playlists()
        .expect("playlist query should succeed");
    assert!(
        playlists.iter().any(|(id, name, _)| id == &playlist_id && name == "Integration Playlist")
    );

    let tracks = db
        .get_playlist_tracks(&playlist_id)
        .expect("playlist tracks query should succeed");
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, track.id);

    db.delete_playlist(&playlist_id)
        .expect("playlist deletion should succeed");

    let playlists_after = db
        .get_all_playlists()
        .expect("playlist query after delete should succeed");
    assert!(!playlists_after.iter().any(|(id, _, _)| id == &playlist_id));

    let tracks_after = db
        .get_playlist_tracks(&playlist_id)
        .expect("playlist tracks query after delete should succeed");
    assert!(tracks_after.is_empty());

    drop(db);
    cleanup_db_files(&db_path);
}
