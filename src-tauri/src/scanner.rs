use crate::database::Database;
use crate::error::error_chain;
use crate::time_utils::now_millis;
use lofty::prelude::TaggedFileExt;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Window};
use walkdir::WalkDir;

/// Standard SELECT column list for Track::from_row.
/// Every query that uses Track::from_row MUST select exactly these columns in this order.
pub const TRACK_SELECT_COLUMNS: &str = "id, path, name, title, artist, album, genre, year, track_number, disc_number, duration, date_added, rating, play_count, last_played, bitrate";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub path: String,
    pub name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i32>,
    pub track_number: Option<i32>,
    pub disc_number: Option<i32>,
    pub duration: f64,
    #[serde(default)]
    pub bitrate: Option<i32>,
    pub date_added: i64,
    #[serde(default)]
    pub rating: i32,
    #[serde(default)]
    pub play_count: i32,
    #[serde(default)]
    pub last_played: i64,
}

impl Track {
    /// Build a Track from a rusqlite Row.
    /// Expected column order matches TRACK_SELECT_COLUMNS:
    ///   id(0), path(1), name(2), title(3), artist(4), album(5),
    ///   genre(6), year(7), track_number(8), disc_number(9),
    ///   duration(10), date_added(11), rating(12), play_count(13), last_played(14)
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            title: row.get(3)?,
            artist: row.get(4)?,
            album: row.get(5)?,
            genre: row.get(6)?,
            year: row.get(7)?,
            track_number: row.get(8)?,
            disc_number: row.get(9)?,
            duration: row.get(10)?,
            bitrate: row.get(15)?,
            date_added: row.get(11)?,
            rating: row.get(12).unwrap_or(0),
            play_count: row.get(13).unwrap_or(0),
            last_played: row.get(14).unwrap_or(0),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize)]
struct ScanSummary {
    total: usize,
    imported: usize,
    failed: usize,
    first_error: Option<String>,
}

pub struct Scanner;

/// Supported audio file extensions, shared with watcher module.
pub const AUDIO_EXTENSIONS: [&str; 7] = ["mp3", "m4a", "flac", "wav", "ogg", "opus", "aac"];

