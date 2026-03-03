//! ReplayGain database storage (separated from analysis for testability).
//!
//! `replaygain.rs` contains pure EBU R128 analysis — no database imports.
//! This module owns all DB reads/writes for per-track and per-album
//! ReplayGain data.

use crate::replaygain::{AlbumReplayGainData, ReplayGainData};
use crate::time_utils::now_millis;
use log::warn;
use rusqlite::Connection;
use std::sync::Mutex;

/// Store per-track ReplayGain data.
pub fn store_replaygain(
    conn: &Mutex<Connection>,
    track_path: &str,
    data: &ReplayGainData,
) -> Result<(), String> {
    let conn = conn.lock().unwrap_or_else(|poisoned| {
        warn!("ReplayGain DB mutex was poisoned — recovering inner connection");
        poisoned.into_inner()
    });

    conn.execute(
        "UPDATE tracks SET track_gain = ?, track_peak = ?, loudness = ? WHERE path = ?",
        rusqlite::params![data.track_gain, data.track_peak, data.loudness, track_path],
    )
    .map_err(|e| format!("Failed to store ReplayGain: {}", e))?;

    Ok(())
}

/// Read per-track ReplayGain data.
pub fn get_replaygain(
    conn: &Mutex<Connection>,
    track_path: &str,
) -> Result<Option<ReplayGainData>, String> {
    let conn = conn.lock().unwrap_or_else(|poisoned| {
        warn!("ReplayGain DB mutex was poisoned — recovering inner connection");
        poisoned.into_inner()
    });

    let mut stmt = conn
        .prepare("SELECT track_gain, track_peak, loudness FROM tracks WHERE path = ?")
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let result = stmt.query_row(rusqlite::params![track_path], |row| {
        let gain: Option<f64> = row.get(0)?;
        let peak: Option<f64> = row.get(1)?;
        let loudness: Option<f64> = row.get(2)?;

        if let (Some(g), Some(p), Some(l)) = (gain, peak, loudness) {
            Ok(Some(ReplayGainData {
                track_gain: g,
                track_peak: p,
                loudness: l,
            }))
        } else {
            Ok(None)
        }
    });

    match result {
        Ok(data) => Ok(data),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Database error: {}", e)),
    }
}

/// Store album-level ReplayGain data in the `album_replaygain` cache table.
pub fn store_album_replaygain(
    conn: &Mutex<Connection>,
    artist: &str,
    album: &str,
    data: &AlbumReplayGainData,
) -> Result<(), String> {
    let conn = conn.lock().unwrap_or_else(|poisoned| {
        warn!("ReplayGain DB mutex was poisoned — recovering inner connection");
        poisoned.into_inner()
    });

    let updated_at = now_millis();
    conn.execute(
        "INSERT OR REPLACE INTO album_replaygain
            (artist, album, album_gain, album_peak, loudness, track_count, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            artist,
            album,
            data.album_gain,
            data.album_peak,
            data.loudness,
            data.track_count,
            updated_at
        ],
    )
    .map_err(|e| format!("Failed to store album ReplayGain: {}", e))?;

    Ok(())
}

/// Read album-level ReplayGain data from cache table.
pub fn get_album_replaygain(
    conn: &Mutex<Connection>,
    artist: &str,
    album: &str,
) -> Result<Option<AlbumReplayGainData>, String> {
    let conn = conn.lock().unwrap_or_else(|poisoned| {
        warn!("ReplayGain DB mutex was poisoned — recovering inner connection");
        poisoned.into_inner()
    });

    let mut stmt = conn
        .prepare(
            "SELECT album_gain, album_peak, loudness, track_count
             FROM album_replaygain
             WHERE artist = ?1 AND album = ?2",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let result = stmt.query_row(rusqlite::params![artist, album], |row| {
        Ok(AlbumReplayGainData {
            album_gain: row.get(0)?,
            album_peak: row.get(1)?,
            loudness: row.get(2)?,
            track_count: row.get(3)?,
        })
    });

    match result {
        Ok(data) => Ok(Some(data)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Database error: {}", e)),
    }
}

/// Compute album-level ReplayGain from existing per-track rows and cache it.
pub fn analyze_album_replaygain(
    conn: &Mutex<Connection>,
    artist: &str,
    album: &str,
) -> Result<Option<AlbumReplayGainData>, String> {
    let conn_guard = conn.lock().unwrap_or_else(|poisoned| {
        warn!("ReplayGain DB mutex was poisoned — recovering inner connection");
        poisoned.into_inner()
    });

    let mut stmt = conn_guard
        .prepare(
            "SELECT track_gain, track_peak, loudness, duration
             FROM tracks
             WHERE artist = ?1
               AND album = ?2
               AND track_gain IS NOT NULL
               AND track_peak IS NOT NULL
               AND loudness IS NOT NULL",
        )
        .map_err(|e| format!("Failed to prepare album analysis query: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![artist, album], |row| {
            let gain: f64 = row.get(0)?;
            let peak: f64 = row.get(1)?;
            let loudness: f64 = row.get(2)?;
            let duration: f64 = row.get(3)?;
            Ok((gain, peak, loudness, duration.max(0.001)))
        })
        .map_err(|e| format!("Failed to execute album analysis query: {}", e))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to collect album analysis rows: {}", e))?;

    drop(stmt);
    drop(conn_guard);

    if rows.is_empty() {
        return Ok(None);
    }

    let mut weighted_gain_sum = 0.0_f64;
    let mut weighted_loudness_sum = 0.0_f64;
    let mut total_duration = 0.0_f64;
    let mut peak = 0.0_f64;

    for (gain, track_peak, loudness, duration) in &rows {
        weighted_gain_sum += gain * duration;
        weighted_loudness_sum += loudness * duration;
        total_duration += duration;
        if *track_peak > peak {
            peak = *track_peak;
        }
    }

    if total_duration <= 0.0 {
        return Ok(None);
    }

    let data = AlbumReplayGainData {
        album_gain: weighted_gain_sum / total_duration,
        album_peak: peak,
        loudness: weighted_loudness_sum / total_duration,
        track_count: rows.len() as i64,
    };

    store_album_replaygain(conn, artist, album, &data)?;
    Ok(Some(data))
}
