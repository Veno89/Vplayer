use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use vplayer::scanner::Scanner;

fn temp_dir(test_name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "vplayer_scanner_test_{}_{}",
        test_name,
        uuid::Uuid::new_v4()
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
    fs::write(dir.join("image.png"), [0x89, 0x50, 0x4E, 0x47]).unwrap();
    fs::write(dir.join("data.json"), r#"{"key":"value"}"#).unwrap();

    let tracks = Scanner::scan_directory(dir.to_str().unwrap(), None, None, None)
        .expect("scan should succeed");
    assert!(tracks.is_empty(), "non-audio files should not be picked up");
    cleanup(&dir);
}

#[test]
fn scan_nonexistent_directory_reports_error() {
    let dir = std::env::temp_dir().join("vplayer_scan_nonexistent_dir_that_does_not_exist");
    // Ensure it really doesn't exist
    let _ = fs::remove_dir_all(&dir);

    let error = Scanner::scan_directory(dir.to_str().unwrap(), None, None, None)
        .expect_err("an unavailable folder must not look like an empty library");
    assert!(error.contains("Unable to scan folder"));
}

#[test]
fn scan_corrupt_mp3_records_failure_but_does_not_crash() {
    let dir = temp_dir("corrupt");
    // Write garbage bytes with an .mp3 extension
    fs::write(
        dir.join("corrupt.mp3"),
        b"this is not a valid mp3 file at all",
    )
    .unwrap();
    // Write another corrupt file with .flac extension
    fs::write(dir.join("bad.flac"), [0x00; 64]).unwrap();

    let error = Scanner::scan_directory(dir.to_str().unwrap(), None, None, None)
        .expect_err("a completely failed scan must not report success with zero tracks");
    assert!(error.contains("Found 2 audio files, but none could be read"));
    assert!(error.contains("First error:"));
    assert!(error.contains("audio reader:"));
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
    let tracks = Scanner::scan_directory(dir.to_str().unwrap(), None, Some(cancel), None)
        .expect("cancelled scan should succeed");

    assert!(
        tracks.is_empty(),
        "immediately cancelled scan should return no tracks"
    );
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

    let error = Scanner::scan_directory(dir.to_str().unwrap(), None, None, None)
        .expect_err("the corrupt nested file must be discovered and reported");
    assert!(error.contains("deep_track.mp3"));
    cleanup(&dir);
}

fn write_test_wav(path: &std::path::Path, broken_id3: bool) {
    const SAMPLE_RATE: u32 = 8_000;
    let mut chunks = Vec::new();
    chunks.extend_from_slice(b"fmt ");
    chunks.extend_from_slice(&16_u32.to_le_bytes());
    chunks.extend_from_slice(&1_u16.to_le_bytes()); // PCM
    chunks.extend_from_slice(&1_u16.to_le_bytes()); // mono
    chunks.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    chunks.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes());
    chunks.extend_from_slice(&2_u16.to_le_bytes());
    chunks.extend_from_slice(&16_u16.to_le_bytes());
    let mut info = b"INFO".to_vec();
    for (key, value) in [
        (b"INAM", "Recovered title"),
        (b"IART", "Recovered artist"),
        (b"IPRD", "Recovered album"),
        (b"ICRD", "2024-06-15"),
    ] {
        info.extend_from_slice(key);
        info.extend_from_slice(&(value.len() as u32 + 1).to_le_bytes());
        info.extend_from_slice(value.as_bytes());
        info.push(0);
        if !info.len().is_multiple_of(2) {
            info.push(0);
        }
    }
    chunks.extend_from_slice(b"LIST");
    chunks.extend_from_slice(&(info.len() as u32).to_le_bytes());
    chunks.extend(info);
    chunks.extend_from_slice(b"data");
    chunks.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes());
    chunks.resize(chunks.len() + SAMPLE_RATE as usize * 2, 0);
    if broken_id3 {
        // Optional ID3 chunk with an unsupported version. The PCM audio is intact.
        chunks.extend_from_slice(b"id3 ");
        chunks.extend_from_slice(&10_u32.to_le_bytes());
        chunks.extend_from_slice(b"ID3\x09\x00\x00\x00\x00\x00\x00");
    }
    let mut bytes = b"RIFF".to_vec();
    bytes.extend_from_slice(&(chunks.len() as u32 + 4).to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend(chunks);
    fs::write(path, bytes).unwrap();
}

