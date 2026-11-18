use std::sync::atomic::AtomicBool;
use vplayer::database::Database;
use vplayer::playlist_files::{FileStatus, check_playlist_files};
use vplayer::scanner::Track;

fn track(id: &str, path: &str) -> Track {
    Track {
        id: id.into(),
        path: path.into(),
        name: id.into(),
        title: None,
        artist: None,
        album: None,
        genre: None,
        year: None,
        track_number: None,
        disc_number: None,
        duration: 1.0,
        bitrate: None,
        date_added: 0,
        rating: 0,
        play_count: 0,
        last_played: 0,
    }
}
fn fixture() -> (Database, String) {
    let db = Database::new(std::path::Path::new(":memory:")).unwrap();
    let id = db.create_playlist("Original").unwrap();
    for (position, key) in ["a", "b", "c", "d"].iter().enumerate() {
        db.add_track(&track(key, &format!("C:/Music/{key}.mp3")))
            .unwrap();
        db.add_track_to_playlist(&id, key, position as i32).unwrap();
    }
    (db, id)
}
fn ids(db: &Database, id: &str) -> Vec<String> {
    db.get_playlist_tracks(id)
        .unwrap()
        .into_iter()
        .map(|track| track.id)
        .collect()
}

#[test]
fn bulk_membership_removal_is_ordered_deduplicated_and_undoable() {
    let (db, id) = fixture();
    let copy = db.duplicate_playlist(&id, "Copy").unwrap();
    let receipt = db
        .remove_playlist_tracks(&id, &["b".into(), "d".into(), "b".into(), "absent".into()])
        .unwrap();
    assert_eq!(receipt.removed, 2);
    assert_eq!(ids(&db, &id), ["a", "c"]);
    assert_eq!(ids(&db, &copy), ["a", "b", "c", "d"]);
    assert!(db.get_track_by_path("C:/Music/b.mp3").unwrap().is_some());
    // Adding after removal also verifies compact, collision-free positions.
    db.undo_playlist_removal(&receipt).unwrap();
    assert_eq!(ids(&db, &id), ["a", "b", "c", "d"]);
    assert!(db.undo_playlist_removal(&receipt).is_err());
}

#[test]
fn undo_cannot_overwrite_later_edits_or_resurrect_deleted_playlists() {
    let (db, id) = fixture();
    let receipt = db.remove_playlist_tracks(&id, &["b".into()]).unwrap();
    db.add_track_to_playlist(&id, "b", 0).unwrap();
    assert!(db.undo_playlist_removal(&receipt).is_err());
    assert_eq!(ids(&db, &id), ["a", "c", "d", "b"]);
    db.delete_playlist(&id).unwrap();
    assert!(db.undo_playlist_removal(&receipt).is_err());
    assert!(db.duplicate_playlist(&id, "Invalid").is_err());
}

#[test]
fn removal_handles_all_and_empty_requests() {
    let (db, id) = fixture();
    assert_eq!(db.remove_playlist_tracks(&id, &[]).unwrap().removed, 0);
    let receipt = db
        .remove_playlist_tracks(&id, &["a".into(), "b".into(), "c".into(), "d".into()])
        .unwrap();
    assert!(ids(&db, &id).is_empty());
    db.undo_playlist_removal(&receipt).unwrap();
    assert_eq!(ids(&db, &id).len(), 4);
}

#[test]
fn file_check_separates_missing_files_offline_roots_and_invalid_paths() {
    let root =
        std::env::temp_dir().join(format!("vplayer_playlist_check_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let existing = root.join("present.mp3");
    std::fs::write(&existing, b"metadata check does not decode audio").unwrap();
    let offline = root.join("offline");
    let tracks = [
        track("present", &existing.to_string_lossy()),
        track(
            "missing",
            &root.join("deleted/sub/song.mp3").to_string_lossy(),
        ),
        track("offline", &offline.join("song.mp3").to_string_lossy()),
        track("directory", &root.to_string_lossy()),
    ];
    let mut progress = Vec::new();
    let issues = check_playlist_files(
        &tracks,
        &[
            root.to_string_lossy().into_owned(),
            offline.to_string_lossy().into_owned(),
        ],
        &AtomicBool::new(false),
        |value| progress.push(value),
    )
    .unwrap();
    assert_eq!(issues.len(), 3);
    assert_eq!(issues[0].status, FileStatus::Missing);
    assert_eq!(issues[1].status, FileStatus::RootUnavailable);
    assert_eq!(issues[2].status, FileStatus::Inaccessible);
    assert_eq!(progress, [0, 4]);
    assert!(check_playlist_files(&tracks, &[], &AtomicBool::new(true), |_| {}).is_err());
    std::fs::remove_file(existing).unwrap();
    std::fs::remove_dir(root).unwrap();
}

#[test]
fn check_revalidates_a_root_that_goes_offline_mid_scan_and_files_restored_before_a_second_check() {
    let root =
        std::env::temp_dir().join(format!("vplayer_playlist_recheck_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let path = root.join("song.mp3");
    let roots = [root.to_string_lossy().into_owned()];
    let song = track("restored", &path.to_string_lossy());
    assert_eq!(
        check_playlist_files(
            std::slice::from_ref(&song),
            &roots,
            &AtomicBool::new(false),
            |_| {}
        )
        .unwrap()[0]
            .status,
        FileStatus::Missing
    );
    std::fs::write(&path, b"restored").unwrap();
    assert!(
        check_playlist_files(
            std::slice::from_ref(&song),
            &roots,
            &AtomicBool::new(false),
            |_| {}
        )
        .unwrap()
        .is_empty()
    );
    let mut tracks: Vec<_> = (0..32)
        .map(|index| track(&index.to_string(), &path.to_string_lossy()))
        .collect();
    tracks.push(track("gone", &root.join("gone.mp3").to_string_lossy()));
    let issues = check_playlist_files(&tracks, &roots, &AtomicBool::new(false), |checked| {
        if checked == 32 {
            std::fs::remove_file(&path).unwrap();
            std::fs::remove_dir(&root).unwrap();
        }
    })
    .unwrap();
    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].status, FileStatus::RootUnavailable);
}
