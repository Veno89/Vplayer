use std::fs;
use vplayer::database::{Database, TrackFilter};
use vplayer::scanner::Track;

fn fixture() -> (std::path::PathBuf, Database) {
    let root = std::env::temp_dir().join(format!("vplayer_browser_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let db = Database::new(&root.join("library.db")).unwrap();
    db.add_folder("root", root.to_str().unwrap(), "Music", 1)
        .unwrap();
    for (index, extension, year, bitrate, plays) in [
        (0, "MP3", 2000, 320, 0),
        (1, "flac", 2020, 900, 5),
        (2, "mp3", 2024, 128, 10),
    ] {
        db.add_track(&Track {
            id: index.to_string(),
            path: root
                .join(format!("{index}.{extension}"))
                .to_string_lossy()
                .into(),
            name: format!("{index}.{extension}"),
            title: Some(format!("Song {index}")),
            artist: Some("Band".into()),
            album: Some("Album".into()),
            genre: Some("Rock".into()),
            year: Some(year),
            bitrate: Some(bitrate),
            duration: 180.0,
            date_added: index + 1,
            rating: 4,
            play_count: plays,
            last_played: 0,
            track_number: None,
            disc_number: None,
        })
        .unwrap();
    }
    (root, db)
}

#[test]
fn combined_filters_and_totals_remain_consistent_across_pages_and_selection() {
    let (root, db) = fixture();
    let filter = TrackFilter {
        artist: Some("Band".into()),
        album: Some("Album".into()),
        year_from: Some(2000),
        year_to: Some(2020),
        format: Some("mp3".into()),
        bitrate_min: Some(256),
        play_count_max: Some(0),
        ..Default::default()
    };
    let overview = db.library_overview(&filter).unwrap();
    assert_eq!(overview.total_tracks, 3);
    assert_eq!(overview.matching_tracks, 1);
    assert_eq!(overview.folders[0].total_tracks, 3);
    assert_eq!(overview.folders[0].matching_tracks, 1);
    assert_eq!(overview.folders[0].availability, "available");
    let (tracks, total) = db.get_tracks_page(filter.clone(), 0, 200).unwrap();
    assert_eq!(total, 1);
    assert_eq!(tracks[0].bitrate, Some(320));
    assert_eq!(
        db.selected_library_tracks(filter, &[0, 0, 1000])
            .unwrap()
            .len(),
        1
    );
    let facets = db
        .library_facets("albums", &TrackFilter::default())
        .unwrap();
    assert_eq!(facets.len(), 1);
    assert_eq!(facets[0].count, 3);
    drop(db);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn offline_root_keeps_its_tracks_and_scan_diagnostics_survive_reopening() {
    let (root, db) = fixture();
    let missing = root.join("unplugged");
    let path = missing.to_str().unwrap();
    db.add_folder("offline", path, "External", 1).unwrap();
    db.begin_library_scan(path).unwrap();
    db.record_library_scan(path, 10, 2, 8, Some("Access denied"))
        .unwrap();
    db.finish_library_scan(path, None).unwrap();
    assert_eq!(
        db.library_overview(&TrackFilter::default())
            .unwrap()
            .total_tracks,
        3
    );
    drop(db);
    let db = Database::new(&root.join("library.db")).unwrap();
    let report = db.library_overview(&TrackFilter::default()).unwrap();
    let folder = report
        .folders
        .iter()
        .find(|folder| folder.id == "offline")
        .unwrap();
    assert_eq!(folder.availability, "offline");
    assert_eq!(folder.failed, 8);
    assert_eq!(folder.first_error.as_deref(), Some("Access denied"));
    assert!(folder.last_success.is_none());
    drop(db);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn date_added_sort_and_explicit_selection_follow_the_same_order() {
    let (root, db) = fixture();
    let filter = TrackFilter {
        sort_by: Some("dateAdded".into()),
        sort_desc: true,
        ..Default::default()
    };
    let (page, total) = db.get_tracks_page(filter.clone(), 1, 1).unwrap();
    assert_eq!(total, 3);
    assert_eq!(page[0].id, "1");
    let selected = db.selected_library_tracks(filter, &[2, 0]).unwrap();
    assert_eq!(
        selected
            .iter()
            .map(|track| track.id.as_str())
            .collect::<Vec<_>>(),
        ["2", "0"]
    );
    drop(db);
    fs::remove_dir_all(root).unwrap();
}
