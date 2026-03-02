use std::path::{Path, PathBuf};

use vplayer::database::{Database, TrackFilter};
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

fn sample_track(id: &str, path: &str, title: &str, artist: &str, rating: i32) -> Track {
    Track {
        id: id.to_string(),
        path: path.to_string(),
        name: format!("{}.mp3", title.to_lowercase().replace(' ', "_")),
        title: Some(title.to_string()),
        artist: Some(artist.to_string()),
        album: Some("Integration Album".to_string()),
        genre: Some("Rock".to_string()),
        year: Some(2024),
        track_number: Some(1),
        disc_number: Some(1),
        duration: 180.0,
        date_added: now_millis(),
        rating,
        play_count: 0,
        last_played: 0,
    }
}

#[test]
fn get_filtered_tracks_respects_artist_search_and_rating() {
    let db_path = temp_db_path("library_filter");
    let db = Database::new(&db_path).expect("db init should succeed");

    let t1 = sample_track(
        "lib_it_1",
        "C:/Music/lib-it-1.mp3",
        "Rock Anthem",
        "Band A",
        0,
    );
    let t2 = sample_track(
        "lib_it_2",
        "C:/Music/lib-it-2.mp3",
        "Soft Ballad",
        "Band B",
        0,
    );
    let t3 = sample_track(
        "lib_it_3",
        "C:/Music/lib-it-3.mp3",
        "Rock Echo",
        "Band A",
        0,
    );

    db.add_track(&t1).expect("insert t1 should succeed");
    db.add_track(&t2).expect("insert t2 should succeed");
    db.add_track(&t3).expect("insert t3 should succeed");

    db.set_track_rating(&t1.id, 5)
        .expect("set rating t1 should succeed");
    db.set_track_rating(&t2.id, 2)
        .expect("set rating t2 should succeed");
    db.set_track_rating(&t3.id, 4)
        .expect("set rating t3 should succeed");

    let filter = TrackFilter {
        search_query: Some("rock".to_string()),
        artist: Some("Band A".to_string()),
        album: None,
        genre: None,
        sort_by: Some("title".to_string()),
        sort_desc: false,
        play_count_min: None,
        play_count_max: None,
        min_rating: Some(4),
        duration_from: None,
        duration_to: None,
        folder_id: None,
    };

    let filtered = db
        .get_filtered_tracks(filter)
        .expect("filtered tracks query should succeed");

    assert_eq!(filtered.len(), 2);
    assert!(filtered.iter().all(|t| t.artist.as_deref() == Some("Band A")));
    assert!(filtered.iter().all(|t| t.rating >= 4));

    let ids: Vec<&str> = filtered.iter().map(|t| t.id.as_str()).collect();
    assert!(ids.contains(&"lib_it_1"));
    assert!(ids.contains(&"lib_it_3"));

    drop(db);
    cleanup_db_files(&db_path);
}
