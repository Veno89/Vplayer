use crate::database::{Database, TrackFilter};
use crate::query_builder::QueryBuilder;
use crate::scanner::Track;
use crate::time_utils::now_millis;
use rusqlite::{OptionalExtension, Result, params, params_from_iter};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderHealth {
    pub id: String,
    pub path: String,
    pub name: String,
    pub total_tracks: usize,
    pub matching_tracks: usize,
    pub availability: String,
    pub access_error: Option<String>,
    pub last_attempt: Option<i64>,
    pub last_success: Option<i64>,
    pub failed: usize,
    pub first_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryOverview {
    pub total_tracks: usize,
    pub matching_tracks: usize,
    pub folders: Vec<FolderHealth>,
}

#[derive(Serialize)]
pub struct LibraryFacet {
    pub label: String,
    pub artist: Option<String>,
    pub count: usize,
}

impl Database {
    pub fn count_library_tracks(&self, filter: &TrackFilter) -> Result<usize> {
        let conn = self.conn();
        let (scope, values) = Self::registered_track_scope(&conn, "path")?;
        let mut query = QueryBuilder::new();
        query
            .and_where_multi(&scope, values)
            .apply_track_filter(filter);
        conn.query_row(
            &format!("SELECT COUNT(*) FROM tracks{}", query.where_sql()),
            params_from_iter(query.params().iter()),
            |row| row.get(0),
        )
    }

    pub fn library_overview(&self, filter: &TrackFilter) -> Result<LibraryOverview> {
        let mut folders = Vec::new();
        for (id, path, name, _) in self.get_all_folders()? {
            let total_tracks = self.count_library_tracks(&TrackFilter {
                folder_id: Some(id.clone()),
                ..Default::default()
            })?;
            let matching_tracks = if filter
                .folder_id
                .as_ref()
                .is_some_and(|selected| selected != &id)
            {
                0
            } else {
                self.count_library_tracks(&TrackFilter {
                    folder_id: Some(id.clone()),
                    ..filter.clone()
                })?
            };
            // Test root access only; a disconnected disk must not become an empty collection.
            let (availability, access_error) = match std::fs::read_dir(&path) {
                Ok(_) => ("available".to_string(), None),
                Err(error) => (
                    if error.kind() == std::io::ErrorKind::NotFound {
                        "offline"
                    } else {
                        "inaccessible"
                    }
                    .to_string(),
                    Some(error.to_string()),
                ),
            };
            let status: Option<(i64, Option<i64>, usize, Option<String>)> = self.conn().query_row(
                "SELECT last_attempt, last_success, failed, first_error FROM library_scan_status WHERE path = ?1 COLLATE NOCASE",
                params![path],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            ).optional()?;
            let (last_attempt, last_success, failed, first_error) = match status {
                Some((attempt, success, failed, error)) => (Some(attempt), success, failed, error),
                None => (None, None, 0, None),
            };
            folders.push(FolderHealth {
                id,
                path,
                name,
                total_tracks,
                matching_tracks,
                availability,
                access_error,
                last_attempt,
                last_success,
                failed,
                first_error,
            });
        }
        Ok(LibraryOverview {
            total_tracks: self.count_library_tracks(&TrackFilter::default())?,
            matching_tracks: self.count_library_tracks(filter)?,
            folders,
        })
    }

    pub fn library_facets(&self, kind: &str, filter: &TrackFilter) -> Result<Vec<LibraryFacet>> {
        let conn = self.conn();
        let (scope, values) = Self::registered_track_scope(&conn, "path")?;
        let mut query = QueryBuilder::new();
        query
            .and_where_multi(&scope, values)
            .apply_track_filter(filter);
        let (columns, grouping) = match kind {
            "artists" => ("artist, NULL, COUNT(*)", "artist"),
            "albums" => ("album, artist, COUNT(*)", "album, artist"),
            _ => {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Invalid browsing group".into(),
                ));
            }
        };
        let sql = format!(
            "SELECT {columns} FROM tracks{} GROUP BY {grouping} ORDER BY {grouping} COLLATE NOCASE",
            query.where_sql()
        );
        let mut statement = conn.prepare(&sql)?;
        statement
            .query_map(params_from_iter(query.params().iter()), |row| {
                Ok(LibraryFacet {
                    label: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    artist: row.get(1)?,
                    count: row.get(2)?,
                })
            })?
            .collect()
    }

    pub fn selected_library_tracks(
        &self,
        filter: TrackFilter,
        indices: &[usize],
    ) -> Result<Vec<Track>> {
        // Metadata is materialized only on an explicit playback/bulk action, never while browsing.
        let tracks = self.get_filtered_tracks(filter)?;
        let mut indices = indices.to_vec();
        indices.sort_unstable();
        indices.dedup();
        Ok(indices
            .into_iter()
            .filter_map(|index| tracks.get(index).cloned())
            .collect())
    }

    pub fn begin_library_scan(&self, path: &str) -> Result<()> {
        self.conn().execute(
            "INSERT INTO library_scan_status (path, last_attempt) VALUES (?1, ?2)
             ON CONFLICT(path) DO UPDATE SET last_attempt = excluded.last_attempt, first_error = NULL, failed = 0",
            params![path, now_millis()],
        )?;
        Ok(())
    }

    pub fn record_library_scan(
        &self,
        path: &str,
        total: usize,
        imported: usize,
        failed: usize,
        error: Option<&str>,
    ) -> Result<()> {
        self.conn().execute(
            "INSERT INTO library_scan_status (path, last_attempt, total, imported, failed, first_error)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(path) DO UPDATE SET
             total = excluded.total, imported = excluded.imported, failed = excluded.failed, first_error = excluded.first_error",
            params![path, now_millis(), total, imported, failed, error],
        )?;
        Ok(())
    }

    pub fn finish_library_scan(&self, path: &str, error: Option<&str>) -> Result<()> {
        let conn = self.conn();
        if let Some(error) = error {
            conn.execute(
                "UPDATE library_scan_status SET first_error = ?2 WHERE path = ?1 COLLATE NOCASE",
                params![path, error],
            )?;
        } else {
            conn.execute("UPDATE library_scan_status SET last_success = ?2 WHERE path = ?1 COLLATE NOCASE AND failed = 0", params![path, now_millis()])?;
        }
        Ok(())
    }
}
