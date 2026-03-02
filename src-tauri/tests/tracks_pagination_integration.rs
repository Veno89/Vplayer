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

fn sample_track(id: &str, title: &str, artist: &str, rating: i32) -> Track {
    Track {
        id: id.to_string(),
        path: format!("C:/Music/{}.mp3", id),
        name: format!("{}.mp3", id),
        title: Some(title.to_string()),
        artist: Some(artist.to_string()),
        album: Some("Paged Album".to_string()),
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
fn get_tracks_page_returns_ordered_slice_and_total() {
    let db_path = temp_db_path("tracks_page");
    let db = Database::new(&db_path).expect("db init should succeed");

    let seed = vec![
        sample_track("page_track_1", "Alpha", "Band A", 5),
        sample_track("page_track_2", "Beta", "Band A", 4),
        sample_track("page_track_3", "Gamma", "Band B", 3),
        sample_track("page_track_4", "Delta", "Band A", 5),
        sample_track("page_track_5", "Epsilon", "Band C", 2),
    ];

    for track in &seed {
        db.add_track(track).expect("track insert should succeed");
        db.set_track_rating(&track.id, track.rating)
            .expect("set rating should succeed");
    }

    let filter = TrackFilter {
        artist: Some("Band A".to_string()),
        min_rating: Some(4),
        sort_by: Some("title".to_string()),
        sort_desc: false,
        ..TrackFilter::default()
    };

    let (first_page, total) = db
        .get_tracks_page(filter, 0, 2)
        .expect("first page query should succeed");

    assert_eq!(total, 3);
    assert_eq!(first_page.len(), 2);
    let first_titles: Vec<&str> = first_page
        .iter()
        .map(|t| t.title.as_deref().unwrap_or(""))
        .collect();
    assert_eq!(first_titles, vec!["Alpha", "Beta"]);

    let filter_page2 = TrackFilter {
        artist: Some("Band A".to_string()),
        min_rating: Some(4),
        sort_by: Some("title".to_string()),
        sort_desc: false,
        ..TrackFilter::default()
    };

    let (second_page, total_again) = db
        .get_tracks_page(filter_page2, 2, 2)
        .expect("second page query should succeed");

    assert_eq!(total_again, 3);
    assert_eq!(second_page.len(), 1);
    assert_eq!(second_page[0].title.as_deref(), Some("Delta"));

    drop(db);
    cleanup_db_files(&db_path);
}
