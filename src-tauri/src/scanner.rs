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

#[derive(Debug, Clone, Serialize)]
pub struct ScanProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

pub struct Scanner;

impl Scanner {
    /// Perform incremental scan: only process new or modified files
    pub fn scan_directory_incremental(path: &str, window: Option<&Window>, cancel_flag: Option<Arc<AtomicBool>>, db: &Database) -> Result<Vec<Track>, String> {
        info!("Starting incremental directory scan: {}", path);
        let mut tracks = Vec::new();
        let audio_extensions = ["mp3", "m4a", "flac", "wav", "ogg", "opus", "aac"];
        
        // Check for cancellation before starting
        if let Some(flag) = &cancel_flag {
            if flag.load(Ordering::Relaxed) {
                warn!("Incremental scan cancelled before starting");
                return Ok(tracks);
            }
        }
        
        // Get existing tracks with their modification times
        let existing_tracks_list = db.get_folder_tracks(path)
            .map_err(|e| format!("Failed to get existing tracks: {}", e))?;
        
        // Convert to HashMap for efficient lookup: path -> mtime
        use std::collections::HashMap;
        let existing_tracks: HashMap<String, i64> = existing_tracks_list
            .into_iter()
            .map(|(_, path, mtime)| (path, mtime))
            .collect();
        
        // First pass: count files that need scanning
        let mut files_to_scan = Vec::new();
        let walker = WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file());
        
        for entry in walker {
            if let Some(ext) = entry.path().extension() {
                if let Some(ext_str) = ext.to_str() {
                    if audio_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        let path_str = entry.path().to_string_lossy().to_string();
                        
                        // Check if file needs scanning (new or modified)
                        let needs_scan = if let Some(&stored_mtime) = existing_tracks.get(&path_str) {
                            // File exists in DB - check if modified
                            if let Ok(metadata) = entry.metadata() {
                                if let Ok(modified) = metadata.modified() {
                                    let current_mtime = modified.duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_secs() as i64;
                                    current_mtime > stored_mtime
                                } else {
                                    false // Can't get mtime, skip
                                }
                            } else {
                                false // Can't get metadata, skip
                            }
                        } else {
                            // File not in DB - needs scanning
                            true
                        };
                        
                        if needs_scan {
                            files_to_scan.push(entry.path().to_path_buf());
                        }
                    }
                }
            }
        }
        
        let total_files = files_to_scan.len();
        info!("Incremental scan: {} files need processing (new or modified)", total_files);
        
        // Emit total count
        if let Some(win) = window {
            let _ = win.emit("scan-total", total_files);
        }
        
        // Process files that need scanning
        let mut processed = 0;
        
        for path_buf in files_to_scan {
            // Check for cancellation
            if let Some(flag) = &cancel_flag {
                if flag.load(Ordering::Relaxed) {
                    warn!("Incremental scan cancelled after {} files", processed);
                    if let Some(win) = window {
                        let _ = win.emit("scan-cancelled", processed);
                    }
                    return Ok(tracks);
                }
            }
            
            processed += 1;
            let path_str = path_buf.to_string_lossy().to_string();
            
            // Skip if this path previously failed
            if db.is_failed_track(&path_str) {
                if let Some(win) = window {
                    let _ = win.emit("scan-skip", format!("Skipping previously failed: {:?}", path_buf.file_name()));
                }
                continue;
            }
            
            // Emit progress update
            if let Some(win) = window {
                let progress = ScanProgress {
                    current: processed,
                    total: total_files,
                    current_file: path_buf.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("Unknown")
                        .to_string(),
                };
                let _ = win.emit("scan-progress", &progress);
            }
            
            match Self::extract_track_info(&path_buf) {
                Ok(track) => tracks.push(track),
                Err(e) => {
                    error!("Failed to extract info from {:?}: {}", path_buf, e);
                    let _ = db.add_failed_track(&path_str, &e);
                    
                    if let Some(win) = window {
                        let _ = win.emit("scan-error", format!("Failed to read: {:?}", path_buf.file_name()));
                    }
                }
            }
        }
        
        info!("Incremental scan completed: {} tracks successfully extracted", tracks.len());
        if let Some(win) = window {
            let _ = win.emit("scan-complete", tracks.len());
        }
        
        Ok(tracks)
    }
    
    pub fn scan_directory(path: &str, window: Option<&Window>, cancel_flag: Option<Arc<AtomicBool>>, db: Option<&Database>) -> Result<Vec<Track>, String> {
        info!("Starting directory scan: {}", path);
        let mut tracks = Vec::new();
        let audio_extensions = ["mp3", "m4a", "flac", "wav", "ogg", "opus", "aac"];
        
        // Check for cancellation before starting
        if let Some(flag) = &cancel_flag {
            if flag.load(Ordering::Relaxed) {
                warn!("Scan cancelled before starting");
                return Ok(tracks);
            }
        }
        
        // First pass: count total audio files
        let mut total_files = 0;
        let walker = WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file());
        
        for entry in walker {
            if let Some(ext) = entry.path().extension() {
                if let Some(ext_str) = ext.to_str() {
                    if audio_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        total_files += 1;
                    }
                }
            }
        }
        
        // Emit total count
        if let Some(win) = window {
            let _ = win.emit("scan-total", total_files);
        }
        info!("Found {} audio files to scan", total_files);
        
        // Second pass: scan files with progress updates
        let walker = WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file());
        
        let mut processed = 0;
        
        for entry in walker {
            // Check for cancellation
            if let Some(flag) = &cancel_flag {
                if flag.load(Ordering::Relaxed) {
                    warn!("Scan cancelled after {} files", processed);
                    if let Some(win) = window {
                        let _ = win.emit("scan-cancelled", processed);
                    }
                    return Ok(tracks);
                }
            }
            
            let path_buf = entry.path();
            
            if let Some(ext) = path_buf.extension() {
                if let Some(ext_str) = ext.to_str() {
                    if audio_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        processed += 1;
                        
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
                                total: total_files,
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
                                
                                // Mark as failed in database
                                if let Some(database) = db {
                                    let _ = database.add_failed_track(&path_str, &e);
                                }
                                
                                // Emit error but continue scanning
                                if let Some(win) = window {
                                    let _ = win.emit("scan-error", format!("Failed to read: {:?}", path_buf.file_name()));
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Emit completion
        info!("Scan completed: {} tracks successfully extracted", tracks.len());
        if let Some(win) = window {
            let _ = win.emit("scan-complete", tracks.len());
        }
        
        Ok(tracks)
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