impl Scanner {
    /// Collect all audio file paths from a directory tree.
    fn collect_audio_files(path: &str) -> Result<Vec<std::path::PathBuf>, String> {
        let root_path = std::path::Path::new(path);
        // Canonicalize once so symlink resolution comparisons are consistent.
        // Falls back to the original path on error (e.g. unusual Windows paths).
        let canonical_root = root_path
            .canonicalize()
            .unwrap_or_else(|_| root_path.to_path_buf());

        let entries = WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_entry(|entry| {
                if !entry.path_is_symlink() {
                    return true;
                }

                match entry.path().canonicalize() {
                    Ok(resolved) if resolved.starts_with(&canonical_root) => true,
                    Ok(resolved) => {
                        warn!(
                            "Scanner: skipping out-of-root symlink {:?} -> {:?}",
                            entry.path(),
                            resolved
                        );
                        false
                    }
                    Err(_) => {
                        warn!("Scanner: skipping broken symlink {:?}", entry.path());
                        false
                    }
                }
            });

        let mut files = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|error| format!("Unable to scan folder: {error}"))?;
            if entry.file_type().is_file()
                && entry
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                    .unwrap_or(false)
            {
                files.push(entry.into_path());
            }
        }
        Ok(files)
    }

    /// Shared processing loop for scanning audio files.
    /// Handles cancellation, progress events, failure diagnostics, and extraction.
    fn process_files(
        root: &str,
        files: &[std::path::PathBuf],
        window: Option<&Window>,
        cancel_flag: &Option<Arc<AtomicBool>>,
        db: Option<&Database>,
    ) -> Result<Vec<Track>, String> {
        let mut tracks = Vec::new();
        let total = files.len();
        let mut failures = 0;
        let mut first_error = None;

        if let Some(win) = window {
            let _ = win.emit("scan-total", total);
        }

        for (i, path_buf) in files.iter().enumerate() {
            // Check for cancellation
            if let Some(flag) = cancel_flag
                && flag.load(Ordering::Relaxed)
            {
                warn!("Scan cancelled after {} files", i);
                if let Some(win) = window {
                    let _ = win.emit("scan-cancelled", i);
                }
                return Ok(tracks);
            }

            let processed = i + 1;
            let path_str = path_buf.to_string_lossy().to_string();

            // Emit progress update
            if let Some(win) = window
                && (processed == 1 || processed == total || processed.is_multiple_of(25))
            {
                let progress = ScanProgress {
                    current: processed,
                    total,
                    current_file: path_buf
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("Unknown")
                        .to_string(),
                };
                let _ = win.emit("scan-progress", &progress);
            }

            match Self::extract_track_info(path_buf) {
                Ok(mut track) => {
                    // A past parser/I/O failure is not a permanent blacklist.
                    if let Some(database) = db
                        && let Err(error) = database.remove_failed_track(&path_str)
                    {
                        warn!("Unable to clear recovered scan failure: {error}");
                    }
                    // Track IDs are durable foreign keys. Preserve the ID already
                    // assigned to a path so rescans update the row in place instead
                    // of deleting/recreating it and cascading playlist/art data.
                    if let Some(database) = db
                        && let Ok(Some(existing)) = database.get_track_by_path(&track.path)
                    {
                        track.id = existing.id;
                        track.date_added = existing.date_added;
                        track.rating = existing.rating;
                        track.play_count = existing.play_count;
                        track.last_played = existing.last_played;
                    }
                    tracks.push(track)
                }
                Err(e) => {
                    failures += 1;
                    first_error.get_or_insert_with(|| format!("{}: {e}", path_buf.display()));
                    error!("Failed to extract info from {:?}: {}", path_buf, e);
                    if let Some(database) = db {
                        let _ = database.add_failed_track(&path_str, &e);
                    }
                    if let Some(win) = window {
                        let _ = win.emit(
                            "scan-error",
                            format!("Failed to read: {:?}", path_buf.file_name()),
                        );
                    }
                }
            }
        }

        if let Some(database) = db {
            let _ = database.record_library_scan(
                root,
                total,
                tracks.len(),
                failures,
                first_error.as_deref(),
            );
        }

        if tracks.is_empty()
            && let Some(first_error) = &first_error
        {
            return Err(format!(
                "Found {total} audio files, but none could be read. First error: {first_error}"
            ));
        }

        info!(
            "Scan completed: {} tracks successfully extracted, {} failed out of {} files",
            tracks.len(),
            failures,
            total
        );
        if let Some(win) = window {
            let _ = win.emit(
                "scan-summary",
                ScanSummary {
                    total,
                    imported: tracks.len(),
                    failed: failures,
                    first_error,
                },
            );
        }

        Ok(tracks)
    }

    /// Perform incremental scan: only process new or modified files
    pub fn scan_directory_incremental(
        path: &str,
        window: Option<&Window>,
        cancel_flag: Option<Arc<AtomicBool>>,
        db: &Database,
    ) -> Result<Vec<Track>, String> {
        info!("Starting incremental directory scan: {}", path);

        // Check for cancellation before starting
        if let Some(flag) = &cancel_flag
            && flag.load(Ordering::Relaxed)
        {
            warn!("Incremental scan cancelled before starting");
            return Ok(Vec::new());
        }

        // Get existing tracks with their modification times
        let existing_tracks_list = db
            .get_folder_tracks(path)
            .map_err(|e| format!("Failed to get existing tracks: {}", e))?;
        use std::collections::HashMap;
        let existing_tracks: HashMap<String, i64> = existing_tracks_list
            .into_iter()
            .map(|(_, path, mtime)| (path, mtime))
            .collect();

        // Collect all audio files and filter to only new/modified
        let all_files = Self::collect_audio_files(path)?;
        let files_to_scan: Vec<std::path::PathBuf> = all_files
            .into_iter()
            .filter(|path_buf| {
                let path_str = path_buf.to_string_lossy().to_string();
                if let Some(&stored_mtime) = existing_tracks.get(&path_str) {
                    // File exists in DB — check if modified
                    std::fs::metadata(path_buf)
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .map(|modified| {
                            let current_mtime = modified
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs() as i64;
                            current_mtime > stored_mtime
                        })
                        .unwrap_or(false)
                } else {
                    true // Not in DB — needs scanning
                }
            })
            .collect();

        info!(
            "Incremental scan: {} files need processing (new or modified)",
            files_to_scan.len()
        );

        Self::process_files(path, &files_to_scan, window, &cancel_flag, Some(db))
    }

    pub fn scan_directory(
        path: &str,
        window: Option<&Window>,
        cancel_flag: Option<Arc<AtomicBool>>,
        db: Option<&Database>,
    ) -> Result<Vec<Track>, String> {
        info!("Starting directory scan: {}", path);

        // Check for cancellation before starting
        if let Some(flag) = &cancel_flag
            && flag.load(Ordering::Relaxed)
        {
            warn!("Scan cancelled before starting");
            return Ok(Vec::new());
        }

        let files = Self::collect_audio_files(path)?;
        info!("Found {} audio files to scan", files.len());

        Self::process_files(path, &files, window, &cancel_flag, db)
    }

    pub fn extract_track_info(path: &Path) -> Result<Track, String> {
        use lofty::prelude::{Accessor, AudioFile};
        use lofty::probe::Probe;

        let options = lofty::config::ParseOptions::new()
            .parsing_mode(lofty::config::ParsingMode::Relaxed)
            .read_cover_art(false);
        let tagged_file = Probe::open(path)
            .map_err(|e| e.to_string())?
            .options(options)
            .guess_file_type()
            .map_err(|e| e.to_string())?
            .read()
            .map_err(|error| error_chain(&error));

        let tagged_file = match tagged_file {
            Ok(file) => file,
            Err(metadata_error) => {
                // Metadata errors must not hide audio the playback reader supports.
                warn!(
                    "Metadata reader failed for {}: {metadata_error}; trying audio reader",
                    path.display()
                );
                return Self::extract_with_symphonia(path).map_err(|audio_error| {
                    format!("Metadata reader: {metadata_error}; audio reader: {audio_error}")
                });
            }
        };

        let tags = tagged_file
            .primary_tag()
            .or_else(|| tagged_file.first_tag());

        let title = tags.and_then(|t| t.title().map(|s| s.to_string()));
        let artist = tags.and_then(|t| t.artist().map(|s| s.to_string()));
        let album = tags.and_then(|t| t.album().map(|s| s.to_string()));
        let genre = tags.and_then(|t| t.genre().map(|s| s.to_string()));
        let year = tags.and_then(|t| t.date()).map(|date| i32::from(date.year));
        let track_number = tags.and_then(|t| t.track()).map(|n| n as i32);
        let disc_number = tags.and_then(|t| t.disk()).map(|n| n as i32);

        let duration = tagged_file.properties().duration().as_secs_f64();
        let bitrate = tagged_file
            .properties()
            .audio_bitrate()
            .and_then(|value| i32::try_from(value).ok());

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let path_str = path.to_string_lossy().to_string();
        let id = Self::track_id_for_path(path);

        let now = now_millis();

        Ok(Track {
            id,
            path: path_str,
            name: file_name,
            title,
            artist,
            album,
            genre,
            year,
            track_number,
            disc_number,
            duration,
            bitrate,
            date_added: now,
            rating: 0,
            play_count: 0,
            last_played: 0,
        })
    }

    fn extract_with_symphonia(path: &Path) -> Result<Track, String> {
        use symphonia::core::common::Limit;
        use symphonia::core::formats::probe::Hint;
        use symphonia::core::formats::{FormatOptions, TrackType};
        use symphonia::core::io::MediaSourceStream;
        use symphonia::core::meta::{MetadataOptions, StandardTag};

        let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
        let stream = MediaSourceStream::new(Box::new(file), Default::default());
        let mut hint = Hint::new();
        if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
            hint.with_extension(extension);
        }
        let mut format = symphonia::default::get_probe()
            .probe(
                &hint,
                stream,
                FormatOptions::default(),
                MetadataOptions::default().limit_visual_bytes(Limit::Maximum(0)),
            )
            .map_err(|error| error_chain(&error))?;
        let audio = format
            .default_track(TrackType::Audio)
            .ok_or_else(|| "No audio track found".to_string())?;
        if audio
            .codec_params
            .as_ref()
            .and_then(|params| params.audio())
            .is_none()
        {
            return Err("No audio codec parameters found".to_string());
        }
        let audio_id = u64::from(audio.id);
        let duration = audio
            .time_base
            .zip(audio.duration)
            .and_then(|(base, duration)| base.calc_duration(duration))
            .map(|time| time.as_secs_f64())
            .unwrap_or(0.0);
        let mut track = Track {
            bitrate: None,
            id: Self::track_id_for_path(path),
            path: path.to_string_lossy().into_owned(),
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Unknown")
                .to_string(),
            title: None,
            artist: None,
            album: None,
            genre: None,
            year: None,
            track_number: None,
            disc_number: None,
            duration,
            date_added: now_millis(),
            rating: 0,
            play_count: 0,
            last_played: 0,
        };
        let mut metadata = format.metadata();
        while let Some(revision) = metadata.current() {
            let tags = revision.media.tags.iter().chain(
                revision
                    .per_track
                    .iter()
                    .filter(|entry| entry.track_id == audio_id)
                    .flat_map(|entry| entry.metadata.tags.iter()),
            );
            for tag in tags {
                match tag.std.as_ref() {
                    Some(StandardTag::TrackTitle(value)) => track.title = Some(value.to_string()),
                    Some(StandardTag::Artist(value)) => track.artist = Some(value.to_string()),
                    Some(StandardTag::Album(value)) => track.album = Some(value.to_string()),
                    Some(StandardTag::Genre(value)) => track.genre = Some(value.to_string()),
                    Some(StandardTag::TrackNumber(value)) => {
                        track.track_number = i32::try_from(*value).ok()
                    }
                    Some(StandardTag::DiscNumber(value)) => {
                        track.disc_number = i32::try_from(*value).ok()
                    }
                    Some(StandardTag::RecordingYear(value) | StandardTag::ReleaseYear(value)) => {
                        track.year = Some(i32::from(*value));
                    }
                    Some(StandardTag::RecordingDate(value) | StandardTag::ReleaseDate(value)) => {
                        track.year = value.get(..4).and_then(|year| year.parse().ok());
                    }
                    _ => {}
                }
            }
            if metadata.pop().is_none() {
                break;
            }
        }
        warn!(
            "Recovered metadata using audio reader for {}",
            path.display()
        );
        Ok(track)
    }

    /// Produce a compact, deterministic ID without embedding a potentially
    /// sensitive full path. Two independently-seeded FNV-1a passes provide a
    /// 128-bit namespace; an existing database row still wins during rescans.
    fn track_id_for_path(path: &Path) -> String {
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let mut normalized = canonical.to_string_lossy().replace('/', "\\");
        if cfg!(windows) {
            normalized.make_ascii_lowercase();
        }

        fn fnv1a(bytes: &[u8], seed: u64) -> u64 {
            bytes.iter().fold(seed, |hash, byte| {
                (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
            })
        }

        let bytes = normalized.as_bytes();
        let high = fnv1a(bytes, 0xcbf2_9ce4_8422_2325);
        let low = fnv1a(bytes, 0x8422_2325_cbf2_9ce4);
        format!("track_{high:016x}{low:016x}")
    }

    /// Extract album art from audio file
    pub fn extract_album_art(path: &str) -> Result<Option<Vec<u8>>, String> {
        use lofty::probe::Probe;

        let tagged_file = Probe::open(path)
            .map_err(|e| format!("Failed to open file: {}", e))?
            .read()
            .map_err(|e| format!("Failed to read file: {}", error_chain(&e)))?;

        let tags = tagged_file
            .primary_tag()
            .or_else(|| tagged_file.first_tag());

        if let Some(tag) = tags
            && let Some(picture) = tag.pictures().first()
        {
            return Ok(Some(picture.data().to_vec()));
        }

        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::Arc;

    fn temp_scan_dir(test_name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "vplayer_scanner_test_{}_{}",
            test_name,
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn collect_audio_files_filters_by_supported_extensions_case_insensitive() {
        let dir = temp_scan_dir("extensions");
        fs::create_dir_all(&dir).expect("create temp scan dir failed");

        let mp3 = dir.join("song1.MP3");
        let flac = dir.join("song2.flac");
        let txt = dir.join("notes.txt");
        let no_ext = dir.join("README");

        fs::write(&mp3, b"dummy").expect("write mp3 placeholder failed");
        fs::write(&flac, b"dummy").expect("write flac placeholder failed");
        fs::write(&txt, b"dummy").expect("write txt placeholder failed");
        fs::write(&no_ext, b"dummy").expect("write no-ext placeholder failed");

        let mut files =
            Scanner::collect_audio_files(&dir.to_string_lossy()).expect("collect audio files");
        files.sort();

        assert_eq!(files.len(), 2);
        assert!(files.iter().any(|p| p == &mp3));
        assert!(files.iter().any(|p| p == &flac));

        let _ = fs::remove_file(mp3);
        let _ = fs::remove_file(flac);
        let _ = fs::remove_file(txt);
        let _ = fs::remove_file(no_ext);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn scan_directory_respects_pre_cancel_flag() {
        let dir = temp_scan_dir("cancel");
        fs::create_dir_all(&dir).expect("create temp scan dir failed");
        let candidate = dir.join("will-not-scan.mp3");
        fs::write(&candidate, b"dummy").expect("write candidate file failed");

        let cancel_flag = Arc::new(AtomicBool::new(true));
        let tracks = Scanner::scan_directory(&dir.to_string_lossy(), None, Some(cancel_flag), None)
            .expect("scan_directory should return Ok when pre-cancelled");

        assert!(tracks.is_empty());

        let _ = fs::remove_file(candidate);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn track_ids_do_not_collide_when_separator_replacement_would() {
        let first = std::path::Path::new(r"C:\\Music\\A_B\\song.mp3");
        let second = std::path::Path::new(r"C:\\Music\\A\\B_song.mp3");

        assert_ne!(
            Scanner::track_id_for_path(first),
            Scanner::track_id_for_path(second)
        );
        assert_eq!(
            Scanner::track_id_for_path(first),
            Scanner::track_id_for_path(first)
        );
    }
}
