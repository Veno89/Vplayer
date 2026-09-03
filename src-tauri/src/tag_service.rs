use lofty::config::WriteOptions;
use lofty::prelude::{Accessor, ItemKey, TagExt, TaggedFileExt};
use lofty::probe::Probe;

#[derive(Debug, Clone)]
pub struct TagUpdateInput {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
    pub comment: Option<String>,
    pub track_number: Option<String>,
    pub disc_number: Option<String>,
}

/// Read, mutate, and persist audio file tags using lofty.
pub fn apply_tags_to_file(track_path: &str, update: &TagUpdateInput) -> Result<(), String> {
    let tagged_file = Probe::open(track_path)
        .map_err(|e| format!("Failed to open file: {}", e))?
        .read()
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())
        .ok_or_else(|| "No tag found in file".to_string())?
        .to_owned();

    if let Some(ref title) = update.title {
        tag.set_title(title.clone());
    }
    if let Some(ref artist) = update.artist {
        tag.set_artist(artist.clone());
    }
    if let Some(ref album) = update.album {
        tag.set_album(album.clone());
    }
    if let Some(ref year) = update.year {
        let year = year
            .trim()
            .parse::<u16>()
            .map_err(|_| format!("Invalid year: {year}"))?;
        let mut date = tag.date().unwrap_or_default();
        date.year = year;
        tag.set_date(date);
    }
    if let Some(ref genre) = update.genre {
        tag.insert_text(ItemKey::Genre, genre.clone());
    }
    if let Some(ref comment) = update.comment {
        tag.insert_text(ItemKey::Comment, comment.clone());
    }
    if let Some(ref track_number) = update.track_number
        && let Ok(num) = track_number.parse::<u32>()
    {
        tag.set_track(num);
    }
    if let Some(ref disc_number) = update.disc_number
        && let Ok(num) = disc_number.parse::<u32>()
    {
        tag.set_disk(num);
    }

    tag.save_to_path(track_path, WriteOptions::default())
        .map_err(|e| format!("Failed to save tags: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::Scanner;
    use lofty::tag::items::Timestamp;
    use lofty::tag::{Tag, TagType};
    use std::fs::File;
    use std::io::Write;
    use std::path::PathBuf;

    struct TempAudioFile(PathBuf);

    impl Drop for TempAudioFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn write_tagged_test_wav() -> TempAudioFile {
        const SAMPLE_RATE: u32 = 8_000;
        const CHANNELS: u16 = 1;
        const BITS_PER_SAMPLE: u16 = 16;
        const DATA: [u8; 2] = [0, 0];

        let path =
            std::env::temp_dir().join(format!("vplayer_tag_service_{}.wav", uuid::Uuid::new_v4()));
        let block_align = CHANNELS * (BITS_PER_SAMPLE / 8);
        let byte_rate = SAMPLE_RATE * u32::from(block_align);
        let data_len = DATA.len() as u32;

        let mut wav = Vec::with_capacity(44 + DATA.len());
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_len).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16_u32.to_le_bytes());
        wav.extend_from_slice(&1_u16.to_le_bytes());
        wav.extend_from_slice(&CHANNELS.to_le_bytes());
        wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
        wav.extend_from_slice(&byte_rate.to_le_bytes());
        wav.extend_from_slice(&block_align.to_le_bytes());
        wav.extend_from_slice(&BITS_PER_SAMPLE.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_len.to_le_bytes());
        wav.extend_from_slice(&DATA);

        let mut file = File::create(&path).expect("test WAV should be created");
        file.write_all(&wav).expect("test WAV should be written");
        drop(file);

        let mut tag = Tag::new(TagType::RiffInfo);
        tag.set_title("Original title".to_string());
        tag.set_date(Timestamp {
            year: 2020,
            month: Some(6),
            day: Some(15),
            ..Default::default()
        });
        tag.save_to_path(&path, WriteOptions::default())
            .expect("initial RIFF INFO tag should be written");

        TempAudioFile(path)
    }

    #[test]
    fn applies_and_persists_tag_updates() {
        let wav = write_tagged_test_wav();
        let update = TagUpdateInput {
            title: Some("Updated title".to_string()),
            artist: Some("Updated artist".to_string()),
            album: None,
            year: Some("2026".to_string()),
            genre: None,
            comment: None,
            track_number: None,
            disc_number: None,
        };

        apply_tags_to_file(
            wav.0.to_str().expect("test path should be valid UTF-8"),
            &update,
        )
        .expect("tag update should persist");

        let tagged_file = Probe::open(&wav.0)
            .expect("updated test WAV should open")
            .read()
            .expect("updated test WAV should parse");
        let saved_tag = tagged_file
            .primary_tag()
            .or_else(|| tagged_file.first_tag())
            .expect("updated test WAV should contain a tag");

        assert_eq!(saved_tag.title().as_deref(), Some("Updated title"));
        assert_eq!(saved_tag.artist().as_deref(), Some("Updated artist"));
        assert_eq!(
            saved_tag.date(),
            Some(Timestamp {
                year: 2026,
                month: Some(6),
                day: Some(15),
                ..Default::default()
            })
        );

        let rescanned =
            Scanner::extract_track_info(&wav.0).expect("updated test WAV should remain scannable");
        assert_eq!(rescanned.year, Some(2026));
    }
}
