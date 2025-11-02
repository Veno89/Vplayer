use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;
use lofty::TaggedFileExt;

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
}

pub struct Scanner;

impl Scanner {
    pub fn scan_directory(path: &str) -> Result<Vec<Track>, String> {
        let mut tracks = Vec::new();
        let audio_extensions = ["mp3", "m4a", "flac", "wav", "ogg", "opus", "aac"];
        
        let walker = WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file());
        
        for entry in walker {
            let path_buf = entry.path();
            
            if let Some(ext) = path_buf.extension() {
                if let Some(ext_str) = ext.to_str() {
                    if audio_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        match Self::extract_track_info(path_buf) {
                            Ok(track) => tracks.push(track),
                            Err(e) => eprintln!("Failed to extract info from {:?}: {}", path_buf, e),
                        }
                    }
                }
            }
        }
        
        Ok(tracks)
    }
    
    fn extract_track_info(path: &Path) -> Result<Track, String> {
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
        })
    }
}
