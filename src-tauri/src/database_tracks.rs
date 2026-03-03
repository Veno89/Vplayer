use crate::database::{Database, TrackFilter};
use crate::query_builder::QueryBuilder;
use crate::scanner::Track;
use crate::time_utils::now_millis;
use log::info;
use rusqlite::{params, Result};

impl Database {
    pub fn get_tracks_page(&self, filter: TrackFilter, offset: usize, limit: usize) -> Result<(Vec<Track>, usize)> {
        let mut qb = QueryBuilder::new();
        qb.apply_track_filter(&filter);

        let conn = self.conn();

        let count_sql = format!("SELECT COUNT(*) FROM tracks{}", qb.where_sql());
        let total: i64 = conn.query_row(
            &count_sql,
            rusqlite::params_from_iter(qb.params().iter()),
            |row| row.get(0),
        )?;

        qb.paginate(limit, offset);
        let query_sql = format!(
            "SELECT {} FROM tracks{}{}{}",
            crate::scanner::TRACK_SELECT_COLUMNS,
            qb.where_sql(),
            qb.order_sql(),
            qb.limit_sql(),
        );

        let mut stmt = conn.prepare(&query_sql)?;
        let tracks = stmt
            .query_map(rusqlite::params_from_iter(qb.params().iter()), Track::from_row)?
            .collect::<Result<Vec<_>>>()?;

        Ok((tracks, total as usize))
    }