#[test]
fn full_and_incremental_scans_retry_previously_failed_files() {
    use vplayer::database::Database;

    let dir = temp_dir("retry_failed");
    let path = dir.join("recovered.wav");
    write_test_wav(&path, false);
    let db = Database::new(&dir.join("test.db")).unwrap();

    for incremental in [false, true] {
        db.add_failed_track(path.to_str().unwrap(), "old metadata parser failure")
            .unwrap();
        let tracks = if incremental {
            Scanner::scan_directory_incremental(dir.to_str().unwrap(), None, None, &db)
        } else {
            Scanner::scan_directory(dir.to_str().unwrap(), None, None, Some(&db))
        }
        .expect("past failures must remain eligible for scanning");
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].name, "recovered.wav");
        assert!((tracks[0].duration - 1.0).abs() < 0.01);
        let failures: i64 = db
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM failed_tracks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(
            failures, 0,
            "successful retry must clear stale failure history"
        );
    }
    drop(db);
    cleanup(&dir);
}

#[test]
fn supported_audio_is_identified_by_content_even_with_wrong_extension() {
    let dir = temp_dir("wrong_extension");
    let path = dir.join("actually-wav.mp3");
    write_test_wav(&path, false);
    let track =
        Scanner::extract_track_info(&path).expect("use content rather than extension alone");
    assert!((track.duration - 1.0).abs() < 0.01);
    cleanup(&dir);
}

#[test]
fn playable_audio_survives_broken_optional_metadata() {
    use lofty::config::{ParseOptions, ParsingMode};
    use lofty::probe::Probe;

    let dir = temp_dir("broken_tags");
    let path = dir.join("broken-tags.wav");
    write_test_wav(&path, true);
    assert!(
        Probe::open(&path)
            .unwrap()
            .options(
                ParseOptions::new()
                    .parsing_mode(ParsingMode::Relaxed)
                    .read_cover_art(false)
            )
            .read()
            .is_err(),
        "fixture must exercise the audio-reader fallback"
    );
    let track = Scanner::extract_track_info(&path)
        .expect("optional tag failure must not hide supported audio");
    assert!((track.duration - 1.0).abs() < 0.01);
    cleanup(&dir);
}

#[test]
fn audio_reader_fallback_preserves_available_tags() {
    let dir = temp_dir("fallback_tags");
    let path = dir.join("prefixed.wav");
    write_test_wav(&path, false);
    let wav = fs::read(&path).unwrap();
    let mut frames = Vec::new();
    for (key, value) in [
        (b"TIT2", "Fallback title"),
        (b"TPE1", "Fallback artist"),
        (b"TALB", "Fallback album"),
        (b"TDRC", "2024"),
    ] {
        frames.extend_from_slice(key);
        frames.extend_from_slice(&[0, 0, 0, value.len() as u8 + 1]);
        frames.extend_from_slice(&[0, 0, 3]); // flags, then UTF-8 text encoding
        frames.extend_from_slice(value.as_bytes());
    }
    let len = frames.len();
    let mut bytes = b"ID3\x04\x00\x00".to_vec();
    bytes.extend_from_slice(&[
        ((len >> 21) & 0x7f) as u8,
        ((len >> 14) & 0x7f) as u8,
        ((len >> 7) & 0x7f) as u8,
        (len & 0x7f) as u8,
    ]);
    bytes.extend(frames);
    bytes.extend(wav);
    fs::write(&path, bytes).unwrap();
    let track =
        Scanner::extract_track_info(&path).expect("audio reader accepts ID3-prefixed audio");
    assert_eq!(track.title.as_deref(), Some("Fallback title"));
    assert_eq!(track.artist.as_deref(), Some("Fallback artist"));
    assert_eq!(track.album.as_deref(), Some("Fallback album"));
    assert_eq!(track.year, Some(2024));
    assert!((track.duration - 1.0).abs() < 0.01);
    cleanup(&dir);
}

#[test]
fn partial_scan_imports_readable_files_and_records_actual_failure_causes() {
    use vplayer::database::Database;

    let dir = temp_dir("partial");
    write_test_wav(&dir.join("good.wav"), false);
    fs::write(dir.join("bad.mp3"), b"not audio").unwrap();
    let db = Database::new(&dir.join("test.db")).unwrap();
    let tracks = Scanner::scan_directory(dir.to_str().unwrap(), None, None, Some(&db)).unwrap();
    assert_eq!(tracks.len(), 1);
    let error: String = db
        .conn
        .lock()
        .unwrap()
        .query_row("SELECT error FROM failed_tracks", [], |row| row.get(0))
        .unwrap();
    assert!(error.contains("Metadata reader:"));
    assert!(error.contains("audio reader:"));
    assert!(error.len() > "failed to parse Mpeg file".len());
    drop(db);
    cleanup(&dir);
}
