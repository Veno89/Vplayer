use rusqlite::Connection;
use std::path::{Path, PathBuf};
use vplayer::database::Database;
use vplayer::database_library_integrity::DuplicateSensitivity;
use vplayer::scanner::Track;
use vplayer::time_utils::now_millis;

fn temp_root(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "vplayer_library_integrity_{}_{}",
        test_name,
        uuid::Uuid::new_v4()
    ))
}

fn sample_track(id: &str, path: &Path, title: &str) -> Track {
    Track {
        id: id.to_string(),
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        title: Some(title.to_string()),
        artist: Some("Integrity Artist".to_string()),
        album: Some("Integrity Album".to_string()),
        genre: Some("Test".to_string()),
        year: Some(2026),
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
fn repair_snapshots_then_removes_only_orphan_records_without_touching_audio_files() {
    let root = temp_root("repair");
    let library_root = root.join("registered");
    let orphan_root = root.join("legacy");
    std::fs::create_dir_all(&library_root).expect("create registered folder");
    std::fs::create_dir_all(&orphan_root).expect("create legacy folder");

    let valid_file = library_root.join("valid.mp3");
    let orphan_file_a = orphan_root.join("orphan-a.mp3");
    let orphan_file_b = orphan_root.join("orphan-b.mp3");
    for file in [&valid_file, &orphan_file_a, &orphan_file_b] {
        std::fs::write(file, b"test audio sentinel").expect("write sentinel audio file");
    }

    let db_path = root.join("vplayer.db");
    let backup_path = root.join("before-repair.db");
    let db = Database::new(&db_path).expect("db init");
    db.add_folder(
        "registered-folder",
        &library_root.to_string_lossy(),
        "registered",
        now_millis(),
    )
    .expect("register folder");

    let valid_track = sample_track("valid", &valid_file, "Valid");
    let orphan_a = sample_track("orphan-a", &orphan_file_a, "Orphan A");
    let orphan_b = sample_track("orphan-b", &orphan_file_b, "Orphan B");
    for track in [&valid_track, &orphan_a, &orphan_b] {
        db.add_track(track).expect("insert track");
    }
    let playlist_id = db.create_playlist("Legacy links").expect("create playlist");
    db.add_track_to_playlist(&playlist_id, &orphan_a.id, 0)
        .expect("link orphan track");

    let before = db.get_library_integrity().expect("inspect before repair");
    assert_eq!(before.total_tracks, 3);
    assert_eq!(before.registered_tracks, 1);
    assert_eq!(before.orphan_tracks, 2);

    let result = db
        .repair_library_integrity(&backup_path)
        .expect("repair should succeed after snapshot");
    assert_eq!(result.before, before);
    assert_eq!(result.removed_tracks, 2);
    assert_eq!(result.after.total_tracks, 1);
    assert_eq!(result.after.registered_tracks, 1);
    assert_eq!(result.after.orphan_tracks, 0);
    assert_eq!(result.backup_path, backup_path.to_string_lossy());

    let remaining = db.get_all_tracks().expect("read valid library tracks");
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, valid_track.id);
    assert!(
        db.get_playlist_tracks(&playlist_id)
            .expect("read repaired playlist")
            .is_empty()
    );

    // Repair only changes database records. Every source file must remain.
    assert!(valid_file.is_file());
    assert!(orphan_file_a.is_file());
    assert!(orphan_file_b.is_file());

    let backup = Connection::open(&backup_path).expect("open recoverable snapshot");
    let snapshot_tracks: i64 = backup
        .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
        .expect("count snapshot tracks");
    assert_eq!(snapshot_tracks, 3);
    drop(backup);
    drop(db);
    std::fs::remove_dir_all(&root).expect("remove isolated test root");
}

#[test]
fn medium_duplicate_cleanup_snapshots_and_preserves_playlist_order() {
    let root = temp_root("duplicates");
    let library_root = root.join("registered");
    let orphan_root = root.join("legacy");
    std::fs::create_dir_all(&library_root).expect("create registered folder");
    std::fs::create_dir_all(&orphan_root).expect("create legacy folder");

    let db_path = root.join("vplayer.db");
    let backup_path = root.join("before-duplicate-cleanup.db");
    let db = Database::new(&db_path).expect("db init");
    db.add_folder(
        "registered-folder",
        &library_root.to_string_lossy(),
        "registered",
        now_millis(),
    )
    .expect("register folder");

    let retained_file = library_root.join("retained.mp3");
    std::fs::write(&retained_file, b"existing audio sentinel").expect("write retained audio");
    let tracks = [
        sample_track("before", &library_root.join("before.mp3"), "Before"),
        sample_track(
            "duplicate-1",
            &library_root.join("missing.mp3"),
            "Same Song",
        ),
        sample_track("middle", &library_root.join("middle.mp3"), "Middle"),
        sample_track("duplicate-2", &retained_file, "Same Song"),
        sample_track("after", &library_root.join("after.mp3"), "After"),
        sample_track(
            "legacy-duplicate",
            &orphan_root.join("legacy.mp3"),
            "Same Song",
        ),
    ];
    for track in &tracks {
        db.add_track(track).expect("insert duplicate candidate");
    }

    let groups = db.find_duplicates().expect("find scoped duplicates");
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].len(), 2);
    assert!(!groups[0].iter().any(|track| track.id == "legacy-duplicate"));

    let playlist_id = db
        .create_playlist("Preserved order")
        .expect("create playlist");
    for (position, track_id) in ["before", "duplicate-1", "middle", "duplicate-2", "after"]
        .iter()
        .enumerate()
    {
        db.add_track_to_playlist(&playlist_id, track_id, position as i32)
            .expect("add playlist membership");
    }

    let result = db
        .remove_library_duplicates(DuplicateSensitivity::Medium, &backup_path)
        .expect("atomic duplicate cleanup");
    assert_eq!(result.removed_tracks, 1);
    assert_eq!(result.removed_folders, 0);
    assert_eq!(result.backup_path, backup_path.to_string_lossy());

    let integrity = db.get_library_integrity().expect("inspect cleaned library");
    assert_eq!(integrity.total_tracks, 5);
    assert_eq!(integrity.registered_tracks, 4);
    assert_eq!(integrity.orphan_tracks, 1);
    let playlist_tracks = db
        .get_playlist_tracks(&playlist_id)
        .expect("read preserved playlist");
    assert_eq!(
        playlist_tracks
            .iter()
            .map(|track| track.id.as_str())
            .collect::<Vec<_>>(),
        vec!["before", "duplicate-2", "middle", "after"]
    );
    let positions = {
        let snapshot = Connection::open(&backup_path).expect("open duplicate snapshot");
        let original_track_count: i64 = snapshot
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
            .expect("count snapshot tracks");
        assert_eq!(original_track_count, 6);
        let original_memberships: i64 = snapshot
            .query_row("SELECT COUNT(*) FROM playlist_tracks", [], |row| row.get(0))
            .expect("count snapshot memberships");
        assert_eq!(original_memberships, 5);

        let conn = db.conn.lock().expect("lock live database");
        let mut stmt = conn
            .prepare(
                "SELECT position FROM playlist_tracks
                 WHERE playlist_id = ?1 ORDER BY position",
            )
            .expect("prepare positions");
        stmt.query_map([&playlist_id], |row| row.get::<_, i64>(0))
            .expect("query positions")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("collect positions")
    };
    assert_eq!(positions, vec![0, 1, 2, 3]);

    drop(db);
    std::fs::remove_dir_all(&root).expect("remove isolated test root");
}