    pub fn add_track(&self, track: &Track) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT OR REPLACE INTO tracks (id, path, name, title, artist, album, genre, year, track_number, disc_number, duration, date_added, play_count, last_played, rating)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, COALESCE((SELECT play_count FROM tracks WHERE id = ?1), 0), COALESCE((SELECT last_played FROM tracks WHERE id = ?1), 0), COALESCE((SELECT rating FROM tracks WHERE id = ?1), 0))",
            params![
                track.id,
                track.path,
                track.name,
                track.title,
                track.artist,
                track.album,
                track.genre,
                track.year,
                track.track_number,
                track.disc_number,
                track.duration,
                track.date_added,
            ],
        )?;
        Ok(())
    }

    pub fn get_all_tracks(&self) -> Result<Vec<Track>> {
        info!("Fetching all tracks from database");
        let conn = self.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM tracks",
            crate::scanner::TRACK_SELECT_COLUMNS
        ))?;

        let tracks = stmt.query_map([], Track::from_row)?.collect::<Result<Vec<_>>>()?;

        Ok(tracks)
    }

    pub fn get_filtered_tracks(&self, filter: TrackFilter) -> Result<Vec<Track>> {
        let mut qb = QueryBuilder::new();
        qb.apply_track_filter(&filter);

        let sql = format!(
            "SELECT {} FROM tracks{}{}",
            crate::scanner::TRACK_SELECT_COLUMNS,
            qb.where_sql(),
            qb.order_sql(),
        );

        let conn = self.conn();
        let mut stmt = conn.prepare(&sql)?;

        let tracks = stmt
            .query_map(
                rusqlite::params_from_iter(qb.params().iter()),
                Track::from_row,
            )?
            .collect::<Result<Vec<_>>>()?;

        Ok(tracks)
    }

    // Track statistics
    pub fn increment_play_count(&self, track_id: &str) -> Result<()> {
        let conn = self.conn();
        let now = now_millis();

        conn.execute(
            "UPDATE tracks SET play_count = play_count + 1, last_played = ?1 WHERE id = ?2",
            params![now, track_id],
        )?;
        Ok(())
    }

    pub fn reset_play_count(&self, track_id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE tracks SET play_count = 0, last_played = 0 WHERE id = ?1",
            params![track_id],
        )?;
        Ok(())
    }

    pub fn get_recently_played(&self, limit: usize) -> Result<Vec<Track>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(&format!(
            "{} FROM tracks WHERE last_played > 0 ORDER BY last_played DESC LIMIT ?1",
            format!("SELECT {}", crate::scanner::TRACK_SELECT_COLUMNS)
        ))?;

        let tracks = stmt
            .query_map(params![limit], Track::from_row)?
            .collect::<Result<Vec<_>>>()?;

        Ok(tracks)
    }

    pub fn get_most_played(&self, limit: usize) -> Result<Vec<Track>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(&format!(
            "{} FROM tracks WHERE play_count > 0 ORDER BY play_count DESC LIMIT ?1",
            format!("SELECT {}", crate::scanner::TRACK_SELECT_COLUMNS)
        ))?;

        let tracks = stmt
            .query_map(params![limit], Track::from_row)?
            .collect::<Result<Vec<_>>>()?;

        Ok(tracks)
    }

    // Star rating for tracks
    pub fn set_track_rating(&self, track_id: &str, rating: i32) -> Result<()> {
        let conn = self.conn();
        let clamped_rating = rating.max(0).min(5); // 0-5 stars
        conn.execute(
            "UPDATE tracks SET rating = ?1 WHERE id = ?2",
            params![clamped_rating, track_id],
        )?;
        Ok(())
    }

    // Get all track paths for validation
    pub fn get_all_track_paths(&self) -> Result<Vec<(String, String)>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, path FROM tracks")?;

        let paths = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>>>()?;

        Ok(paths)
    }

    // Update track path (for relocating missing files)
    pub fn update_track_path(&self, track_id: &str, new_path: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE tracks SET path = ?1 WHERE id = ?2",
            params![new_path, track_id],
        )?;
        Ok(())
    }

    pub fn update_track_metadata(
        &self,
        track_id: &str,
        title: &Option<String>,
        artist: &Option<String>,
        album: &Option<String>,
        genre: &Option<String>,
        year: &Option<i32>,
        track_number: &Option<i32>,
        disc_number: &Option<i32>,
    ) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE tracks SET title = ?1, artist = ?2, album = ?3, genre = ?4, year = ?5, track_number = ?6, disc_number = ?7 WHERE id = ?8",
            params![title, artist, album, genre, year, track_number, disc_number, track_id],
        )?;
        Ok(())
    }

    pub fn get_track_by_path(&self, path: &str) -> Result<Option<Track>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM tracks WHERE path = ?1",
            crate::scanner::TRACK_SELECT_COLUMNS
        ))?;

        let mut rows = stmt.query(params![path])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Track::from_row(row)?))
        } else {
            Ok(None)
        }
    }

    // Find duplicate tracks based on metadata similarity
    pub fn find_duplicates(&self) -> Result<Vec<Vec<Track>>> {
        info!("Searching for duplicate tracks");
        let conn = self.conn();

        // Step 1: SQL finds (title, artist, album) combos that appear more than once.
        // This avoids loading the entire tracks table into memory.
        let mut dup_keys_stmt = conn.prepare(
            "SELECT title, artist, album
             FROM tracks
             WHERE title IS NOT NULL AND artist IS NOT NULL
             GROUP BY title, artist, album
             HAVING COUNT(*) > 1",
        )?;

        let dup_keys: Vec<(String, String, String)> = dup_keys_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>>>()?;

        if dup_keys.is_empty() {
            info!("Found 0 groups of duplicates");
            return Ok(Vec::new());
        }

        // Step 2: Fetch only the tracks that belong to duplicate groups
        let mut duplicate_groups: Vec<Vec<Track>> = Vec::new();

        let mut track_stmt = conn.prepare(&format!(
            "SELECT {} FROM tracks WHERE title = ?1 AND artist = ?2 AND album = ?3 ORDER BY duration",
            crate::scanner::TRACK_SELECT_COLUMNS
        ))?;

        for (title, artist, album) in &dup_keys {
            let tracks: Vec<Track> = track_stmt
                .query_map(params![title, artist, album], Track::from_row)?
                .collect::<Result<Vec<_>>>()?;

            // Further refine by duration similarity (within 2 seconds)
            // Tracks are sorted by duration, so we can group sequentially.
            let mut current_group: Vec<Track> = Vec::new();

            for track in &tracks {
                if current_group.is_empty() {
                    current_group.push(track.clone());
                } else {
                    let last = current_group.last().unwrap();
                    if (track.duration - last.duration).abs() < 2.0 {
                        current_group.push(track.clone());
                    } else {
                        if current_group.len() > 1 {
                            duplicate_groups.push(std::mem::take(&mut current_group));
                        } else {
                            current_group.clear();
                        }
                        current_group.push(track.clone());
                    }
                }
            }
            if current_group.len() > 1 {
                duplicate_groups.push(current_group);
            }
        }

        info!("Found {} groups of duplicates", duplicate_groups.len());
        Ok(duplicate_groups)
    }

    // Remove a track from the library
    pub fn remove_track(&self, track_id: &str) -> Result<()> {
        info!("Removing track: {}", track_id);
        let conn = self.conn();
        conn.execute("DELETE FROM tracks WHERE id = ?1", params![track_id])?;
        Ok(())
    }

    // Update track with file modification time
    pub fn add_track_with_mtime(&self, track: &Track, file_modified: i64) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT OR REPLACE INTO tracks (id, path, name, title, artist, album, genre, year, track_number, disc_number, duration, date_added, play_count, last_played, rating, file_modified)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, COALESCE((SELECT play_count FROM tracks WHERE id = ?1), 0), COALESCE((SELECT last_played FROM tracks WHERE id = ?1), 0), COALESCE((SELECT rating FROM tracks WHERE id = ?1), 0), ?13)",
            params![
                track.id,
                track.path,
                track.name,
                track.title,
                track.artist,
                track.album,
                track.genre,
                track.year,
                track.track_number,
                track.disc_number,
                track.duration,
                track.date_added,
                file_modified,
            ],
        )?;
        Ok(())
    }
}
