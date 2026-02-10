use rusqlite::{Connection, Result, params};
use rusqlite::types::Value;
use serde::{Deserialize, Serialize};

/// Allowed column names for smart playlist queries.
/// This whitelist prevents SQL injection through the `field` parameter.
const ALLOWED_FIELDS: &[&str] = &[
    "title", "artist", "album", "genre", "year", "track_number", "disc_number",
    "duration", "rating", "play_count", "last_played", "date_added", "name", "path",
    "track_gain", "track_peak", "loudness", "file_modified",
];

/// Allowed column names for ORDER BY clauses.
const ALLOWED_SORT_FIELDS: &[&str] = &[
    "title", "artist", "album", "genre", "year", "track_number", "disc_number",
    "duration", "rating", "play_count", "last_played", "date_added", "name", "path",
];

/// Validate that a field name is an allowed column. Returns an error if not.
fn validate_field(field: &str) -> Result<()> {
    if ALLOWED_FIELDS.contains(&field) {
        Ok(())
    } else {
        Err(rusqlite::Error::InvalidQuery)
    }
}

/// Validate that a sort field is an allowed column.
fn validate_sort_field(field: &str) -> Result<()> {
    if ALLOWED_SORT_FIELDS.contains(&field) {
        Ok(())
    } else {
        Err(rusqlite::Error::InvalidQuery)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartPlaylist {
    pub id: String,
    pub name: String,
    pub description: String,
    pub rules: Vec<Rule>,
    pub match_all: bool, // true = AND, false = OR
    pub limit: Option<usize>,
    pub sort_by: Option<String>,
    pub sort_desc: bool,
    pub live_update: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub field: String,      // "artist", "album", "genre", "rating", "play_count", "duration", etc.
    pub operator: String,   // "equals", "contains", "greater_than", "less_than", "between", "in_last", etc.
    pub value: String,      // The comparison value(s)
}

impl SmartPlaylist {
    /// Build a parameterized SQL query from the playlist rules.
    /// Returns (sql_string, params_vec) to be used with rusqlite execute.
    pub fn to_sql(&self) -> Result<(String, Vec<Value>)> {
        let mut conditions = Vec::new();
        let mut sql_params: Vec<Value> = Vec::new();
        
        for rule in &self.rules {
            validate_field(&rule.field)?;
            
            let condition = match rule.operator.as_str() {
                "equals" => {
                    sql_params.push(Value::Text(rule.value.clone()));
                    format!("{} = ?", rule.field)
                }
                "not_equals" => {
                    sql_params.push(Value::Text(rule.value.clone()));
                    format!("{} != ?", rule.field)
                }
                "contains" => {
                    sql_params.push(Value::Text(format!("%{}%", rule.value)));
                    format!("{} LIKE ?", rule.field)
                }
                "not_contains" => {
                    sql_params.push(Value::Text(format!("%{}%", rule.value)));
                    format!("{} NOT LIKE ?", rule.field)
                }
                "starts_with" => {
                    sql_params.push(Value::Text(format!("{}%", rule.value)));
                    format!("{} LIKE ?", rule.field)
                }
                "ends_with" => {
                    sql_params.push(Value::Text(format!("%{}", rule.value)));
                    format!("{} LIKE ?", rule.field)
                }
                "greater_than" => {
                    sql_params.push(Value::Text(rule.value.clone()));
                    format!("{} > ?", rule.field)
                }
                "less_than" => {
                    sql_params.push(Value::Text(rule.value.clone()));
                    format!("{} < ?", rule.field)
                }
                "greater_equal" => {
                    sql_params.push(Value::Text(rule.value.clone()));
                    format!("{} >= ?", rule.field)
                }
                "less_equal" => {
                    sql_params.push(Value::Text(rule.value.clone()));
                    format!("{} <= ?", rule.field)
                }
                "between" => {
                    let parts: Vec<&str> = rule.value.split(',').collect();
                    if parts.len() == 2 {
                        sql_params.push(Value::Text(parts[0].trim().to_string()));
                        sql_params.push(Value::Text(parts[1].trim().to_string()));
                        format!("{} BETWEEN ? AND ?", rule.field)
                    } else {
                        return Err(rusqlite::Error::InvalidQuery);
                    }
                }
                "in_last" => {
                    // Value should be in format "7:days" or "30:days" or "1:weeks"
                    let parts: Vec<&str> = rule.value.split(':').collect();
                    if parts.len() == 2 {
                        let num: i64 = parts[0].parse().unwrap_or(0);
                        let unit = parts[1];
                        let seconds = match unit {
                            "minutes" => num * 60,
                            "hours" => num * 60 * 60,
                            "days" => num * 60 * 60 * 24,
                            "weeks" => num * 60 * 60 * 24 * 7,
                            "months" => num * 60 * 60 * 24 * 30,
                            _ => num,
                        };
                        let threshold = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs() as i64 - seconds;
                        sql_params.push(Value::Integer(threshold));
                        format!("{} > ?", rule.field)
                    } else {
                        return Err(rusqlite::Error::InvalidQuery);
                    }
                }
                "is_null" => format!("{} IS NULL OR {} = ''", rule.field, rule.field),
                "not_null" => format!("{} IS NOT NULL AND {} != ''", rule.field, rule.field),
                _ => return Err(rusqlite::Error::InvalidQuery),
            };
            conditions.push(condition);
        }
        
        let join_operator = if self.match_all { " AND " } else { " OR " };
        let where_clause = if conditions.is_empty() {
            String::from("1=1")
        } else {
            conditions.join(join_operator)
        };
        
        let mut query = format!("SELECT {} FROM tracks WHERE {}", crate::scanner::TRACK_SELECT_COLUMNS, where_clause);
        
        if let Some(sort_field) = &self.sort_by {
            validate_sort_field(sort_field)?;
            let direction = if self.sort_desc { "DESC" } else { "ASC" };
            query.push_str(&format!(" ORDER BY {} {}", sort_field, direction));
        }
        
        if let Some(limit) = self.limit {
            query.push_str(&format!(" LIMIT {}", limit));
        }
        
        Ok((query, sql_params))
    }
}

pub fn create_smart_playlist_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS smart_playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            rules TEXT NOT NULL,
            match_all INTEGER DEFAULT 1,
            limit_count INTEGER,
            sort_by TEXT,
            sort_desc INTEGER DEFAULT 0,
            live_update INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;
    Ok(())
}

pub fn save_smart_playlist(conn: &Connection, playlist: &SmartPlaylist) -> Result<()> {
    let rules_json = serde_json::to_string(&playlist.rules).unwrap();
    
    conn.execute(
        "INSERT OR REPLACE INTO smart_playlists (id, name, description, rules, match_all, limit_count, sort_by, sort_desc, live_update, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            playlist.id,
            playlist.name,
            playlist.description,
            rules_json,
            playlist.match_all as i32,
            playlist.limit,
            playlist.sort_by,
            playlist.sort_desc as i32,
            playlist.live_update as i32,
            playlist.created_at,
        ],
    )?;
    Ok(())
}

