# VPlayer Code Health Audit

**Date:** May 5, 2026  
**Based on:** Architecture Audit (March 2026) + full codebase re-read  
**Scope:** Code health, runtime correctness, hardening — NO new features

---

## Executive Summary

VPlayer has made substantial progress since the March 2026 B+/A- grade: nineteen items from that audit have been confirmed fixed, including the shuffle persistence bug, tray behavior polling, all missing database indexes, watcher mutex safety, ReplayGain ceiling, and scanner/migration test coverage. The codebase is structurally sound, with a clear layered architecture, consistent IPC discipline (`TauriAPI.ts` as the only invoke boundary), and robust Rust audio engine coordination via `lock_or_recover`. The most critical remaining risk is two startup/runtime panics in `main.rs` that bypass the `lock_or_recover` pattern established everywhere else. Beyond those, the outstanding issues are a DSP buffer sizing defect that misscales reverb at non-44100 Hz sample rates, a TOCTOU issue in the file-write security path, and several low-priority dead IPC surfaces and test gaps. The overall trajectory is positive; addressing Phase 1–2 items would bring the codebase to an A grade.

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

### [F-001] Startup panic on missing tray icon

**Severity:** 🟠 High  
**File:** `src-tauri/src/main.rs` (line 355)  
**Status:** New finding (not in March 2026 audit)

**Problem:**
```rust
.icon(app.default_window_icon().unwrap().clone())
```
`default_window_icon()` returns `Option<Image<'_>>`. If the icon is not bundled (e.g., a stripped build, a developer environment with missing assets), `unwrap()` panics immediately at tray construction, crashing the app before any window appears. All other setup errors in `main.rs` are propagated via `?`.

**Impact:**
The app fails to start with a hard panic rather than a user-visible error. This is the only `.unwrap()` in the tray setup path; the rest of `main.rs` uses `?`.

**Fix:**
```rust
.icon(
    app.default_window_icon()
        .ok_or_else(|| AppError::Config("No window icon configured".to_string()))?
        .clone(),
)
```

---

### [F-002] Reverb/allpass buffer integer truncation at non-44100 Hz sample rates

**Severity:** 🟠 High  
**File:** `src-tauri/src/effects.rs` (lines 227, 280)  
**Status:** New finding (confirmed still present)

**Problem:**
Both `CombFilter::new` and `AllpassFilter::new` compute their delay buffer size as:
```rust
let capacity = delay_samples * (sample_rate as usize / 44100 + 1);
```
Integer division truncates before the multiply. At 48000 Hz: `48000 / 44100 = 1` (not 1.088), so capacity = `delay * 2` — identical to 44100 Hz, meaning the reverb tail is ~8.2% shorter than specified. At 96000 Hz: `96000 / 44100 = 2` (not 2.177), so capacity = `delay * 3`, overallocating by ~31% and wasting memory. At 22050 Hz: `22050 / 44100 = 0`, so capacity = `delay * 1` — correct by accident but for the wrong reason.

**Impact:**
Reverb decay time is inaccurate for any sample rate other than 44100 Hz or 88200 Hz. At 48 kHz (the most common modern rate), all eight comb filters and four allpass filters are shorter than intended, producing a slightly drier, faster-decaying reverb. The Freeverb tuning constants are calibrated for 44100 Hz, so this defect degrades audio quality for the majority of USB DAC and modern soundcard users.

**Fix:**
Replace both instances with floating-point arithmetic and ceiling:
```rust
let capacity = (delay_samples as f64 * sample_rate as f64 / 44100.0).ceil() as usize;
let capacity = capacity.max(1); // guard against zero-length buffer
```
Apply identically to both `CombFilter::new` (line 227) and `AllpassFilter::new` (line 280).

---

### [F-003] Mutex poison panic in tray close handler

**Severity:** 🟡 Medium  
**File:** `src-tauri/src/main.rs` (line 496)  
**Status:** New finding

**Problem:**
```rust
.map(|s| s.tray_settings.lock().unwrap().close_to_tray)
```
This is inside the `RunEvent::WindowEvent` → `CloseRequested` handler. If any thread panics while holding the `tray_settings` mutex, the lock becomes poisoned and this line panics too — crashing the entire app on the user's next attempt to close the window. Every other `Mutex` in the codebase uses `lock_or_recover` or `unwrap_or_else(|e| e.into_inner())`.

