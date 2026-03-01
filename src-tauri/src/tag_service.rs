use lofty::{Accessor, ItemKey, Probe, TagExt, TaggedFileExt};
use std::fs::OpenOptions;

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
        tag.insert_text(ItemKey::Year, year.clone());
    }
    if let Some(ref genre) = update.genre {
        tag.insert_text(ItemKey::Genre, genre.clone());
    }
    if let Some(ref comment) = update.comment {
        tag.insert_text(ItemKey::Comment, comment.clone());
    }
    if let Some(ref track_number) = update.track_number {
        if let Ok(num) = track_number.parse::<u32>() {
            tag.set_track(num);
        }
    }
    if let Some(ref disc_number) = update.disc_number {
        if let Ok(num) = disc_number.parse::<u32>() {
            tag.set_disk(num);
        }
    }

    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(track_path)
        .map_err(|e| format!("Failed to open file for writing: {}", e))?;

    tag.save_to(&mut file)
        .map_err(|e| format!("Failed to save tags: {}", e))?;

    Ok(())
}
