use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use walkdir::WalkDir;
use log::{info, warn, error};
use lofty::TaggedFileExt;
use tauri::{Window, Emitter};
use crate::database::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub path: String,
    pub name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: f64,
    pub date_added: i64,
    #[serde(default)]
    pub rating: i32,
}

impl Track {
    /// Build a Track from a rusqlite Row.
    /// Expected column order: id, path, name, title, artist, album, duration, date_added, rating
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            title: row.get(3)?,
            artist: row.get(4)?,
            album: row.get(5)?,
            duration: row.get(6)?,
            date_added: row.get(7)?,
            rating: row.get(8)?,
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

pub struct Scanner;

const AUDIO_EXTENSIONS: [&str; 7] = ["mp3", "m4a", "flac", "wav", "ogg", "opus", "aac"];

impl Scanner {
    /// Collect all audio file paths from a directory tree.
    fn collect_audio_files(path: &str) -> Vec<std::path::PathBuf> {
        WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .filter(|e| {
                e.path().extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                    .unwrap_or(false)
            })
            .map(|e| e.path().to_path_buf())
            .collect()
    }

    /// Shared processing loop for scanning audio files.
    /// Handles cancellation, progress events, failed-track skipping, and extraction.
    fn process_files(
        files: &[std::path::PathBuf],
        window: Option<&Window>,
        cancel_flag: &Option<Arc<AtomicBool>>,
        db: Option<&Database>,
    ) -> Result<Vec<Track>, String> {
        let mut tracks = Vec::new();
        let total = files.len();

        if let Some(win) = window {
            let _ = win.emit("scan-total", total);
        }

        for (i, path_buf) in files.iter().enumerate() {
            // Check for cancellation
            if let Some(flag) = cancel_flag {
                if flag.load(Ordering::Relaxed) {
                    warn!("Scan cancelled after {} files", i);
                    if let Some(win) = window {
                        let _ = win.emit("scan-cancelled", i);
                    }
                    return Ok(tracks);
                }
            }

            let processed = i + 1;
            let path_str = path_buf.to_string_lossy().to_string();

            // Skip if this path previously failed
            if let Some(database) = db {
                if database.is_failed_track(&path_str) {
                    if let Some(win) = window {
                        let _ = win.emit("scan-skip", format!("Skipping previously failed: {:?}", path_buf.file_name()));
                    }
                    continue;
                }
            }

            // Emit progress update
            if let Some(win) = window {
                let progress = ScanProgress {
                    current: processed,
                    total,
                    current_file: path_buf.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("Unknown")
                        .to_string(),
                };
                let _ = win.emit("scan-progress", &progress);
            }

            match Self::extract_track_info(path_buf) {
                Ok(track) => tracks.push(track),
                Err(e) => {
                    error!("Failed to extract info from {:?}: {}", path_buf, e);
                    if let Some(database) = db {
                        let _ = database.add_failed_track(&path_str, &e);
                    }
                    if let Some(win) = window {
                        let _ = win.emit("scan-error", format!("Failed to read: {:?}", path_buf.file_name()));
                    }
                }
            }
        }

        info!("Scan completed: {} tracks successfully extracted", tracks.len());
        if let Some(win) = window {
            let _ = win.emit("scan-complete", tracks.len());
        }

        Ok(tracks)
    }

    /// Perform incremental scan: only process new or modified files
    pub fn scan_directory_incremental(path: &str, window: Option<&Window>, cancel_flag: Option<Arc<AtomicBool>>, db: &Database) -> Result<Vec<Track>, String> {
        info!("Starting incremental directory scan: {}", path);

        // Check for cancellation before starting
        if let Some(flag) = &cancel_flag {
            if flag.load(Ordering::Relaxed) {
                warn!("Incremental scan cancelled before starting");
                return Ok(Vec::new());
            }
        }

        // Get existing tracks with their modification times
        let existing_tracks_list = db.get_folder_tracks(path)
            .map_err(|e| format!("Failed to get existing tracks: {}", e))?;
        use std::collections::HashMap;
        let existing_tracks: HashMap<String, i64> = existing_tracks_list
            .into_iter()
            .map(|(_, path, mtime)| (path, mtime))
            .collect();

        // Collect all audio files and filter to only new/modified
        let all_files = Self::collect_audio_files(path);
        let files_to_scan: Vec<std::path::PathBuf> = all_files
            .into_iter()
            .filter(|path_buf| {
                let path_str = path_buf.to_string_lossy().to_string();
                if let Some(&stored_mtime) = existing_tracks.get(&path_str) {
                    // File exists in DB — check if modified
                    std::fs::metadata(path_buf).ok()
                        .and_then(|m| m.modified().ok())
                        .map(|modified| {
                            let current_mtime = modified.duration_since(std::time::UNIX_EPOCH)
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

        info!("Incremental scan: {} files need processing (new or modified)", files_to_scan.len());

        Self::process_files(&files_to_scan, window, &cancel_flag, Some(db))
    }

    pub fn scan_directory(path: &str, window: Option<&Window>, cancel_flag: Option<Arc<AtomicBool>>, db: Option<&Database>) -> Result<Vec<Track>, String> {
        info!("Starting directory scan: {}", path);

        // Check for cancellation before starting
        if let Some(flag) = &cancel_flag {
            if flag.load(Ordering::Relaxed) {
                warn!("Scan cancelled before starting");
                return Ok(Vec::new());
            }
        }

        let files = Self::collect_audio_files(path);
        info!("Found {} audio files to scan", files.len());

        Self::process_files(&files, window, &cancel_flag, db)
    }
    
    pub fn extract_track_info(path: &Path) -> Result<Track, String> {
        use lofty::{Probe, Accessor, AudioFile};
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let tagged_file = Probe::open(path)
            .map_err(|e| e.to_string())?
            .read()
            .map_err(|e| e.to_string())?;
        
        let tags = tagged_file.primary_tag()
            .or_else(|| tagged_file.first_tag());
        
        let title = tags.and_then(|t| t.title().map(|s| s.to_string()));
        let artist = tags.and_then(|t| t.artist().map(|s| s.to_string()));
        let album = tags.and_then(|t| t.album().map(|s| s.to_string()));
        
        let duration = tagged_file.properties().duration().as_secs_f64();
        
        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();
        
        let path_str = path.to_string_lossy().to_string();
        let id = format!("track_{}", path_str.replace(['/', '\\'], "_"));
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        
        Ok(Track {
            id,
            path: path_str,
            name: file_name,
            title,
            artist,
            album,
            duration,
            date_added: now,
            rating: 0,
        })
    }
    
    /// Extract album art from audio file
    pub fn extract_album_art(path: &str) -> Result<Option<Vec<u8>>, String> {
        use lofty::Probe;
        
        let tagged_file = Probe::open(path)
            .map_err(|e| format!("Failed to open file: {}", e))?
            .read()
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        let tags = tagged_file.primary_tag()
            .or_else(|| tagged_file.first_tag());
        
        if let Some(tag) = tags {
            if let Some(pictures) = tag.pictures().first() {
                return Ok(Some(pictures.data().to_vec()));
            }
        }
        
        Ok(None)
    }
}