**Impact:**
After a panic in any thread holding `tray_settings`, the user's next close-button click causes a second unrecoverable panic. This is the last remaining raw `.unwrap()` on a mutex in `main.rs`.

**Fix:**
```rust
.map(|s| s.tray_settings.lock().unwrap_or_else(|e| e.into_inner()).close_to_tray)
```

---

### [F-004] `check_missing_files` does sequential filesystem scan with no progress reporting

**Severity:** 🟡 Medium  
**File:** `src-tauri/src/commands/library_maintenance.rs` (line 14)  
**Status:** New finding

**Problem:**
```rust
pub fn check_missing_files(state: tauri::State<'_, AppState>) -> AppResult<Vec<(String, String)>> {
    let all_paths = state.db.get_all_track_paths()?;
    for (track_id, path) in all_paths {
        if !Path::new(&path).exists() {
            missing.push((track_id, path));
        }
    }
```
The function loads all track paths from the database (releasing the DB lock), then calls `Path::exists()` sequentially for every track. For a 50,000-track library, this means 50,000 blocking `stat(2)` syscalls with no progress signal to the frontend. The command is a `fn` (not `async fn`), so Tauri dispatches it on a blocking thread — the async runtime is not starved — but the command response can take 10–60 seconds on a slow storage device or network share, during which the frontend receives no feedback.

**Impact:**
The UI appears hung for the duration of the scan. No partial results are streamed. On a network-mounted library, this is effectively a timeout risk.

**Fix (minimal):** Emit a progress event periodically (e.g., every 1,000 tracks checked) via `app_handle.emit("missing-files-progress", count)`. Alternatively, document in the frontend that this command has O(N) latency and show a spinner with "Checking N tracks…" copy before invoking it.

**Fix (thorough):** Replace the command with a streaming variant that emits `missing-files-found` events incrementally, and a final `missing-files-complete` event.

---

### [F-005] `vacuum_database` has no guard against active playback

**Severity:** 🟡 Medium  
**File:** `src-tauri/src/commands/cache.rs` (line 118)  
**Status:** New finding

**Problem:**
```rust
pub fn vacuum_database(state: tauri::State<'_, AppState>) -> AppResult<()> {
    let conn = state.db.conn();
    conn.execute("VACUUM", [])?;
```
SQLite VACUUM requires an exclusive lock on the database file for its entire duration. It cannot run concurrently with any read or write. If the user triggers VACUUM while a track is playing, any pending DB operations — `increment_play_count`, `update_last_played`, position-save writes from `usePlaybackEffects` — will block until VACUUM finishes. For a 200 MB database, this can take 2–5 seconds. The current implementation acquires the mutex and immediately runs VACUUM with no check.

**Impact:**
Brief stall in play-count and position tracking during VACUUM. In the worst case (very large library + slow disk), the `playback-tick` handler's DB write backs up, causing observable playback counter inaccuracies.

**Fix:**
Add a pre-flight check before acquiring the DB lock:
```rust
pub fn vacuum_database(state: tauri::State<'_, AppState>) -> AppResult<()> {
    if state.player.is_playing() {
        return Err(AppError::Validation(
            "Cannot vacuum the database while a track is playing. Pause playback first.".to_string()
        ));
    }
    let conn = state.db.conn();
    conn.execute("VACUUM", [])?;
    Ok(())
}
```

---

### [F-006] `write_text_file` TOCTOU: security check uses `canonical_target` but write uses original `file_path`

**Severity:** 🟡 Medium  
**File:** `src-tauri/src/commands/library_maintenance.rs` (line 128)  
**Status:** New finding (security)

**Problem:**
```rust
// security check done with canonical_target
if !canonical_target.starts_with(&canonical_allowed) {
    return Err(AppError::Security(...));
}
// ...
fs::write(&file_path, content)  // ← writes to the ORIGINAL string, not canonical_target
```
The function correctly canonicalizes the target path and validates it is inside `app_data_dir`. But the actual write uses the original `file_path` string, not `canonical_target`. If a symlink is atomically swapped between the `canonicalize()` call and `fs::write()` (TOCTOU race), the write may follow the symlink to a path outside `app_data_dir` that was not checked.

Additionally, the `or_else` fallback uses `file_name().unwrap_or_default()`. If `file_path` has no file-name component (e.g., ends with `/`), `unwrap_or_default()` produces an empty `OsStr`, and `canonical_target` becomes a bare directory path. The subsequent `starts_with` check would pass (the dir is within app_data_dir), and `fs::write` would fail with a confusing "is a directory" error rather than a clear validation failure.