#[test]
fn low_sensitivity_only_merges_exact_path_identity() {
    let root = temp_root("low_sensitivity");
    let library_root = root.join("registered");
    std::fs::create_dir_all(&library_root).expect("create registered folder");

    let db = Database::new(&root.join("vplayer.db")).expect("db init");
    db.add_folder(
        "registered-folder",
        &library_root.to_string_lossy(),
        "registered",
        now_millis(),
    )
    .expect("register folder");

    let same_path = library_root.join("same.mp3");
    for track in [
        sample_track("same-path-a", &same_path, "Same Song"),
        sample_track("same-path-b", &same_path, "Same Song"),
        sample_track(
            "different-path",
            &library_root.join("other.mp3"),
            "Same Song",
        ),
    ] {
        db.add_track(&track).expect("insert duplicate candidate");
    }

    let preview = db
        .find_duplicates_with_sensitivity(DuplicateSensitivity::Low)
        .expect("preview low duplicates");
    assert_eq!(
        preview.iter().map(|group| group.len() - 1).sum::<usize>(),
        1
    );
    let backup_path = root.join("low-backup.db");
    let result = db
        .remove_library_duplicates(DuplicateSensitivity::Low, &backup_path)
        .expect("low cleanup");
    assert_eq!(result.removed_tracks, 1);
    assert!(backup_path.is_file());
    assert_eq!(db.get_all_tracks().expect("remaining tracks").len(), 2);

    drop(db);
    std::fs::remove_dir_all(&root).expect("remove isolated test root");
}

