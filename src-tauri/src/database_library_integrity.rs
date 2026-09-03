use crate::database::Database;
use crate::scanner::Track;
use rusqlite::types::Value;
use rusqlite::{Connection, Result, Transaction, params, params_from_iter};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIntegrityReport {
    pub total_tracks: usize,
    pub registered_tracks: usize,
    pub orphan_tracks: usize,
    pub folder_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRepairResult {
    pub before: LibraryIntegrityReport,
    pub after: LibraryIntegrityReport,
    pub removed_tracks: usize,
    pub backup_path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateCleanupResult {
    pub removed_tracks: usize,
    pub removed_folders: usize,
    pub backup_path: String,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DuplicateSensitivity {
    Low,
    Medium,
    High,
}

impl DuplicateSensitivity {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "low" => Some(Self::Low),
            "medium" => Some(Self::Medium),
            "high" => Some(Self::High),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum DuplicateKey {
    Path(String),
    Metadata(String, String, String),
}

impl Database {
    /// Build a boundary-safe predicate that accepts only tracks located at or
    /// below a currently registered library root. The correlated EXISTS avoids
    /// expanding one expression and three SQLite variables per folder.
    pub(crate) fn registered_track_scope(
        conn: &Connection,
        column: &str,
    ) -> Result<(String, Vec<Value>)> {
        let outer_column = match column {
            "path" | "tracks.path" => "tracks.path",
            "t.path" => "t.path",
            _ => {
                return Err(rusqlite::Error::InvalidParameterName(
                    "unsupported registered-track column".to_string(),
                ));
            }
        };

        // Preparing a tiny probe catches malformed column substitutions while
        // keeping the returned predicate independent of the folder count.
        conn.prepare("SELECT 1 FROM folders LIMIT 1")?;
        Ok((
            format!(
                r#"EXISTS (
                    SELECT 1
                    FROM (
                        SELECT CASE
                            WHEN replace(path, '\', '/') = '/' THEN '/'
                            ELSE rtrim(replace(path, '\', '/'), '/')
                        END AS root
                        FROM folders
                    ) AS library_folder
                    WHERE library_folder.root <> ''
                      AND (
                            replace({outer_column}, '\', '/') = library_folder.root COLLATE NOCASE
                            OR (
                                length(replace({outer_column}, '\', '/')) > length(library_folder.root)
                                AND substr(replace({outer_column}, '\', '/'), 1, length(library_folder.root)) = library_folder.root COLLATE NOCASE
                                AND (
                                    library_folder.root = '/'
                                    OR substr(replace({outer_column}, '\', '/'), length(library_folder.root) + 1, 1) = '/'
                                )
                            )
                      )
                )"#
            ),
            Vec::new(),
        ))
    }

    fn library_integrity_from_connection(conn: &Connection) -> Result<LibraryIntegrityReport> {
        let total_tracks: i64 =
            conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))?;
        let folder_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM folders", [], |row| row.get(0))?;
        let (scope, values) = Self::registered_track_scope(conn, "path")?;
        let registered_tracks: i64 = conn.query_row(
            &format!("SELECT COUNT(*) FROM tracks WHERE {scope}"),
            params_from_iter(values.iter()),
            |row| row.get(0),
        )?;

        Ok(LibraryIntegrityReport {
            total_tracks: total_tracks.max(0) as usize,
            registered_tracks: registered_tracks.max(0) as usize,
            orphan_tracks: total_tracks.saturating_sub(registered_tracks).max(0) as usize,
            folder_count: folder_count.max(0) as usize,
        })
    }

    pub fn get_library_integrity(&self) -> Result<LibraryIntegrityReport> {
        let conn = self.conn();
        Self::library_integrity_from_connection(&conn)
    }

    /// Create a consistent SQLite snapshot and then remove database track rows
    /// outside every registered library root. This never touches audio files.
    pub fn repair_library_integrity(&self, backup_path: &Path) -> Result<LibraryRepairResult> {
        let mut conn = self.conn();
        let before = Self::library_integrity_from_connection(&conn)?;

        Self::create_snapshot(&conn, backup_path, "library repair")?;

        let (scope, values) = Self::registered_track_scope(&conn, "path")?;
        let tx = conn.transaction()?;
        let removed_tracks = tx.execute(
            &format!("DELETE FROM tracks WHERE NOT ({scope})"),
            params_from_iter(values.iter()),
        )?;
        if removed_tracks > 0 {
            tx.execute("DELETE FROM album_replaygain", [])?;
        }
        tx.commit()?;

        let after = Self::library_integrity_from_connection(&conn)?;
        Ok(LibraryRepairResult {
            before,
            after,
            removed_tracks,
            backup_path: backup_path.to_string_lossy().into_owned(),
        })
    }

    fn create_snapshot(conn: &Connection, backup_path: &Path, operation: &str) -> Result<()> {
        if backup_path.exists() {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "{operation} backup already exists"
            )));
        }

        let backup_string = backup_path.to_string_lossy().into_owned();
        conn.execute("VACUUM INTO ?1", params![backup_string])?;
        Ok(())
    }

    fn normalized_metadata(value: &str) -> String {
        value
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
    }

    fn path_identity(path: &str) -> String {
        #[cfg(target_os = "windows")]
        {
            path.trim().replace('/', "\\").to_lowercase()
        }

        #[cfg(not(target_os = "windows"))]
        {
            path.trim().to_string()
        }
    }

    fn duplicate_key(track: &Track, sensitivity: DuplicateSensitivity) -> Option<DuplicateKey> {
        if sensitivity == DuplicateSensitivity::Low {
            let path = Self::path_identity(&track.path);
            return (!path.is_empty()).then_some(DuplicateKey::Path(path));
        }

        let title = track.title.as_deref()?.trim();
        let artist = track.artist.as_deref()?.trim();
        let album = track.album.as_deref()?.trim();
        if title.is_empty() || artist.is_empty() || album.is_empty() {
            return None;
        }

        let (title, artist, album) = match sensitivity {
            DuplicateSensitivity::Medium => {
                (title.to_string(), artist.to_string(), album.to_string())
            }
            DuplicateSensitivity::High => (
                Self::normalized_metadata(title),
                Self::normalized_metadata(artist),
                Self::normalized_metadata(album),
            ),
            DuplicateSensitivity::Low => unreachable!("low sensitivity handled above"),
        };
        Some(DuplicateKey::Metadata(title, artist, album))
    }

    fn split_duration_groups(mut tracks: Vec<Track>, tolerance: f64) -> Vec<Vec<Track>> {
        tracks.sort_by(|left, right| {
            left.duration
                .total_cmp(&right.duration)
                .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
                .then_with(|| left.id.cmp(&right.id))
        });

        let mut groups = Vec::new();
        let mut current = Vec::new();
        for track in tracks {
            let belongs = current.first().is_none_or(|first: &Track| {
                track.duration.is_finite()
                    && first.duration.is_finite()
                    && (track.duration - first.duration).abs() < tolerance
            });
            if !belongs {
                if current.len() > 1 {
                    groups.push(std::mem::take(&mut current));
                } else {
                    current.clear();
                }
            }
            current.push(track);
        }
        if current.len() > 1 {
            groups.push(current);
        }
        groups
    }

    fn duplicate_groups_for_sensitivity(
        conn: &Connection,
        scope: &str,
        scope_values: &[Value],
        sensitivity: DuplicateSensitivity,
    ) -> Result<Vec<Vec<Track>>> {
        let query = format!(
            "SELECT {} FROM tracks WHERE ({scope}) ORDER BY path COLLATE NOCASE, id",
            crate::scanner::TRACK_SELECT_COLUMNS
        );
        let mut stmt = conn.prepare(&query)?;
        let tracks = stmt
            .query_map(params_from_iter(scope_values.iter()), Track::from_row)?
            .collect::<Result<Vec<_>>>()?;

        let mut candidates: BTreeMap<DuplicateKey, Vec<Track>> = BTreeMap::new();
        for track in tracks {
            if let Some(key) = Self::duplicate_key(&track, sensitivity) {
                candidates.entry(key).or_default().push(track);
            }
        }

        let mut groups = Vec::new();
        for (_, mut tracks) in candidates {
            if tracks.len() < 2 {
                continue;
            }
            if sensitivity == DuplicateSensitivity::Low {
                tracks.sort_by(|left, right| left.id.cmp(&right.id));
                groups.push(tracks);
            } else {
                let tolerance = if sensitivity == DuplicateSensitivity::High {
                    3.0
                } else {
                    2.0
                };
                groups.extend(Self::split_duration_groups(tracks, tolerance));
            }
        }
        Ok(groups)
    }

    pub(crate) fn find_duplicate_groups_in_connection(
        conn: &Connection,
        scope: &str,
        scope_values: &[Value],
    ) -> Result<Vec<Vec<Track>>> {
        Self::duplicate_groups_for_sensitivity(
            conn,
            scope,
            scope_values,
            DuplicateSensitivity::Medium,
        )
    }

    pub fn find_duplicates_with_sensitivity(
        &self,
        sensitivity: DuplicateSensitivity,
    ) -> Result<Vec<Vec<Track>>> {
        let conn = self.conn();
        let (scope, values) = Self::registered_track_scope(&conn, "path")?;
        Self::duplicate_groups_for_sensitivity(&conn, &scope, &values, sensitivity)
    }

    fn preferred_duplicate(group: &[Track]) -> &Track {
        group
            .iter()
            .min_by_key(|track| {
                (
                    !Path::new(&track.path).is_file(),
                    Self::path_identity(&track.path),
                    track.date_added,
                    track.id.clone(),
                )
            })
            .expect("duplicate groups always contain at least two tracks")
    }

    fn transfer_playlist_memberships(
        tx: &Transaction<'_>,
        group: &[Track],
        retained_track_id: &str,
        affected_playlists: &mut BTreeSet<String>,
    ) -> Result<()> {
        let mut positions: BTreeMap<String, i64> = BTreeMap::new();
        {
            let mut memberships = tx.prepare(
                "SELECT playlist_id, position
                 FROM playlist_tracks
                 WHERE track_id = ?1
                 ORDER BY playlist_id, position",
            )?;
            for track in group {
                let rows = memberships.query_map(params![track.id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })?;
                for row in rows {
                    let (playlist_id, position) = row?;
                    positions
                        .entry(playlist_id)
                        .and_modify(|current| *current = (*current).min(position))
                        .or_insert(position);
                }
            }
        }

        for track in group {
            tx.execute(
                "DELETE FROM playlist_tracks WHERE track_id = ?1",
                params![track.id],
            )?;
        }
        for (playlist_id, position) in positions {
            tx.execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position)
                 VALUES (?1, ?2, ?3)",
                params![playlist_id, retained_track_id, position],
            )?;
            affected_playlists.insert(playlist_id);
        }
        Ok(())
    }

    fn compact_playlist_positions(tx: &Transaction<'_>, playlist_id: &str) -> Result<()> {
        let track_ids = {
            let mut stmt = tx.prepare(
                "SELECT track_id
                 FROM playlist_tracks
                 WHERE playlist_id = ?1
                 ORDER BY position, track_id",
            )?;
            stmt.query_map(params![playlist_id], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>>>()?
        };
        if track_ids.is_empty() {
            return Ok(());
        }

        let minimum: i64 = tx.query_row(
            "SELECT MIN(position) FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;
        let temporary_start = minimum.saturating_sub(track_ids.len() as i64 + 1);
        for (index, track_id) in track_ids.iter().enumerate() {
            tx.execute(
                "UPDATE playlist_tracks SET position = ?1
                 WHERE playlist_id = ?2 AND track_id = ?3",
                params![
                    temporary_start.saturating_sub(index as i64),
                    playlist_id,
                    track_id
                ],
            )?;
        }
        for (position, track_id) in track_ids.iter().enumerate() {
            tx.execute(
                "UPDATE playlist_tracks SET position = ?1
                 WHERE playlist_id = ?2 AND track_id = ?3",
                params![position as i64, playlist_id, track_id],
            )?;
        }
        Ok(())
    }

    /// Snapshot the database, then remove duplicate folder rows and duplicate
    /// valid-library tracks in one transaction. Playlist membership is moved to
    /// the retained row before duplicate IDs are deleted.
    pub fn remove_library_duplicates(
        &self,
        sensitivity: DuplicateSensitivity,
        backup_path: &Path,
    ) -> Result<DuplicateCleanupResult> {
        let mut conn = self.conn();
        Self::create_snapshot(&conn, backup_path, "duplicate cleanup")?;
        let tx = conn.transaction()?;

        let removed_folders = tx.execute(
            "DELETE FROM folders
             WHERE rowid NOT IN (
                 SELECT MIN(rowid) FROM folders GROUP BY path COLLATE NOCASE
             )",
            [],
        )?;

        let (scope, values) = Self::registered_track_scope(&tx, "path")?;
        let groups = Self::duplicate_groups_for_sensitivity(&tx, &scope, &values, sensitivity)?;
        let mut removed_tracks = 0;
        let mut affected_playlists = BTreeSet::new();
        {
            let mut delete_track = tx.prepare("DELETE FROM tracks WHERE id = ?1")?;
            for group in groups {
                let retained_track_id = Self::preferred_duplicate(&group).id.clone();
                Self::transfer_playlist_memberships(
                    &tx,
                    &group,
                    &retained_track_id,
                    &mut affected_playlists,
                )?;
                for track in &group {
                    if track.id != retained_track_id {
                        removed_tracks += delete_track.execute(params![track.id])?;
                    }
                }
            }
        }

        for playlist_id in affected_playlists {
            Self::compact_playlist_positions(&tx, &playlist_id)?;
        }

        if removed_tracks > 0 {
            tx.execute("DELETE FROM album_replaygain", [])?;
        }
        tx.commit()?;

        Ok(DuplicateCleanupResult {
            removed_tracks,
            removed_folders,
            backup_path: backup_path.to_string_lossy().into_owned(),
        })
    }
}