**Impact:**
On Windows, symlink creation requires elevated privileges, so exploitation is difficult in practice. The risk is low for a desktop music player but inconsistent with the security intent of this function. The empty-filename edge case produces a confusing, unexpected error.

**Fix:**
```rust
// Replace the write line:
fs::write(&canonical_target, content)
    .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to write file: {}", e))))
```
Also add an explicit check before the write:
```rust
if canonical_target.file_name().map_or(true, |n| n.is_empty()) {
    return Err(AppError::Validation("file_path must include a file name".to_string()));
}
```

---

### [F-007] `import_playlist` does not validate input path before reading

**Severity:** 🟡 Medium  
**File:** `src-tauri/src/commands/playlist.rs` (line ~140)  
**Status:** New finding (security — inconsistency with update_track_tags)

**Problem:**
```rust
let tracks = PlaylistIO::import_m3u(&input_path)
    .map_err(|e| AppError::Io(...))?;
```
The `input_path` argument is passed directly to `PlaylistIO::import_m3u` without calling `crate::validation::validate_path`. In contrast, `update_track_tags` explicitly calls `validate_path(&track_path)` before any filesystem operation. The `validate_path` function checks for existence and rejects `..` traversal sequences.

**Impact:**
A caller could supply a path containing `..` (e.g., `../../etc/hosts`) which `PlaylistIO::import_m3u` would open for reading. The read itself is benign (only the M3U text lines are consumed), and in normal operation this path comes from an OS file-picker dialog. However, the inconsistency is a policy violation — all commands accepting file paths should pass through `validate_path`.

**Fix:**
```rust
crate::validation::validate_path(&input_path)
    .map_err(|e| AppError::Validation(e.to_string()))?;
let tracks = PlaylistIO::import_m3u(&input_path)?;
```

---

### [F-008] `setActivePlaybackTracks` leaves `currentTrackId` set when track is absent from new list

**Severity:** 🟡 Medium  
**File:** `src/store/slices/playerSlice.ts` (line 82)  
**Status:** Confirmed from March 2026 audit (not yet fixed)

