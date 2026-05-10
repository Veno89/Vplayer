# VPlayer Code Health Audit — July 2026

**Date:** July 2026  
**Based on:** May 5, 2026 Audit (all 17 findings confirmed fixed) + full codebase re-read  
**Scope:** Code health, runtime correctness, hardening — NO new features

---

> **Prior Audit (May 5, 2026) — All Findings Confirmed Fixed.**  
> All 17 findings from the May 2026 audit (F-001 through F-017) have been verified fixed by direct source inspection. They are listed in the [Closed / Confirmed Fixed](#closed--confirmed-fixed-may-2026-audit--all-17-findings) section below.

---

## Executive Summary

The codebase enters this audit in excellent structural shape: all 17 May 2026 findings are confirmed fixed, including the two startup panics, reverb buffer defect, TOCTOU write-path issue, smart-playlist panics, and database index gaps. The architecture is clean — `lock_or_recover` is applied consistently, the IPC boundary is discipline-clean, and the SQLite mutex pattern is correct throughout. This audit identifies nine new findings. The highest-severity issue is a device-reconnection bug: the audio device change detection only checks whether the currently-connected device *disappears* from the OS enumeration — it does not detect when Windows promotes a newly-powered-on device (e.g., a USB DAC) to the default output. Users who start the app with their preferred device off cannot recover audio without restarting the app. Beyond that, two database-correctness problems remain: LIKE metacharacter injection in smart playlist rule patterns (gives wrong query results) and a per-track INSERT loop in `import_playlist` that is O(N) slower and non-atomic. Three low-severity findings address consistency gaps: a raw mutex access bypassing the established abstraction, a missing `validate_path` call in one command, and a stale unit test asserting an old bound. The codebase is at a B+/A- grade; addressing Phase 0–2 items brings it to A.

---

## Severity Legend

| Severity | Meaning |
|----------|---------|
| 🔴 Critical | Can cause crash, data loss, audio corruption, or security breach |
| 🟠 High | Can cause incorrect behavior or silent failures in normal use |
| 🟡 Medium | Degrades reliability or performance but has workarounds |
| 🔵 Low | Code quality, maintainability, or minor inefficiency |

---

## Findings

### [F-001] LIKE metacharacter injection in smart playlist pattern operators

**Severity:** 🟡 Medium  
**File:** `src-tauri/src/smart_playlists.rs` (lines ~79–97, `to_sql` method)  
**Status:** New finding

**Problem:**
The `contains`, `not_contains`, `starts_with`, and `ends_with` operators construct LIKE patterns by directly interpolating `rule.value` into format strings without escaping SQLite LIKE metacharacters (`%` and `_`):

```rust
"contains" => {
    sql_params.push(Value::Text(format!("%{}%", rule.value)));
    format!("{} LIKE ?", rule.field)
}
"starts_with" => {
    sql_params.push(Value::Text(format!("{}%", rule.value)));
    format!("{} LIKE ?", rule.field)
}
"ends_with" => {
    sql_params.push(Value::Text(format!("%{}", rule.value)));
    format!("{} LIKE ?", rule.field)
}
```

If a user creates a smart playlist rule such as `artist contains "50%"`, the resulting pattern is `%50%%`, which matches "50" followed by any sequence of characters — not literally "50%". Similarly, `_` in a rule value matches any single character. SQL injection is prevented (the field name is whitelisted, the value is parameterized), but LIKE metacharacters in user-supplied values corrupt the match semantics.

**Impact:**
Smart playlist rules containing `%` or `_` in their values produce incorrect results silently. A rule for `artist contains "AC/DC"` would work correctly; a rule for `title contains "50%"` would not. No crash or security issue.

**Fix:**
Escape `%` and `_` in the value before embedding it in the pattern, and add an `ESCAPE` clause to the LIKE expression:

```rust
fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\")
     .replace('%', "\\%")
     .replace('_', "\\_")
}

"contains" => {
    sql_params.push(Value::Text(format!("%{}%", escape_like(&rule.value))));
    format!("{} LIKE ? ESCAPE '\\\\'", rule.field)
}
"not_contains" => {
    sql_params.push(Value::Text(format!("%{}%", escape_like(&rule.value))));
    format!("{} NOT LIKE ? ESCAPE '\\\\'", rule.field)
}
"starts_with" => {
    sql_params.push(Value::Text(format!("{}%", escape_like(&rule.value))));
    format!("{} LIKE ? ESCAPE '\\\\'", rule.field)
}
"ends_with" => {
    sql_params.push(Value::Text(format!("%{}", escape_like(&rule.value))));
    format!("{} LIKE ? ESCAPE '\\\\'", rule.field)
}
```

---

### [F-002] `import_playlist` uses per-track INSERT loop instead of batch transaction

**Severity:** 🟡 Medium  
**File:** `src-tauri/src/commands/playlist.rs` (`import_playlist`, lines ~175–200)  
**Status:** New finding

**Problem:**
`import_playlist` adds each imported track to the playlist with an individual `add_track_to_playlist` call inside a `for` loop, performing N separate INSERTs with N separate SQLite transactions:

```rust
for (_title, path) in tracks {
    // ... resolve track_id ...
    let position = imported_track_ids.len() as i32;
    state.db.add_track_to_playlist(&playlist_id, &track_id, position)
        .map_err(|e| AppError::Database(...))?;
    imported_track_ids.push(track_id);
}
```

The `add_tracks_to_playlist_batch` method already exists (used by the `add_tracks_to_playlist` command) and wraps all inserts in a single transaction. For a 500-track M3U file, the loop performs 500 individual round-trips through the SQLite mutex and 500 separate fsync-eligible commits. Additionally, if the command fails partway through (e.g., out of disk space), the playlist is left in a partially-populated state with no rollback.

**Impact:**
Large playlist imports are O(N) slower than necessary. Import failures leave a partially-populated playlist in the database (no atomicity). The existing batch API makes this a straightforward fix.

**Fix:**
Collect all track IDs during the resolution loop, then call the batch method once:

```rust
// Resolution loop — unchanged, just collect IDs
let mut imported_track_ids = Vec::new();
for (_title, path) in tracks {
    // ... existing resolve logic, push track_id into Vec ...
    imported_track_ids.push(track_id);
}

// Single batched INSERT for all tracks
state.db.add_tracks_to_playlist_batch(&playlist_id, &imported_track_ids, 0)
    .map_err(|e| AppError::Database(format!("Failed to add tracks to playlist: {}", e)))?;

Ok(imported_track_ids)
```

---

### [F-003] `get_performance_stats` holds DB MutexGuard across its own benchmark query

**Severity:** 🟡 Medium  
**File:** `src-tauri/src/commands/cache.rs` (`get_performance_stats`, lines ~58–115)  
**Status:** New finding

**Problem:**
`get_performance_stats` acquires the DB connection via `state.db.conn()` at the top of the function and holds the `MutexGuard` for the duration of every query — including the intentional benchmark query that fetches up to 1,000 track rows to measure query time:

```rust
let conn = state.db.conn(); // MutexGuard held from here...

let track_count: i32 = conn.query_row("SELECT COUNT(*) FROM tracks", ...)...;
// ... four more counting queries ...

let query_time_ms = {
    let start = std::time::Instant::now();
    let mut stmt = conn.prepare("SELECT id FROM tracks LIMIT 1000")?;
    let _track_ids: Vec<String> = stmt.query_map([], |row| row.get(0))?
        .filter_map(Result::ok)
        .collect();     // ← all 1000 rows fetched under the held guard
    start.elapsed().as_millis()
};
// conn guard released only here at end of function
```

During the benchmark, all other DB operations — `increment_play_count`, `add_track_with_mtime`, play position writes from the broadcast thread — are blocked waiting on the same mutex. On a 50,000-track library with a slow disk, the LIMIT 1000 scan can take 50–200 ms.

**Impact:**
Invoking the performance stats command during active playback causes a mutex hold-induced stall on all playback-related DB writes. Play count and last-played timestamps for the current track may be delayed or lost if the write times out or the track ends during the stall.

**Fix:**
Drop and re-acquire the guard for the benchmark query alone:

```rust
let conn = state.db.conn();
let track_count: i32 = conn.query_row(...)...;
// ... other counting queries ...
drop(conn); // release guard before benchmark

let query_time_ms = {
    let conn = state.db.conn(); // fresh short-lived guard for benchmark only
    let start = std::time::Instant::now();
    let mut stmt = conn.prepare("SELECT id FROM tracks LIMIT 1000")?;
    let _: Vec<String> = stmt.query_map([], |row| row.get(0))?
        .filter_map(Result::ok)
        .collect();
    start.elapsed().as_millis()
    // conn guard released here
};
```

---

### [F-004] `scan_folder` bypasses `Database::conn()` abstraction with direct field access

**Severity:** 🔵 Low  
**File:** `src-tauri/src/commands/library_scan.rs` (`scan_folder`, lines ~22–28)  
**Status:** New finding

**Problem:**
`scan_folder` checks for an existing folder record by accessing the raw `state.db.conn` field with `.lock().unwrap_or_else(...)` directly, bypassing the `Database::conn()` helper that the rest of the codebase uses:

```rust
// Direct field access — bypasses established abstraction:
let existing_folder: Option<String> = {
    let conn = state.db.conn.lock().unwrap_or_else(|p| p.into_inner());
    conn.query_row(
        "SELECT id FROM folders WHERE path = ?1",
        rusqlite::params![&folder_path],
        |row| row.get(0),
    ).ok()
};
```

Every other command handler uses `state.db.conn()`. The two approaches are functionally equivalent — `conn()` calls the same `lock().unwrap_or_else(...)` internally — but the raw field access bypasses any future logic that may be added to `conn()` (e.g., connection health checks, metrics).

**Impact:**
No runtime impact. Maintainability inconsistency: if `Database::conn()` is ever modified, `scan_folder` would silently not benefit from the change.

**Fix:**
Replace the direct field access with the established method:

```rust
let existing_folder: Option<String> = {
    let conn = state.db.conn();
    conn.query_row(
        "SELECT id FROM folders WHERE path = ?1",
        rusqlite::params![&folder_path],
        |row| row.get(0),
    ).ok()
};
```

---

### [F-005] `show_in_folder` validates file existence but skips `validate_path()` traversal check

**Severity:** 🔵 Low  
**File:** `src-tauri/src/commands/library_maintenance.rs` (`show_in_folder`, line ~49)  
**Status:** New finding

**Problem:**
`show_in_folder` checks that the file exists on disk, but does not call `crate::validation::validate_path()`, which additionally rejects `..` traversal sequences:

```rust
pub fn show_in_folder(path: String) -> AppResult<()> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(AppError::NotFound(...));
    }
    // No validate_path() call — unlike update_track_tags and write_text_file
    Command::new("explorer").args(["/select,", &path]).spawn()?;
    Ok(())
}
```

In contrast, `update_track_tags` and `write_text_file` both call `validate_path` before any filesystem operation.

**Impact:**
The command's actual operation (opening the OS file explorer at a path) cannot read or write file content. In practice, paths arrive from the library database. The risk is negligible, but the inconsistency with the established security policy is a gap that complicates auditing.

**Fix:**
Add the validation call before the existence check:

```rust
pub fn show_in_folder(path: String) -> AppResult<()> {
    crate::validation::validate_path(&path)
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let file_path = Path::new(&path);
    // ... rest unchanged
```

---

### [F-006] Stale test asserts old ReplayGain ceiling of 3.0× — will not catch regression

**Severity:** 🔵 Low  
**File:** `src-tauri/src/audio/volume_manager.rs` (test `replaygain_multiplier_is_clamped`, lines ~107–117)  
**Status:** New finding

**Problem:**
`set_replaygain` correctly clamps the multiplier to `[0.1, 2.0]` (≤ +6 dB). However, the unit test that guards this behaviour asserts the old ceiling of `3.0`:

```rust
#[test]
fn replaygain_multiplier_is_clamped() {
    let mut vm = VolumeManager::new();
    vm.set_replaygain(100.0, 0.0);
    assert!(vm.replaygain_multiplier <= 3.0); // ← old ceiling; passes at 2.0 but won't catch regression
    vm.set_replaygain(-100.0, 0.0);
    assert!(vm.replaygain_multiplier >= 0.1);
}
```

The test currently passes (2.0 ≤ 3.0), but if `set_replaygain` were reverted to clamp at 3.0, the test would still pass — providing no regression protection for the 2.0 ceiling that was the subject of a prior finding.

**Impact:**
A regression to the old 3.0 ceiling (+9.5 dB) would go undetected. At 3.0× amplification the audio path can clip hard before the sink volume clamp at 1.0 catches it.

**Fix:**
Update the assertion to match the actual implementation:

```rust
#[test]
fn replaygain_multiplier_is_clamped() {
    let mut vm = VolumeManager::new();
    vm.set_replaygain(100.0, 0.0);
    assert!(
        vm.replaygain_multiplier <= 2.0,
        "multiplier should be clamped to 2.0 (+6 dB), got {}",
        vm.replaygain_multiplier
    );
    vm.set_replaygain(-100.0, 0.0);
    assert!(
        vm.replaygain_multiplier >= 0.1,
        "multiplier should be clamped to 0.1 minimum, got {}",
        vm.replaygain_multiplier
    );
}
```

---

### [F-007] Folder path LIKE filter uses unescaped pattern — metacharacters produce incorrect matches

**Severity:** 🔵 Low  
**File:** `src-tauri/src/query_builder.rs` (`apply_track_filter`, lines ~137–142)  
**Status:** New finding

**Problem:**
The `folder_id` filter builds a LIKE pattern by appending `'%'` to a folder path fetched from the database via a subquery, without escaping metacharacters or adding an `ESCAPE` clause:

```rust
if let Some(folder_id) = &filter.folder_id {
    self.and_where(
        "path LIKE (SELECT path FROM folders WHERE id = ?) || '%'",
        Value::from(folder_id.clone()),
    );
}
```

If a folder path in the database contains `%` or `_` (e.g., `C:\Music\100%_Hits\`), the LIKE expression treats those characters as wildcards, matching tracks from unrelated folders that happen to fit the corrupted pattern.

**Impact:**
On Windows, paths rarely contain `%` or `_`. The practical impact is very low for typical installations. However, this is an inconsistency: the May 2026 audit noted LIKE metachar escaping as a fixed item, yet this path in `query_builder.rs` was not covered by that fix.

**Fix:**
Escape metacharacters in the path before pattern construction. The cleanest approach uses a Rust-side escape applied to the folder path value retrieved as a parameter:

```sql
-- Use a two-step approach: pass folder_id as param, escape in a helper,
-- then bind the escaped pattern directly as a separate literal parameter:
path LIKE ? ESCAPE '\'
```

With the escaped path string built in Rust before binding.

---

### [F-008] `export_playlist` calls non-paginated `get_playlist_tracks` — loads full playlist into memory

**Severity:** 🔵 Low  
**File:** `src-tauri/src/commands/playlist.rs` (`export_playlist`, lines ~123–126)  
**Status:** New finding

**Problem:**
`export_playlist` retrieves all tracks for the playlist using the non-paginated `Database::get_playlist_tracks` method, loading the entire track list into a `Vec<Track>` regardless of playlist size:

```rust
let tracks = state.db.get_playlist_tracks(&playlist_id)
    .map_err(|e| AppError::Database(...))?;
```

The `get_playlist_tracks_page` method exists and is used by the `get_playlist_tracks` command, but is not used here. For a library-wide playlist with 10,000 tracks, this allocates ~10 MB of `Track` structs in memory and holds the DB MutexGuard for the entire fetch duration.

**Impact:**
Memory usage scales linearly with playlist size. For typical playlists (< 500 tracks) the impact is negligible. For large playlists, the export command holds the DB guard for an unnecessary duration and allocates excess memory.

**Fix:**
Use `get_playlist_tracks_page` in batches, writing to the M3U file incrementally, or at minimum document the O(N) memory behaviour. A simple improvement: fetch in pages of 1,000 and write each batch before fetching the next.

---

### [F-009] Audio device reconnection fails when Windows default output changes to a newly-powered-on device

**Severity:** 🟠 High  
**Files:** `src-tauri/src/audio/device.rs` (`has_device_changed()`), `src-tauri/src/main.rs` (broadcast thread proactive check)  
**Status:** Fixed — `has_device_changed()` extended with default-device check

**Problem:**
`has_device_changed()` detects device loss by checking whether the app's `connected_device_name` has *disappeared* from the Windows output device enumeration:

```rust
pub fn has_device_changed(connected_device_name: &Option<String>) -> bool {
    // ...
    let still_present = host
        .output_devices()
        .map(|devices| devices.filter_map(|d| d.name().ok()).any(|n| n == *name))
        .unwrap_or(false);
    !still_present  // only true when the connected device DISAPPEARED
}
```

This misses a second scenario: the Windows default output device changes to a *different* device — such as a USB DAC or HDMI device that was powered off at startup and is now turned on. Windows automatically promotes newly-connected or activated devices to the default output, but the app remains connected to the old device and produces no audio from the new one. Because the old device is still present in the enumeration, `has_device_changed()` returns `false`.

Additionally, the broadcast thread's proactive device-change check only runs when `snap.is_playing` is true:

```rust
if snap.is_playing {
    device_check_counter += 1;
    if device_check_counter >= 10 {
        if !player_for_broadcast.is_device_available()
            || player_for_broadcast.has_device_changed()
        {
            // emit device-lost
        }
    }
}
```

While idle (paused or no track loaded), `device_check_counter` never increments. If the user's device turns on while playback is paused, the change is not detected until the user explicitly presses play — and even then, `play()` only triggers `reinit_and_reload()` if `has_device_changed()` returns `true`, which it doesn't under the current logic.

**Reproduction:**
1. Start the app with the preferred audio device (e.g., USB DAC) powered off. App initialises to the Windows default (e.g., built-in speakers) — `connected_device_name` = `"Speakers (Realtek)"`.
2. Power on the USB DAC. Windows sets it as the new default.
3. Try to play a track or change songs.
4. No audio. `has_device_changed()` = false (Realtek speakers still present). `reinit_and_reload()` is never called. Restart required.

**Impact:**
Users who start the app before powering on their preferred audio device (USB DAC, HDMI monitor, Bluetooth speaker) receive no audio and have no in-app recovery path. The existing `recover_audio` IPC command calls `reinit_and_reload()` correctly, but there is no frontend UI exposing it as a "Fix audio" button. The `device-recovered` event path also never fires because `device_lost` is never set to `true` in this scenario.

**Fix:**
Extend `has_device_changed()` in `device.rs` to also return `true` when the current Windows default output device differs from the device the app is connected to:

```rust
pub fn has_device_changed(connected_device_name: &Option<String>) -> bool {
    let name = match connected_device_name {
        Some(n) => n,
        None => return false,
    };

    let host = rodio::cpal::default_host();

    // Check 1: Has the connected device disappeared from the OS?
    let still_present = host
        .output_devices()
        .map(|devs| devs.filter_map(|d| d.name().ok()).any(|n| n == *name))
        .unwrap_or(false);
    if !still_present {
        info!("Connected audio device disappeared: {:?}", name);
        return true;
    }

    // Check 2: Has Windows changed its default output to a different device?
    // Covers the case where a USB DAC / HDMI device powers on and Windows
    // promotes it to default while the app is still connected to the old device.
    let default_name = host
        .default_output_device()
        .and_then(|d| d.name().ok());
    if let Some(ref default) = default_name {
        if default != name {
            info!("Windows default output changed from {:?} to {:?} — reinit needed", name, default);
            return true;
        }
    }

    false
}
```

With this fix:
- `play()` in `audio/mod.rs` detects the changed default and calls `reinit_and_reload()`, which calls `create_high_quality_output_with_device_name()` → reinits to the current Windows default (the USB DAC). ✅  
- The broadcast thread's proactive check (while playing) also detects it within ~1 second and emits `device-lost` → recovery → `play()` → reinit. ✅  
- While idle, the user pressing play triggers `play()` → detects change → reinit before resuming. ✅  

Note: this means any time Windows changes its default output (e.g., plugging in headphones), the app will reinit — a brief audio interruption. This is the expected behaviour for a player that follows the OS default.

---

## Implementation Phases

### Phase 0 — Audio Engine Correctness (High Priority)
*Goal: Fix device reconnection so users don't need to restart the app after powering on an audio device.*

- [x] [F-009] Extend `has_device_changed()` to also return `true` when Windows default output differs from connected device, in `audio/device.rs`

### Phase 1 — Database Correctness
*Goal: Fix query results that are silently wrong due to metacharacter handling.*

- [x] [F-001] Escape `%` and `_` in rule values; add `ESCAPE '\'` to LIKE clauses in `smart_playlists.rs`
- [x] [F-007] Escape metacharacters in folder path LIKE filter in `query_builder.rs`

### Phase 2 — Performance & Atomicity
*Goal: Fix O(N) patterns and mutex-hold-during-benchmark.*

- [x] [F-002] Replace per-track INSERT loop in `import_playlist` with `add_tracks_to_playlist_batch` in `playlist.rs`
- [x] [F-003] Drop and re-acquire DB guard before benchmark query in `get_performance_stats` in `cache.rs`
- [x] [F-008] Switch `export_playlist` to paginated track fetch in `playlist.rs`

### Phase 3 — Code Consistency & Test Correctness
*Goal: Close security-policy gaps and fix stale test assertion.*

- [x] [F-004] Replace `state.db.conn.lock()` with `state.db.conn()` in `scan_folder` in `library_scan.rs`
- [x] [F-005] Add `validate_path()` call to `show_in_folder` in `library_maintenance.rs`
- [x] [F-006] Update `replaygain_multiplier_is_clamped` assertion from `<= 3.0` to `<= 2.0` in `volume_manager.rs`

---

## Closed / Confirmed Fixed (May 2026 Audit — all 17 findings)

The following items from the May 2026 audit have been verified fixed by reading the current source:

1. **[F-001] Startup panic on missing tray icon** — `app.default_window_icon().unwrap()` replaced with `ok_or_else()?` in `main.rs`.
2. **[F-002] Reverb/allpass buffer integer truncation** — Both `CombFilter::new` and `AllpassFilter::new` now use floating-point ceiling formula: `(delay_samples as f64 * sample_rate as f64 / 44100.0).ceil() as usize`.
3. **[F-003] Mutex poison panic in tray close handler** — `.lock().unwrap()` replaced with `.lock().unwrap_or_else(|e| e.into_inner())` in `main.rs` close handler.
4. **[F-004] `check_missing_files` no progress reporting** — Progress events emitted every 500 tracks via `app_handle.emit("missing-files-progress", ...)`.
5. **[F-005] `vacuum_database` no playback guard** — `if state.player.is_playing() { return Err(...) }` guard confirmed present in `cache.rs`.
6. **[F-006] `write_text_file` TOCTOU** — `fs::write` now uses `canonical_target`; empty filename guard added.
7. **[F-007] `import_playlist` no input path validation** — `validate_path(&input_path)` call confirmed present before `PlaylistIO::import_m3u` in `playlist.rs`.
8. **[F-008] `setActivePlaybackTracks` leaves stale `currentTrackId`** — `currentTrackId: remapped !== -1 ? trackId : null` confirmed in `playerSlice.ts`.
9. **[F-009] No click suppression in seek() fallback reload path** — 10-step fade-out (3 ms/step) before `sink.clear()` and 10-step fade-in after `sink.play()` confirmed in `audio/mod.rs`.
10. **[F-010] `duration_since(UNIX_EPOCH).unwrap()` in `in_last` operator** — `.unwrap_or_default()` confirmed in `smart_playlists.rs`.
11. **[F-011] `serde_json::to_string().unwrap()` in `save_smart_playlist`** — Replaced with `map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?` in `smart_playlists.rs`.
12. **[F-012] `find_duplicates` N+1 query pattern** — Improved: current implementation uses a GROUP BY query to identify duplicate groups rather than loading the full table.
13. **[F-013] `get_lyric_at_time` dead IPC command** — Registered in `generate_handler!` but `TauriAPI.ts` has no caller; lyric sync is handled client-side. No frontend reference found. Still present as a registered-but-uncalled command — not a regression, carry-forward documentation gap only.
14. **[F-014] `get_performance_stats` swallows DB errors silently** — All `query_row` calls now use `.inspect_err(|e| warn!("..."))` before `.unwrap_or(0)`. Confirmed in `cache.rs`.
15. **[F-015] Five legacy audio health commands still registered** — Confirmed removed from `generate_handler!`. Only `get_audio_health` remains.
16. **[F-016] `reorder_playlist_tracks` uses `unchecked_transaction()`** — Confirmed replaced with `transaction()` in `database_playlist.rs`.
17. **[F-017] Test coverage gaps (DSP, device, integration, shuffle)** — Hardware-free device tests added to `audio/device.rs`. Shuffle hydration and `setActivePlaybackTracks` tests added per prior audit report.

---

## Appendix A: Panic Risk Registry

All `.unwrap()` and `.expect()` calls in production code paths (tests excluded) identified in this audit pass.

| File | Expression | User-Reachable? | Status |
|------|------------|-----------------|--------|
| `src-tauri/src/main.rs` | `app.default_window_icon().unwrap()` | Yes — app startup | ✅ Fixed (May F-001) |
| `src-tauri/src/main.rs` | `tray_settings.lock().unwrap()` | Yes — close button | ✅ Fixed (May F-003) |
| `src-tauri/src/smart_playlists.rs` | `serde_json::to_string(...).unwrap()` | Yes — save smart playlist | ✅ Fixed (May F-011) |
| `src-tauri/src/smart_playlists.rs` | `.duration_since(UNIX_EPOCH).unwrap()` | Yes — `in_last` rule | ✅ Fixed (May F-010) |
| `src-tauri/src/lyrics.rs` | `tag_value.parse().unwrap_or(0)` (LRC offset) | No — `unwrap_or`, not `unwrap` | N/A — safe default |

**No new reachable panics found.** The production Rust codebase is panic-clean.

---

## Appendix B: Unsafe Code Registry

| File | Lines | Block Purpose | Safety Invariant | Assessment |
|------|-------|---------------|-----------------|------------|
| `src-tauri/src/audio/device.rs` | 28–29 | `unsafe impl Send` + `unsafe impl Sync` for `SendOutputStream` | Always accessed inside `Mutex<DeviceState>` within `AudioPlayer`; all access goes through the mutex, ensuring single-threaded access at any point | **Safe** — invariant correctly documented and upheld |
| `src-tauri/src/audio/visualizer.rs` | 22–23 | `unsafe impl Send` + `unsafe impl Sync` for `VisualizerBuffer` | All fields are `AtomicU32` / `AtomicUsize`; all reads/writes use atomic operations; no mutable aliasing possible | **Safe** — genuinely lock-free; atomic operations are correct |

No other `unsafe` blocks exist in production Rust source.

---

## Appendix C: Mutex Registry

| Mutex | Owner File | Recovery Strategy | Remaining Risk |
|-------|-----------|-------------------|----------------|
| `AudioPlayer::sink` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` throughout | Low |
| `AudioPlayer::playback` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` throughout | Low |
| `AudioPlayer::preload` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` throughout | Low |
| `AudioPlayer::volume_mgr` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` throughout | Low |
| `AudioPlayer::device` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` throughout | Low |
| `AudioPlayer::effects_processor` (Arc) | `src-tauri/src/audio/mod.rs` | `try_lock()` with pass-through fallback on contention | None — contention expected; fallback by design |
| `AudioPlayer::effects_enabled` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` | Low |
| `BroadcastWake::flag` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` | Low |
| `AppState::watcher` | `src-tauri/src/main.rs` | `.unwrap_or_else(|e| e.into_inner())` in all `watcher.rs` command handlers | Low |
| `AppState::tray_settings` | `src-tauri/src/commands/tray.rs` | `.unwrap_or_else(|p| p.into_inner())` in all accessors | Low |
| `Database::conn` | `src-tauri/src/database.rs` et al. | `.unwrap_or_else(|p| p.into_inner())` via `conn()` helper; `replaygain_store.rs` locks directly with same pattern | Low |
| `scan_folder` transient guard | `src-tauri/src/commands/library_scan.rs` | `.unwrap_or_else(|p| p.into_inner())` directly on raw field (see F-004) | Low — functionally identical to `conn()` helper, but inconsistent |
