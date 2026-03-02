use std::path::{Path, PathBuf};

use vplayer::database::Database;
use vplayer::replaygain::{analyze_album_replaygain, get_album_replaygain};
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

fn sample_track(id: &str, title: &str, artist: &str, album: &str, duration: f64) -> Track {
    Track {
        id: id.to_string(),
        path: format!("C:/Music/{}.mp3", id),
        name: format!("{}.mp3", id),
        title: Some(title.to_string()),
        artist: Some(artist.to_string()),
        album: Some(album.to_string()),
        genre: Some("Rock".to_string()),
        year: Some(2024),
        track_number: Some(1),
        disc_number: Some(1),
        duration,
        date_added: now_millis(),
        rating: 0,
        play_count: 0,
        last_played: 0,
    }
}

#[test]
fn analyze_album_replaygain_derives_and_caches_album_data() {
    let db_path = temp_db_path("album_replaygain");
    let db = Database::new(&db_path).expect("db init should succeed");

    let tracks = vec![
        sample_track("arg_track_1", "A", "Band A", "Album A", 100.0),
        sample_track("arg_track_2", "B", "Band A", "Album A", 200.0),
    ];

    for t in &tracks {
        db.add_track(t).expect("track insert should succeed");
    }

    {
        let conn = db.conn.lock().unwrap_or_else(|p| p.into_inner());
        conn.execute(
            "UPDATE tracks SET track_gain = ?1, track_peak = ?2, loudness = ?3 WHERE id = ?4",
            rusqlite::params![-4.0_f64, 0.70_f64, -20.0_f64, "arg_track_1"],
        )
        .expect("update rg track1 should succeed");
        conn.execute(
            "UPDATE tracks SET track_gain = ?1, track_peak = ?2, loudness = ?3 WHERE id = ?4",
            rusqlite::params![-2.0_f64, 0.90_f64, -18.0_f64, "arg_track_2"],
        )
        .expect("update rg track2 should succeed");
    }

    let derived = analyze_album_replaygain(&db.conn, "Band A", "Album A")
        .expect("album analysis should succeed")
        .expect("album data should be present");

    // Duration-weighted gain: (-4*100 + -2*200) / 300 = -2.666...
    assert!((derived.album_gain + 2.666_666).abs() < 0.01);
    assert_eq!(derived.track_count, 2);
    assert!((derived.album_peak - 0.90).abs() < 0.0001);

    let cached = get_album_replaygain(&db.conn, "Band A", "Album A")
        .expect("album cache query should succeed")
        .expect("cached album data should exist");

    assert!((cached.album_gain - derived.album_gain).abs() < 0.0001);
    assert_eq!(cached.track_count, 2);

    drop(db);
    cleanup_db_files(&db_path);
}
