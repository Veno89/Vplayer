use rusqlite::types::Value;

/// Lightweight query builder for dynamic SQL construction.
///
/// Centralises WHERE-clause building, sorting, and pagination so that
/// `get_tracks_page`, `get_filtered_tracks`, and future query methods
/// can share the same filter logic without string-concatenation duplication.
pub struct QueryBuilder {
    where_clauses: Vec<String>,
    params: Vec<Value>,
    order_clause: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

impl QueryBuilder {
    pub fn new() -> Self {
        Self {
            where_clauses: Vec::new(),
            params: Vec::new(),
            order_clause: None,
            limit: None,
            offset: None,
        }
    }

    /// Add a WHERE condition with one parameter.
    pub fn and_where(&mut self, clause: &str, value: Value) -> &mut Self {
        self.where_clauses.push(clause.to_owned());
        self.params.push(value);
        self
    }

    /// Add a WHERE condition with multiple parameters.
    pub fn and_where_multi(&mut self, clause: &str, values: Vec<Value>) -> &mut Self {
        self.where_clauses.push(clause.to_owned());
        self.params.extend(values);
        self
    }

    /// Set ORDER BY clause (raw SQL fragment, e.g. `"title ASC"`).
    pub fn order_by(&mut self, clause: &str) -> &mut Self {
        self.order_clause = Some(clause.to_owned());
        self
    }

    /// Set LIMIT and OFFSET for pagination.
    pub fn paginate(&mut self, limit: usize, offset: usize) -> &mut Self {
        self.limit = Some(limit as i64);
        self.offset = Some(offset as i64);
        self
    }

    /// Build the WHERE fragment (including leading ` WHERE …`).
    /// Returns `""` if no conditions have been added.
    pub fn where_sql(&self) -> String {
        if self.where_clauses.is_empty() {
            return String::new();
        }
        format!(" WHERE {}", self.where_clauses.join(" AND "))
    }

    /// Build the ORDER BY fragment (including leading ` ORDER BY …`).
    pub fn order_sql(&self) -> String {
        match &self.order_clause {
            Some(c) => format!(" ORDER BY {}", c),
            None => String::new(),
        }
    }

    /// Build the LIMIT/OFFSET fragment.
    pub fn limit_sql(&self) -> String {
        match (self.limit, self.offset) {
            (Some(l), Some(o)) => format!(" LIMIT {} OFFSET {}", l, o),
            (Some(l), None) => format!(" LIMIT {}", l),
            _ => String::new(),
        }
    }

    /// All collected parameter values (in binding order).
    pub fn params(&self) -> &[Value] {
        &self.params
    }

    /// Consume self and return owned params.
    pub fn into_params(self) -> Vec<Value> {
        self.params
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for building queries from a TrackFilter
// ─────────────────────────────────────────────────────────────────────────────

use crate::database::TrackFilter;

impl QueryBuilder {
    /// Populate WHERE clauses and params from a `TrackFilter`.
    pub fn apply_track_filter(&mut self, filter: &TrackFilter) -> &mut Self {
        if let Some(query) = &filter.search_query {
            if !query.is_empty() {
                let pattern = format!("%{}%", query);
                self.and_where_multi(
                    "(title LIKE ? OR artist LIKE ? OR album LIKE ?)",
                    vec![
                        Value::from(pattern.clone()),
                        Value::from(pattern.clone()),
                        Value::from(pattern),
                    ],
                );
            }
        }

        if let Some(artist) = &filter.artist {
            self.and_where("artist = ?", Value::from(artist.clone()));
        }

        if let Some(album) = &filter.album {
            self.and_where("album = ?", Value::from(album.clone()));
        }

        if let Some(genre) = &filter.genre {
            self.and_where("genre = ?", Value::from(genre.clone()));
        }

        if let Some(min) = filter.play_count_min {
            self.and_where("play_count >= ?", Value::from(min));
        }

        if let Some(max) = filter.play_count_max {
            self.and_where("play_count <= ?", Value::from(max));
        }

        if let Some(min) = filter.min_rating {
            self.and_where("rating >= ?", Value::from(min));
        }

        if let Some(from) = filter.duration_from {
            self.and_where("duration >= ?", Value::from(from));
        }

        if let Some(to) = filter.duration_to {
            self.and_where("duration <= ?", Value::from(to));
        }

        if let Some(folder_id) = &filter.folder_id {
            self.and_where(
                "path LIKE (SELECT path FROM folders WHERE id = ?) || '%'",
                Value::from(folder_id.clone()),
            );
        }

        // Sorting
        let (col, dir) = Self::resolve_sort(filter);
        self.order_by(&format!("{} {}", col, dir));

        self
    }

    /// Map filter sort fields to safe SQL column references.
    fn resolve_sort(filter: &TrackFilter) -> (&'static str, &'static str) {
        let col = match filter.sort_by.as_deref() {
            Some("title") => "title",
            Some("artist") => "artist",
            Some("album") => "artist, album",
            Some("date" | "date_added") => "date_added",
            Some("rating") => "rating",
            Some("duration") => "duration",
            Some("play_count") => "play_count",
            _ => "title",
        };
        let dir = if filter.sort_desc { "DESC" } else { "ASC" };
        (col, dir)
    }
}
