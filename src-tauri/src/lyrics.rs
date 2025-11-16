use std::fs;
use std::path::Path;
use serde::{Serialize, Deserialize};

/// Parsed LRC lyric line
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricLine {
    pub timestamp: f64,
    pub text: String,
}

/// LRC metadata
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LrcMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub by: Option<String>,
    pub offset: i32,
}

/// Parsed LRC file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lrc {
    pub metadata: LrcMetadata,
    pub lines: Vec<LyricLine>,
}

impl Lrc {
    /// Parse LRC file from path
    pub fn from_file(path: &Path) -> Result<Self, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read LRC file: {}", e))?;
        Self::from_str(&content)
    }

    /// Parse LRC content from string
    pub fn from_str(content: &str) -> Result<Self, String> {
        let mut metadata = LrcMetadata::default();
        let mut lines = Vec::new();

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if trimmed.starts_with('[') {
                Self::parse_line(trimmed, &mut metadata, &mut lines);
            }
        }

        lines.sort_by(|a, b| a.timestamp.partial_cmp(&b.timestamp).unwrap());

        Ok(Lrc { metadata, lines })
    }

    fn parse_line(line: &str, metadata: &mut LrcMetadata, lines: &mut Vec<LyricLine>) {
        let mut pos = 0;
        let chars: Vec<char> = line.chars().collect();

        while pos < chars.len() && chars[pos] == '[' {
            let end = chars[pos..].iter().position(|&c| c == ']');
            if let Some(end_pos) = end {
                let tag_content = &chars[pos + 1..pos + end_pos];
                let tag_str: String = tag_content.iter().collect();

                if let Some(colon_pos) = tag_str.find(':') {
                    let (tag_name, tag_value) = tag_str.split_at(colon_pos);
                    let tag_value = &tag_value[1..];

                    match tag_name.to_lowercase().as_str() {
                        "ti" => metadata.title = Some(tag_value.to_string()),
                        "ar" => metadata.artist = Some(tag_value.to_string()),
                        "al" => metadata.album = Some(tag_value.to_string()),
                        "by" => metadata.by = Some(tag_value.to_string()),
                        "offset" => {
                            metadata.offset = tag_value.parse().unwrap_or(0);
                        }
                        _ => {
                            if let Some(timestamp) = Self::parse_timestamp(&tag_str) {
                                let text_start = pos + end_pos + 1;
                                let remaining: String = chars[text_start..].iter().collect();
                                let text = remaining.trim_start_matches('[').trim().to_string();
                                
                                if !text.is_empty() || lines.is_empty() {
                                    lines.push(LyricLine {
                                        timestamp: timestamp + (metadata.offset as f64 / 1000.0),
                                        text,
                                    });
                                }
                            }
                        }
                    }
                }

                pos += end_pos + 1;
            } else {
                break;
            }
        }
    }

    fn parse_timestamp(s: &str) -> Option<f64> {
        let parts: Vec<&str> = s.split(':').collect();
        if parts.len() == 2 {
            let minutes: f64 = parts[0].parse().ok()?;
            let seconds: f64 = parts[1].parse().ok()?;
            Some(minutes * 60.0 + seconds)
        } else {
            None
        }
    }

    /// Get lyric at specific time
    pub fn get_lyric_at(&self, time: f64) -> Option<&LyricLine> {
        self.lines
            .iter()
            .rev()
            .find(|line| line.timestamp <= time)
    }

    /// Get current and next lyric
    pub fn get_lyrics_around(&self, time: f64) -> (Option<&LyricLine>, Option<&LyricLine>) {
        let current_idx = self.lines
            .iter()
            .rposition(|line| line.timestamp <= time);

        match current_idx {
            Some(idx) => {
                let current = self.lines.get(idx);
                let next = self.lines.get(idx + 1);
                (current, next)
            }
            None => (None, self.lines.first()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_lrc() {
        let content = "[ti:Test Song]\n[ar:Test Artist]\n[00:12.00]First line\n[00:17.20]Second line";
        let lrc = Lrc::from_str(content).unwrap();
        
        assert_eq!(lrc.metadata.title, Some("Test Song".to_string()));
        assert_eq!(lrc.metadata.artist, Some("Test Artist".to_string()));
        assert_eq!(lrc.lines.len(), 2);
        assert_eq!(lrc.lines[0].timestamp, 12.0);
        assert_eq!(lrc.lines[0].text, "First line");
    }

    #[test]
    fn test_get_lyric_at() {
        let content = "[00:10.00]Line 1\n[00:20.00]Line 2\n[00:30.00]Line 3";
        let lrc = Lrc::from_str(content).unwrap();
        
        assert_eq!(lrc.get_lyric_at(15.0).unwrap().text, "Line 1");
        assert_eq!(lrc.get_lyric_at(25.0).unwrap().text, "Line 2");
        assert!(lrc.get_lyric_at(5.0).is_none());
    }
}