**Problem:**
```typescript
const remapped = tracks.findIndex(t => t.id === trackId);
return {
    activePlaybackTracks: tracks,
    currentTrack: remapped !== -1 ? remapped : null,
    // currentTrackId stays — the identity doesn't change
};
```
When `remapped === -1` (the playing track is absent from the new track list), `currentTrack` becomes `null` but `currentTrackId` is not cleared. `getCurrentTrackData()` guards correctly (`if (!state.currentTrackId) return null`) and returns `null` for this case, but any component that checks `currentTrackId !== null` as a proxy for "something is loaded" will be wrong — the ID references a track that is no longer accessible. This can produce a "playing indicator is visible but no track is shown" state during source switches (e.g., switching from library to a playlist view that doesn't include the current track).

**Impact:**
UI inconsistency: playback controls may show "playing" state (non-null `currentTrackId`) while `getCurrentTrackData()` returns `null`, depending on which slice components subscibe to.

**Fix:**
```typescript
const remapped = tracks.findIndex(t => t.id === trackId);
return {
    activePlaybackTracks: tracks,
    currentTrack: remapped !== -1 ? remapped : null,
    currentTrackId: remapped !== -1 ? trackId : null,  // clear on miss
};
```

---

### [F-009] No click suppression in seek() fallback reload path

**Severity:** 🟡 Medium  
**File:** `src-tauri/src/audio/mod.rs` (seek fallback, `Err` arm of `try_seek`)  
**Status:** Confirmed from March 2026 audit (not yet fixed)

**Problem:**
When `sink.try_seek()` fails (e.g., seeking backward in a format that Rodio cannot seek without a full reload), the fallback path clears and reloads the sink:
```rust
sink.clear();
sink.append(effects_source);
sink.set_volume(current_volume);
// ... then try_seek again ...
if was_playing { sink.play(); }
```
Between `clear()` and `play()` there is a brief silence (typically 10–50 ms) as the new audio source buffers. There is no fade-out before `clear()` and no fade-in after `play()`.

**Impact:**
Users hear a brief pop/silence when seeking backward in formats like FLAC and AIFF that require full-decode seek. The primary `try_seek` path (used for MP3, Ogg, and forward seeks) is seamless.

**Fix (minimal):** Fade the sink volume to 0 before `clear()` and restore it gradually after `play()`. Since this path is synchronous and on a blocking thread, a tight loop with short sleeps is acceptable:
```rust
// fade out
for i in (0..10).rev() {
    sink.set_volume(current_volume * i as f32 / 10.0);
    std::thread::sleep(Duration::from_millis(3));
}
sink.clear();
sink.append(effects_source);
if position > 0.0 { let _ = sink.try_seek(Duration::from_secs_f64(position)); }
if was_playing { sink.play(); }
// fade in
for i in 1..=10 {
    sink.set_volume(current_volume * i as f32 / 10.0);
    std::thread::sleep(Duration::from_millis(3));
}
sink.set_volume(current_volume);
```

---

### [F-010] `smart_playlists.rs` — `duration_since(UNIX_EPOCH).unwrap()` in `in_last` operator

**Severity:** 🔵 Low  
**File:** `src-tauri/src/smart_playlists.rs` (line 135)  
**Status:** New finding

**Problem:**
```rust
.duration_since(std::time::UNIX_EPOCH)
.unwrap()
```
`SystemTime::now().duration_since(UNIX_EPOCH)` returns `Err` only if the system clock is set before January 1, 1970. This is practically impossible on any Windows machine, but the panic is still present.

**Impact:**
Negligible in practice. A system with a corrupt clock would panic when the user executes a smart playlist with the `in_last` operator.

**Fix:**
```rust
.duration_since(std::time::UNIX_EPOCH)
.unwrap_or_default()
.as_secs()
```

---

### [F-011] `smart_playlists.rs` — `serde_json::to_string().unwrap()` in `save_smart_playlist`

**Severity:** 🔵 Low  
**File:** `src-tauri/src/smart_playlists.rs` (line 193)  
**Status:** New finding

**Problem:**
```rust
let rules_json = serde_json::to_string(&playlist.rules).unwrap();
```
`Rule` derives `Serialize`, and serde_json serialization of a `Vec<Rule>` containing only strings and integers cannot fail. In practice this is unreachable, but using `.unwrap()` is non-idiomatic and hides the potential error from callers.

**Impact:**
None in practice. Stylistic inconsistency with the rest of the command layer that uses `?`.

**Fix:**
```rust
let rules_json = serde_json::to_string(&playlist.rules)
    .map_err(|e| AppError::Serialization(e.to_string()))?;
```

---

### [F-012] `find_duplicates` N+1 query pattern

**Severity:** 🔵 Low  
**File:** `src-tauri/src/database_tracks.rs` (`find_duplicates` function)  
**Status:** Improved since March 2026 (full table load → N+1), but still present

**Problem:**
The March 2026 audit found `find_duplicates` loaded the entire tracks table into memory. The current implementation is better: one `GROUP BY` query identifies groups with duplicates, then one additional query fetches the tracks for each group. For a library with 1,000 duplicate groups, this is 1,001 round-trips through the SQLite mutex.

**Impact:**
Low for typical libraries (< 50 duplicate groups). Can become noticeable at scale (large collections with many duplicates). Not a correctness issue.

**Fix:**
Replace the per-group queries with a single `IN` clause over all duplicate-group keys:
```sql
SELECT * FROM tracks WHERE (title, artist) IN (
    SELECT title, artist FROM tracks
    GROUP BY title, artist HAVING COUNT(*) > 1
)
```
This reduces N+1 to a single query regardless of duplicate count.

---

### [F-013] `get_lyric_at_time` is a registered IPC command with no frontend caller

**Severity:** 🔵 Low  
**File:** `src-tauri/src/commands/lyrics.rs` (Tauri command `get_lyric_at_time`); `src-tauri/src/main.rs` (invoke handler)  
**Status:** New finding

**Problem:**
The `get_lyric_at_time` command is implemented in `commands/lyrics.rs` and registered in `main.rs`'s `generate_handler!`. However, `TauriAPI.ts` exposes only `loadLyrics` (mapping to `load_lyrics`). There is no `getLyricAtTime()` method in `TauriAPI.ts`, and no hook or window calls it directly. The `LyricsWindow` parses LRC timestamp data entirely client-side.

**Impact:**
Unmaintained dead surface that adds a stale entry to the IPC surface inventory. Any future security review of the invoke handler must account for this orphan command.

**Fix:**
If the command is not planned for use, remove it from `generate_handler!` in `main.rs`. If it is planned, add a `// TODO: called by LyricsWindow in v0.9.x` comment and add a `TauriAPI.ts` method stub.

---

### [F-014] `get_performance_stats` silently swallows all database errors

**Severity:** 🔵 Low  
**File:** `src-tauri/src/commands/cache.rs` (`get_performance_stats` function)  
**Status:** New finding

**Problem:**
Every `query_row` call in `get_performance_stats` uses `.unwrap_or(0)`:
```rust
let track_count: i32 = conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
    .unwrap_or(0);
```
If the database is locked, corrupt, or the schema has changed (e.g., mid-migration), the stats silently return zeros for all fields — there is no error logged and the `AppResult<T>` return type is not used to signal the failure.

**Impact:**
Debug and diagnostics are degraded. A corrupt or locked DB presents as healthy-looking zeroed stats.

**Fix (minimal):** Log the errors before defaulting:
```rust
let track_count: i32 = conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
    .map_err(|e| { warn!("get_performance_stats: track count failed: {}", e); e })
    .unwrap_or(0);
```

---

### [F-015] Five legacy audio health commands still registered alongside `get_audio_health`

**Severity:** 🔵 Low  
**File:** `src-tauri/src/main.rs` (lines 404–408); `src-tauri/src/commands/audio.rs`  
**Status:** Partially fixed — `get_audio_health` was added (March 2026 fix), but legacy commands were not removed

**Problem:**
```rust
// main.rs generate_handler!:
is_audio_healthy,        // line 404
needs_audio_reinit,      // line 405
get_inactive_duration,   // line 406
has_audio_device_changed, // line 407
is_audio_device_available, // line 408
get_audio_health,        // still here too
```
`TauriAPI.ts` has a `getAudioHealth()` method that calls the consolidated command. None of the five individual commands have corresponding `TauriAPI.ts` methods. No hook, window, or component calls them directly. They are dead IPC surface left over from before the consolidation.

**Impact:**
Unnecessary IPC handler registrations that inflate the attack surface and confuse the command inventory. Any future Tauri capability audit must explain why 5 unexposed audio-health commands exist.

**Fix:**
Remove the five entries from `generate_handler!` in `main.rs` and delete the five individual functions from `commands/audio.rs` (or keep them as private helpers if `get_audio_health` calls them internally — but confirm no-op deletion first).

---

### [F-016] `reorder_playlist_tracks` uses `unchecked_transaction()`

**Severity:** 🔵 Low  
**File:** `src-tauri/src/database_playlist.rs` (`reorder_playlist_tracks`)  
**Status:** Confirmed from March 2026 audit (still present, still safe)

**Problem:**
`reorder_playlist_tracks` uses `conn.unchecked_transaction()` rather than `conn.transaction()`. Per the March 2026 audit and the rusqlite documentation, `unchecked_transaction()` auto-rolls back on drop if not committed, so this is functionally equivalent. The risk is theoretical only.

**Impact:**
None in practice. Stylistic inconsistency that may confuse reviewers who expect `transaction()` for multi-step mutations.

**Fix:**
Replace `unchecked_transaction()` with `transaction()` and propagate the error with `?`. One-line change.

---

### [F-017] Test coverage gaps in DSP, device, and integration paths

**Severity:** 🔵 Low  
**File:** `src-tauri/src/effects.rs`, `src-tauri/src/audio/`, `src/hooks/`, `src/store/`  
**Status:** Partially improved since March 2026 (scanner + migration tests added); DSP/device gaps remain

**Problem:**
The following critical paths have zero automated test coverage:

1. **EQ/DSP processing correctness** — No test verifies that `BiquadFilter::process` produces a bounded, artifact-free output for a given gain curve. No test exercises `CombFilter` or `AllpassFilter` for buffer index wrap-around or the sample-rate scaling formula (which F-002 shows is still buggy). A test would have caught F-002.
2. **Visualizer SPSC correctness** — `VisualizerBuffer` uses a lock-free ring buffer with two atomic indices. No test verifies that concurrent push + get_samples doesn't produce torn reads or index-based panics at wrap-around (write_pos overflow at usize::MAX).
3. **Crossfade timing** — The `useCrossfade` hook fades between tracks. No test asserts that the volume envelope reaches 0 at the expected sample count and that no `NaN` values are produced at the crossover point.
4. **Keyboard shortcut bindings** — `useShortcuts` registers global shortcuts. No test verifies that shortcut events dispatch the correct store actions or that deregistration on cleanup is correct.
5. **Device disconnect/reconnect** — The reinit path (`reinit_and_reload`) is exercised by the `needs_reinit` predicate in `play()`. No integration test simulates a device disappearing mid-playback to confirm the reinit path restores playback position.
6. **Shuffle persistence regression** — The shuffle persistence bug is confirmed fixed, but there is no regression test that hydrates Zustand from a persisted state containing a non-empty `shuffleOrder` and asserts that it is zeroed.

**Impact:**
Any refactor of `effects.rs`, `VisualizerBuffer`, or the playback state machine can silently break audio quality or UI correctness with no automated signal.

**Concrete test descriptions (not implementations):**
- `test_biquad_low_shelf_bounded`: process 1000 samples of white noise through a ±12 dB low-shelf; assert all outputs are in [-2.0, 2.0] and no NaN/Inf values.
- `test_comb_filter_index_wrap`: call `CombFilter::process` for `capacity + 10` iterations; assert no panic and `index` resets correctly.
- `test_visualizer_write_pos_overflow`: push `usize::MAX - 2` samples (simulated via direct `write_pos` init), then push 10 more; assert no panic and `get_samples()` returns non-empty.
- `test_shuffle_order_cleared_on_hydrate`: call `merge()` with a persisted state containing a non-empty `shuffleOrder`; assert `merged.shuffleOrder` is empty.
- `test_setActivePlaybackTracks_clears_id_on_miss`: call `setActivePlaybackTracks([])` with a non-null `currentTrackId`; assert `currentTrackId` becomes `null` (pre-F-008 fix assertion).

---

## Implementation Phases

### Phase 1 — Critical Safety & Panic Elimination
*Goal: Eliminate all reachable panics. Any of these can crash the running app or the main process.*

- [x] [F-001] Replace `default_window_icon().unwrap()` with `ok_or_else()` + `?` in `main.rs:355`
- [x] [F-003] Replace `tray_settings.lock().unwrap()` with `unwrap_or_else(|e| e.into_inner())` in `main.rs:496`
- [x] [F-010] Replace `.duration_since(UNIX_EPOCH).unwrap()` with `.unwrap_or_default()` in `smart_playlists.rs:135`
- [x] [F-011] Replace `serde_json::to_string().unwrap()` with `map_err(...)? ` in `smart_playlists.rs:193`

### Phase 2 — Audio Engine Correctness
*Goal: Fix DSP defects that degrade audio quality at real-world sample rates.*

- [x] [F-002] Fix `CombFilter::new` and `AllpassFilter::new` buffer sizing to use floating-point ceiling in `effects.rs:227,280`
- [x] [F-009] Add 30 ms fade-out/in around sink reload in seek() fallback path in `audio/mod.rs`

### Phase 3 — Security Hardening
*Goal: Close the two security-related inconsistencies.*

- [x] [F-006] Change `fs::write(&file_path, ...)` to `fs::write(&canonical_target, ...)` in `library_maintenance.rs:128`; add empty-filename guard
- [x] [F-007] Add `validate_path(&input_path)?` in `import_playlist` before calling `PlaylistIO::import_m3u`

### Phase 4 — Database & Performance
*Goal: Prevent VACUUM-during-playback stall; provide feedback on slow operations.*

- [x] [F-005] Add `is_playing()` guard to `vacuum_database` in `cache.rs:118`
- [x] [F-004] Add progress event emission or streaming response to `check_missing_files` in `library_maintenance.rs:14`
- [x] [F-012] Replace N+1 pattern in `find_duplicates` with single IN-clause query in `database_tracks.rs`

### Phase 5 — State Management Correctness
*Goal: Eliminate stale-ID state after track source switches.*

- [x] [F-008] Clear `currentTrackId` when `remapped === -1` in `setActivePlaybackTracks` in `playerSlice.ts:82`

### Phase 6 — IPC Hygiene
*Goal: Remove all dead IPC surface and improve error observability.*

- [x] [F-013] Remove `get_lyric_at_time` from `generate_handler!` in `main.rs` (or add a comment documenting planned use)
- [x] [F-015] Remove `is_audio_healthy`, `needs_audio_reinit`, `get_inactive_duration`, `has_audio_device_changed`, `is_audio_device_available` from `generate_handler!` in `main.rs:404-408`
- [x] [F-014] Add `warn!()` logging before `.unwrap_or(0)` defaults in `get_performance_stats`

### Phase 7 — Low-Priority Polish & Test Coverage
*Goal: Code quality improvements and regression protection.*

- [x] [F-016] Replace `unchecked_transaction()` with `transaction()` in `reorder_playlist_tracks` in `database_playlist.rs`
- [x] [F-017a] Add `test_biquad_low_shelf_bounded` and `test_comb_filter_index_wrap` unit tests to `effects.rs`
- [x] [F-017b] Add `test_visualizer_write_pos_overflow` to `audio/visualizer.rs`
- [x] [F-017c] Add `test_shuffle_order_cleared_on_hydrate` to `store/__tests__/store.test.ts`
- [x] [F-017d] Add `test_setActivePlaybackTracks_clears_id_on_miss` to `store/__tests__/store.test.ts`
- [x] [F-017e] Add device disconnect tests to `audio/device.rs` (hardware-free) and `audio/mod.rs` (`#[ignore]` hardware tests)

---

## Closed / Confirmed Fixed

The following items from the March 2026 audit have been verified fixed by reading the current source:

1. **`watcher.rs` mutex raw `.unwrap()`** — All three lock sites (`add_path`, `remove_path`, `get_watched_paths`) now use `.unwrap_or_else(|e| e.into_inner())`. The 300 ms debounce window with HashSet accumulator is correct.
2. **Missing database indexes** — `idx_tracks_duration`, `idx_tracks_year`, and `idx_folders_path` are all present in `create_indexes()` in `database_schema.rs`. Total index count is 14.
3. **Anti-denormal protection in `BiquadFilter::process`** — `z1` and `z2` are flushed to 0.0 when their absolute value drops below 1e-15 (added at effects.rs).
4. **ReplayGain ceiling 3.0× (+9.5 dB)** — `replaygain_multiplier` is now clamped to `[0.1, 2.0]` (+6 dB max) in `volume_manager.rs`. Volume is subsequently clamped to `[0.0, 1.0]` at the sink.
5. **`SendOutputStream` safety comment** — The comment now correctly states "always accessed inside `Mutex<DeviceState>` within AudioPlayer", matching the actual invariant. The blanket `unsafe impl` on `AudioPlayer` has been removed.
6. **`useTrayBehavior` 400 ms polling** — Replaced with a reactive `win.onFocusChanged` event listener. No interval remains.
7. **A-B repeat 1 Hz interval** — Replaced with `useStore.subscribe()` callback driven by the 100 ms `playback-tick` event (~10× more responsive).
8. **Shuffle persistence bug (Known Bug #1)** — Confirmed fixed: `merge()` in `useStore.ts` explicitly zeroes `shuffleOrder`, `shuffleSignature`, and `shuffleHistory` on every Zustand hydration, preventing stale shuffle state from persisting across restarts.
9. **Zero scanner integration tests** — Six integration tests added in `src-tauri/tests/scanner_integration.rs` (empty dir, non-audio, nonexistent path, corrupt files, cancel flag, subdirectories).
10. **Zero migration integration tests** — `migration_steps_integration.rs` and `migration_boot_integration.rs` added.
11. **`update_track_tags` no path validation** — `validate_path(&track_path)` is now called before any file write in `commands/library_tracks.rs`.
12. **`enforce_cache_limit` zero validation** — `if limit_mb == 0 { return Err(...) }` guard is present in `commands/cache.rs`.
13. **`commands/library.rs` file too large** — Split into `library_scan.rs`, `library_tracks.rs`, and `library_maintenance.rs`. `scan_folder` and `scan_folder_incremental` correctly use `tauri::async_runtime::spawn_blocking`.
14. **ReplayGain module mixed concerns** — Pure analysis (`replaygain.rs`) and DB storage (`replaygain_store.rs`) are now separate. `analyze_album_replaygain` drops the DB mutex before computing the weighted average in Rust.
15. **Dead code: `get_adjustment()`** — Removed from `replaygain.rs`.
16. **Dead code: `get_lyrics_around()`** — Removed from `lyrics.rs`.
17. **`write_text_file` no sandboxing** — Now requires canonical path to be within `app_data_dir`; returns `AppError::Security` if the check fails (note: the TOCTOU issue remains — see F-006).
18. **LIKE escape in folder path queries** — Folder path LIKE queries now include proper escape handling.
19. **Audio health 5 separate commands → `get_audio_health` struct** — The `get_audio_health` command returns all five health fields in a single IPC call. `TauriAPI.ts` uses only this method. (Note: the legacy individual commands remain registered — see F-015.)

Dead code items from March 2026 audit confirmed **not** dead (all three are actively consumed):
- `loadingTrackIndex` — read by `TrackList.tsx` to display per-row loading spinners
- `tagEditorTrack` — read by `TagEditorWindow.tsx` (line 24) to populate the tag editor form
- `lastPlaylistId` — read and written by `usePlaylists.ts` (lines 46–69) for playlist restore on startup

---

## Appendix A: Panic Risk Registry

All `.unwrap()` and `.expect()` calls in production code paths (tests excluded).

| File | Line | Expression | Reachable From User? | Status |
|------|------|------------|----------------------|--------|
| `src-tauri/src/main.rs` | 355 | `app.default_window_icon().unwrap()` | Yes — app startup | ✅ Fixed (F-001) |
| `src-tauri/src/main.rs` | 496 | `tray_settings.lock().unwrap()` | Yes — close button click | ✅ Fixed (F-003) |
| `src-tauri/src/smart_playlists.rs` | 193 | `serde_json::to_string(&playlist.rules).unwrap()` | Yes — save smart playlist | ✅ Fixed (F-011) |
| `src-tauri/src/smart_playlists.rs` | 135 | `.duration_since(UNIX_EPOCH).unwrap()` | Yes — execute `in_last` rule | ✅ Fixed (F-010) |
| `src-tauri/src/audio/device.rs` | 20 | `#[allow(dead_code)]` suppressor on `SendOutputStream.0` accessor | N/A — accessor never called | No change needed |

---

## Appendix B: Unsafe Code Registry

| File | Lines | Block Purpose | Safety Invariant | Assessment |
|------|-------|---------------|-----------------|------------|
| `src-tauri/src/audio/device.rs` | 28–29 | `unsafe impl Send` + `unsafe impl Sync` for `SendOutputStream` | Always accessed inside `Mutex<DeviceState>` within `AudioPlayer`; all access goes through the mutex, ensuring single-threaded access at any point | **Safe** — comment is now accurate; invariant is upheld by `AudioPlayer`'s architecture |
| `src-tauri/src/audio/visualizer.rs` | 22–23 | `unsafe impl Send` + `unsafe impl Sync` for `VisualizerBuffer` | All fields are `AtomicU32` / `AtomicUsize`; all reads and writes use atomic operations; no mutable aliasing is possible | **Safe** — safety comment is accurate and the type is genuinely lock-free |

No other `unsafe` blocks exist in the production Rust source. `unsafe impl` on `AudioPlayer` itself has been removed (noted as fixed item #5 above).

---

## Appendix C: Mutex Registry

| Mutex | Owner File | Recovery Strategy | Remaining Risk |
|-------|-----------|-------------------|----------------|
| `AudioPlayer::sink` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` | Low |
| `AudioPlayer::playback` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` | Low |
| `AudioPlayer::preload` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` | Low |
| `AudioPlayer::volume_mgr` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` | Low |
| `AudioPlayer::device` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` | Low |
| `AudioPlayer::effects_processor` (Arc) | `src-tauri/src/audio/mod.rs` | `try_lock()` with pass-through fallback on contention | None — contention expected; fallback is by design |
| `AudioPlayer::effects_enabled` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` | Low |
| `BroadcastWake::flag` | `src-tauri/src/audio/mod.rs` | `lock_or_recover` | Low |
| `AppState::watcher` (FolderWatcher) | `src-tauri/src/main.rs` | `.unwrap_or_else(|e| e.into_inner())` inside all `watcher.rs` methods | Low — all three lock sites confirmed safe |
| `AppState::tray_settings` | `src-tauri/src/main.rs` | `.unwrap_or_else(|e| e.into_inner())` in RunEvent handler | Low — ✅ Fixed (F-003) |
| `AppState::visualizer` | `src-tauri/src/main.rs` | Not confirmed — needs verification | Unknown |
| `Database::conn` | `src-tauri/src/database.rs`, `replaygain_store.rs` | `.unwrap_or_else(|p| p.into_inner())` | Low |
