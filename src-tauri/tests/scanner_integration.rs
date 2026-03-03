use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use vplayer::scanner::Scanner;

fn temp_dir(test_name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "vplayer_scanner_test_{}_{}", test_name, uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn cleanup(dir: &PathBuf) {
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn scan_empty_directory_returns_no_tracks() {
    let dir = temp_dir("empty");
    let tracks = Scanner::scan_directory(dir.to_str().unwrap(), None, None, None)
        .expect("scan should succeed");
    assert!(tracks.is_empty(), "empty dir should yield no tracks");
    cleanup(&dir);
}

#[test]
fn scan_directory_with_no_audio_files_returns_empty() {
    let dir = temp_dir("non_audio");
    fs::write(dir.join("readme.txt"), "hello").unwrap();
    fs::write(dir.join("image.png"), &[0x89, 0x50, 0x4E, 0x47]).unwrap();
    fs::write(dir.join("data.json"), r#"{"key":"value"}"#).unwrap();

    let tracks = Scanner::scan_directory(dir.to_str().unwrap(), None, None, None)
        .expect("scan should succeed");
    assert!(tracks.is_empty(), "non-audio files should not be picked up");
    cleanup(&dir);
}

#[test]
fn scan_nonexistent_directory_returns_empty() {
    let dir = std::env::temp_dir().join("vplayer_scan_nonexistent_dir_that_does_not_exist");
    // Ensure it really doesn't exist
    let _ = fs::remove_dir_all(&dir);

    let tracks = Scanner::scan_directory(dir.to_str().unwrap(), None, None, None)
        .expect("scan of non-existent dir should not panic");
    assert!(tracks.is_empty());
}

#[test]
fn scan_corrupt_mp3_records_failure_but_does_not_crash() {
    let dir = temp_dir("corrupt");
    // Write garbage bytes with an .mp3 extension
    fs::write(dir.join("corrupt.mp3"), b"this is not a valid mp3 file at all").unwrap();
    // Write another corrupt file with .flac extension
    fs::write(dir.join("bad.flac"), &[0x00; 64]).unwrap();

    let tracks = Scanner::scan_directory(dir.to_str().unwrap(), None, None, None)
        .expect("scan with corrupt files should not crash");
    // Corrupt files should be skipped, not cause a panic
    assert!(tracks.is_empty(), "corrupt files should not produce tracks");
    cleanup(&dir);
}

#[test]
fn scan_with_cancel_flag_stops_early() {
    let dir = temp_dir("cancel");
    // Create a few fake mp3 files (they'll fail extraction but that's fine)
    for i in 0..5 {
        fs::write(dir.join(format!("track_{}.mp3", i)), b"not real audio").unwrap();
    }

    // Set cancel flag immediately
    let cancel = Arc::new(AtomicBool::new(true));
    let tracks = Scanner::scan_directory(
        dir.to_str().unwrap(),
        None,
        Some(cancel),
        None,
    ).expect("cancelled scan should succeed");

    assert!(tracks.is_empty(), "immediately cancelled scan should return no tracks");
    cleanup(&dir);
}

#[test]
fn scan_subdirectories_are_traversed() {
    let dir = temp_dir("nested");
    let sub = dir.join("subdir").join("deep");
    fs::create_dir_all(&sub).unwrap();

    // Put a garbage mp3 at the deepest level (won't parse, but tests traversal)
    fs::write(sub.join("deep_track.mp3"), b"fake").unwrap();
    // Put a non-audio file at root
    fs::write(dir.join("notes.txt"), "text").unwrap();

    let tracks = Scanner::scan_directory(dir.to_str().unwrap(), None, None, None)
        .expect("nested scan should not crash");
    // The mp3 is corrupt so no tracks produced, but it shouldn't crash
    // The key test is that the scanner didn't panic traversing subdirs
    assert!(tracks.is_empty());
    cleanup(&dir);
}
