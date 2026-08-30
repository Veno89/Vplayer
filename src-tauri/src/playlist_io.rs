use anyhow::{Context, Result};
use log::{info, warn};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

pub struct PlaylistIO;

impl PlaylistIO {
    /// Import tracks from M3U playlist file
    /// Returns vec of (title, path) tuples
    pub fn import_m3u(input_path: &str) -> Result<Vec<(String, String)>> {
        info!("Importing playlist from: {}", input_path);

        let file = File::open(input_path).context("Failed to open playlist file")?;

        let reader = BufReader::new(file);
        let mut tracks = Vec::new();
        let mut current_title: Option<String> = None;

        for line in reader.lines() {
            let line = line?;
            let line = line.trim();

            // Skip empty lines and comments (except #EXTINF)
            if line.is_empty() || (line.starts_with('#') && !line.starts_with("#EXTINF")) {
                continue;
            }

            // Parse #EXTINF line
            if line.starts_with("#EXTINF") {
                // Format: #EXTINF:duration,title
                if let Some(comma_pos) = line.rfind(',') {
                    current_title = Some(line[comma_pos + 1..].to_string());
                }
            } else {
                // This is a file path
                let path = line.to_string();

                // Check if file exists
                if Path::new(&path).exists() {
                    let title = current_title.take().unwrap_or_else(|| {
                        // Extract filename as fallback title
                        Path::new(&path)
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unknown")
                            .to_string()
                    });

                    tracks.push((title, path));
                } else {
                    warn!("Skipping non-existent file: {}", path);
                }

                current_title = None;
            }
        }

        info!("Successfully imported {} tracks", tracks.len());
        Ok(tracks)
    }
}