#[test]
fn high_sensitivity_normalizes_metadata_but_does_not_cross_albums() {
    let root = temp_root("high_sensitivity");
    let library_root = root.join("registered");
    std::fs::create_dir_all(&library_root).expect("create registered folder");

    let db = Database::new(&root.join("vplayer.db")).expect("db init");
    db.add_folder(
        "registered-folder",
        &library_root.to_string_lossy(),
        "registered",
        now_millis(),
    )
    .expect("register folder");

    let exact = sample_track("exact", &library_root.join("exact.mp3"), "Same Song");
    let mut normalized = sample_track(
        "normalized",
        &library_root.join("normalized.mp3"),
        "  SAME   SONG ",
    );
    normalized.artist = Some(" integrity   ARTIST ".to_string());
    normalized.album = Some("INTEGRITY album".to_string());
    normalized.duration = 182.5;
    let mut other_album = sample_track(
        "other-album",
        &library_root.join("other-album.mp3"),
        "same song",
    );
    other_album.artist = Some("integrity artist".to_string());
    other_album.album = Some("Different Album".to_string());
    for track in [exact, normalized, other_album] {
        db.add_track(&track).expect("insert high candidate");
    }

    let preview = db
        .find_duplicates_with_sensitivity(DuplicateSensitivity::High)
        .expect("preview high duplicates");
    assert_eq!(
        preview.iter().map(|group| group.len() - 1).sum::<usize>(),
        1
    );
    let backup_path = root.join("high-backup.db");
    let result = db
        .remove_library_duplicates(DuplicateSensitivity::High, &backup_path)
        .expect("high cleanup");
    assert_eq!(result.removed_tracks, 1);
    let remaining = db.get_all_tracks().expect("remaining tracks");
    assert_eq!(remaining.len(), 2);
    assert!(remaining.iter().any(|track| track.id == "other-album"));

    drop(db);
    std::fs::remove_dir_all(&root).expect("remove isolated test root");
}

#[test]
fn registered_scope_handles_hundreds_of_folders_without_prefix_leaks() {
    let root = temp_root("many_folders");
    std::fs::create_dir_all(&root).expect("create test root");
    let db = Database::new(&root.join("vplayer.db")).expect("db init");

    for index in 0..400 {
        db.add_folder(
            &format!("folder-{index}"),
            &format!("C:/Music/Library {index}"),
            &format!("Library {index}"),
            now_millis(),
        )
        .expect("register folder");
    }
    db.add_track(&sample_track(
        "registered",
        Path::new("C:/Music/Library 399/track.mp3"),
        "Registered",
    ))
    .expect("add registered track");
    db.add_track(&sample_track(
        "mixed-separators",
        Path::new(r"c:\MUSIC\Library 398\track.mp3"),
        "Mixed Separators",
    ))
    .expect("add mixed-separator registered track");
    db.add_track(&sample_track(
        "prefix-sibling",
        Path::new("C:/Music/Library 399 Archive/track.mp3"),
        "Prefix Sibling",
    ))
    .expect("add prefix sibling track");

    let integrity = db.get_library_integrity().expect("inspect broad scope");
    assert_eq!(integrity.folder_count, 400);
    assert_eq!(integrity.total_tracks, 3);
    assert_eq!(integrity.registered_tracks, 2);
    assert_eq!(integrity.orphan_tracks, 1);
    let mut registered_ids = db
        .get_all_tracks()
        .expect("read registered tracks")
        .into_iter()
        .map(|track| track.id)
        .collect::<Vec<_>>();
    registered_ids.sort();
    assert_eq!(registered_ids, vec!["mixed-separators", "registered"]);

    drop(db);
    std::fs::remove_dir_all(&root).expect("remove isolated test root");
}

#[test]
fn removing_a_folder_preserves_tracks_covered_by_a_remaining_nested_root() {
    let root = temp_root("nested_remove");
    let parent = root.join("Music");
    let nested = parent.join("Keep");
    std::fs::create_dir_all(&nested).expect("create nested library root");

    let db_path = root.join("vplayer.db");
    let db = Database::new(&db_path).expect("db init");
    db.add_folder("parent", &parent.to_string_lossy(), "Music", now_millis())
        .expect("add parent folder");
    db.add_folder("nested", &nested.to_string_lossy(), "Keep", now_millis())
        .expect("add nested folder");

    db.add_track(&sample_track(
        "parent-track",
        &parent.join("remove.mp3"),
        "Parent",
    ))
    .expect("add parent track");
    db.add_track(&sample_track(
        "nested-track",
        &nested.join("keep.mp3"),
        "Nested",
    ))
    .expect("add nested track");

    db.remove_folder_with_tracks("parent", &parent.to_string_lossy())
        .expect("remove parent folder");

    let remaining = db.get_all_tracks().expect("read remaining tracks");
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, "nested-track");
    let integrity = db
        .get_library_integrity()
        .expect("inspect remaining library");
    assert_eq!(integrity.total_tracks, 1);
    assert_eq!(integrity.registered_tracks, 1);
    assert_eq!(integrity.orphan_tracks, 0);

    drop(db);
    std::fs::remove_dir_all(&root).expect("remove isolated test root");
}