pub fn load_smart_playlist(conn: &Connection, id: &str) -> Result<SmartPlaylist> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, rules, match_all, limit_count, sort_by, sort_desc, live_update, created_at
         FROM smart_playlists WHERE id = ?1"
    )?;
    
    let playlist = stmt.query_row([id], |row| {
        let rules_json: String = row.get(3)?;
        let rules: Vec<Rule> = serde_json::from_str(&rules_json).map_err(|e| {
            log::warn!("Corrupted rules JSON in smart playlist '{}': {}", id, e);
            rusqlite::Error::FromSqlConversionFailure(
                3,
                rusqlite::types::Type::Text,
                Box::new(e),
            )
        })?;
        
        Ok(SmartPlaylist {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            rules,
            match_all: row.get::<_, i32>(4)? != 0,
            limit: row.get(5)?,
            sort_by: row.get(6)?,
            sort_desc: row.get::<_, i32>(7)? != 0,
            live_update: row.get::<_, i32>(8)? != 0,
            created_at: row.get(9)?,
        })
    })?;
    
    Ok(playlist)
}

pub fn load_all_smart_playlists(conn: &Connection) -> Result<Vec<SmartPlaylist>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, rules, match_all, limit_count, sort_by, sort_desc, live_update, created_at
         FROM smart_playlists"
    )?;
    
    let playlists = stmt.query_map([], |row| {
        let rules_json: String = row.get(3)?;
        let playlist_id: String = row.get(0)?;
        let rules: Vec<Rule> = serde_json::from_str(&rules_json).map_err(|e| {
            log::warn!("Corrupted rules JSON in smart playlist '{}': {}", playlist_id, e);
            rusqlite::Error::FromSqlConversionFailure(
                3,
                rusqlite::types::Type::Text,
                Box::new(e),
            )
        })?;
        
        Ok(SmartPlaylist {
            id: playlist_id,
            name: row.get(1)?,
            description: row.get(2)?,
            rules,
            match_all: row.get::<_, i32>(4)? != 0,
            limit: row.get(5)?,
            sort_by: row.get(6)?,
            sort_desc: row.get::<_, i32>(7)? != 0,
            live_update: row.get::<_, i32>(8)? != 0,
            created_at: row.get(9)?,
        })
    })?
    .collect::<Result<Vec<_>>>()?;
    
    Ok(playlists)
}

pub fn delete_smart_playlist(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM smart_playlists WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_smart_playlist_sql_generation() {
        let playlist = SmartPlaylist {
            id: "test".to_string(),
            name: "High Rated Rock".to_string(),
            description: "Rock tracks with rating >= 4".to_string(),
            rules: vec![
                Rule {
                    field: "genre".to_string(),
                    operator: "equals".to_string(),
                    value: "Rock".to_string(),
                },
                Rule {
                    field: "rating".to_string(),
                    operator: "greater_equal".to_string(),
                    value: "4".to_string(),
                },
            ],
            match_all: true,
            limit: Some(50),
            sort_by: Some("rating".to_string()),
            sort_desc: true,
            live_update: true,
            created_at: 0,
        };
        
        let (sql, params) = playlist.to_sql().unwrap();
        assert!(sql.contains("genre = ?"));
        assert!(sql.contains("rating >= ?"));
        assert!(sql.contains("AND"));
        assert!(sql.contains("ORDER BY rating DESC"));
        assert!(sql.contains("LIMIT 50"));
        assert_eq!(params.len(), 2);
    }
    
    #[test]
    fn test_smart_playlist_rejects_invalid_field() {
        let playlist = SmartPlaylist {
            id: "test".to_string(),
            name: "Injection Attempt".to_string(),
            description: "".to_string(),
            rules: vec![
                Rule {
                    field: "1; DROP TABLE tracks; --".to_string(),
                    operator: "equals".to_string(),
                    value: "anything".to_string(),
                },
            ],
            match_all: true,
            limit: None,
            sort_by: None,
            sort_desc: false,
            live_update: true,
            created_at: 0,
        };
        
        assert!(playlist.to_sql().is_err());
    }
}
