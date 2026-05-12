# VPlayer Codebase Audit — July 2026 (v2)

**Scope:** Full codebase audit — code health, runtime correctness, UI/UX.  
**Version audited:** 0.9.32  
**Stack:** Tauri 2.9 · Rust 2021 · React 19 · Zustand 5 · SQLite (rusqlite 0.30) · Rodio 0.21 · Symphonia 0.5 · Lofty 0.18  
**Previous audit findings:** All 9 July 2026 (F-001–F-009) and all 17 May 2026 findings confirmed fixed.

---

## Severity Legend

| Symbol | Level | Meaning |
|--------|-------|---------|
| 🔴 | **High** | Wrong runtime behaviour, data corruption risk, or user-visible silent failure |
| 🟡 | **Medium** | Performance regression, edge-case correctness, confusing UX |
| 🟢 | **Low** | Code hygiene, dead code, minor polish |

---

## Findings Summary

| ID | Area | Severity | Title |
|----|------|----------|-------|
| A-001 | Rust / DSP | 🔴 | `EffectsSource::try_seek` leaves stale batch buffer |
| A-002 | Rust / DB | 🟡 | Incremental scan writes each track in its own transaction |
| A-003 | Rust / Smart Playlists | 🟡 | `between` operator silently substitutes `0` for malformed values |
| A-004 | Rust / Search | 🟡 | LIKE wildcards not escaped in library search |
| A-005 | Rust / Commands | 🟡 | `update_track_path` skips path validation |
| A-006 | React / Hooks | 🟡 | `loadPlaylists` fires twice on mount |
| A-007 | React / Queue | 🟡 | Consumed queue items are never removed from the array |
| A-008 | React / Crossfade | 🟡 | Crossfade timer is throttle-sensitive |
| A-009 | Rust / Commands | 🟢 | Five dead private `_fn` helpers in `commands/audio.rs` |
| A-010 | Rust / DB | 🟢 | Dead `tracks.album_art` column never cleaned up |
| A-011 | Rust / Stats | 🟢 | `memory_usage` in `get_performance_stats` is fabricated |
| A-012 | Rust / Watcher | 🟢 | `FolderWatcher.tx` is stored but never used |
| A-013 | Rust / Scanner | 🟢 | `WalkDir::follow_links(true)` without root boundary check |
| A-014 | React / Library | 🟢 | Drag-image cleanup has no error guard |
| A-015 | UI/UX | 🟢 | Three pre-existing stubs (mini-player, tray, context menu) |
| A-016 | React / UI | 🟡 | Context menu edge correction undone by async `useEffect` |

---

## Detailed Findings

---

### A-001 🔴 — `EffectsSource::try_seek` leaves stale batch buffer

**File:** `src-tauri/src/audio/effects.rs`

**Problem:**  
`EffectsSource` processes audio in batches of 512 samples for lock-efficiency. The struct holds an internal `batch_buf: Vec<f32>` and a `batch_pos: usize` cursor. When `try_seek` is called, it delegates to `self.input.try_seek(pos)` — correctly seeking the underlying decoder — but it does **not** clear `batch_buf` or reset `batch_pos`.

After the seek, the iterator will continue to yield up to `BATCH_SIZE - batch_pos` (up to 511) stale pre-seek samples before refilling the buffer from the new position. At 44.1 kHz stereo, 511 samples is approximately **5.8 ms of stale audio** — audible as a brief click or smear after every seek operation when any effect (EQ, bass boost, reverb, echo) is enabled. With effects off, the code path is not reached.

**Fix:**
```rust
fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
    let result = self.input.try_seek(pos);
    if result.is_ok() {
        // Discard stale pre-seek samples so the next iterator call
        // reads fresh samples from the seeked position.
        self.batch_buf.clear();
        self.batch_pos = 0;
    }
    result
}
```

---

### A-002 🟡 — Incremental scan writes each track in its own transaction

**File:** `src-tauri/src/commands/library_scan.rs` — `scan_folder_incremental`

**Problem:**  
The full scan path (`scan_folder`) calls `db.add_folder_with_tracks(...)` which persists all tracks in a **single transaction**. The incremental scan path iterates tracks and calls `db.add_track_with_mtime(track)` (or `db.add_track(track)`) individually — one `INSERT OR REPLACE` per file with its own implicit transaction and fsync. For libraries with thousands of changed files (e.g. first run after a large rip session), this is orders of magnitude slower than the batched path and hammers the disk.

**Fix:** Wrap the incremental track upserts in a single `conn.transaction()` block, mirroring the batch approach already used in `add_tracks_to_playlist_batch`.

---

### A-003 🟡 — `between` operator silently substitutes `0` for malformed values

**File:** `src-tauri/src/smart_playlists.rs`

**Problem:**  
The `between` operator in the smart-playlist engine parses numeric rule values with `.parse::<f64>().unwrap_or(0.0)`. If a rule's stored value cannot be parsed (e.g. the JSON was hand-edited or a migration introduced a type mismatch), the comparison silently uses `0` as the boundary. The query runs without error, returning wrong results with no user feedback. Example: a `rating between [null, 5]` rule would silently become `rating BETWEEN 0 AND 5`, matching all unrated tracks.

**Fix:** Return an `Err(AppError::Validation(...))` when either `between` bound fails to parse, so the frontend can surface it as a rule validation error.

---

### A-004 🟡 — LIKE wildcards not escaped in library search

**File:** `src-tauri/src/query_builder.rs` — `apply_track_filter`

**Problem:**  
When a `search_query` is present, the code builds a pattern `format!("%{}%", query)` and passes it to three LIKE clauses (`title LIKE ?`, `artist LIKE ?`, `album LIKE ?`). SQLite LIKE metacharacters (`%`, `_`) inside the user's query string are not escaped. A search for `"50%"` produces LIKE `%50%%` which matches any title containing "50" followed by anything — effectively the same as searching "50". A search for `"my_music"` matches `"myXmusic"`, `"my music"`, etc.

This is a UI correctness issue, not a security issue (the value is properly parameterised, not interpolated into SQL).

**Fix:** Escape `\`, `%`, and `_` in the query string before wrapping with `%…%`, then add `ESCAPE '\\'` to all three LIKE clauses — matching the pattern already used by the folder-path filter in the same file.

---

### A-005 🟡 — `update_track_path` skips path validation

**File:** `src-tauri/src/commands/library_tracks.rs`

**Problem:**  
Every other command that accepts a file path (`load_track`, `show_in_folder`, `write_text_file`, `scan_folder`) calls `crate::validation::validate_path()` before acting. `update_track_path` writes the new path directly to the DB without any check. A caller can store a path containing `..` components, a non-existent file, or a path pointing outside any scanned folder. When the user next tries to play that track, the load will fail with a cryptic backend error rather than a clear validation message.

**Fix:** Add `crate::validation::validate_path(&new_path)?;` before the DB write, consistent with the rest of the command layer.

---

### A-006 🟡 — `loadPlaylists` fires twice on mount

**File:** `src/hooks/usePlaylists.ts`

**Problem:**  
`usePlaylists.loadPlaylists` is a `useCallback` with `[hasRestoredPlaylist, lastPlaylistId]` in its dependency array. On mount:

1. `useEffect([loadPlaylists])` fires → `getAllPlaylists` IPC call #1.
2. Inside `loadPlaylists`, `setHasRestoredPlaylist(true)` is called.
3. `hasRestoredPlaylist` changes → `loadPlaylists` callback is re-created.
4. `useEffect([loadPlaylists])` fires again → `getAllPlaylists` IPC call #2.

This doubles the initial playlist load IPC round-trip. The second call is redundant but harmless — however it causes the playlist list to flash (clear then refill) if the first load took any time.

**Fix:** Move `hasRestoredPlaylist` out of the `useCallback` dependency array by using a `useRef` instead of `useState` to track the restore-guard, so the callback identity is stable after mount.

---

### A-007 🟡 — Consumed queue items are never removed from the array

**File:** `src/store/slices/playerSlice.ts` — `nextInQueue`, `peekNextInQueue`

**Problem:**  
When the playback engine consumes a queue item, `nextInQueue()` increments `queueIndex` past the consumed slot but leaves the item in the `queue` array. `peekNextInQueue()` reads `queue[queueIndex]`, which correctly returns `undefined` once all items are consumed — but `queue.length` is still non-zero.

In `usePlayer._getNextTrackIndex`, the queue branch is guarded by `store.queue.length > 0`. After all items are consumed and `queueIndex >= queue.length`, this check still passes, the branch is entered, `peekNextInQueue()` returns `undefined`, and the code falls through to normal playback — working correctly but doing unnecessary work every `_getNextTrackIndex` call for the lifetime of the session.

More importantly, the **UI queue panel** shows consumed items as "in queue" because the array still contains them. Users see items listed that have already been played and will never play again.

**Fix:** In `nextInQueue`, splice out the consumed item (index 0 if you treat queue as a dequeue, or use `queue.slice(1)` with `queueIndex` reset to 0 for a cleaner FIFO model). Update `peekNextInQueue` accordingly. The `queueHistory` mechanism already tracks what was played, so removal is safe.

---

### A-008 🟡 — Crossfade timer is throttle-sensitive

**File:** `src/hooks/useCrossfade.ts`

**Problem:**  
`startCrossfade` animates the volume fade using `window.setInterval(fadeCallback, 50)`. In Tauri's WebView2 host, JavaScript timers can be deprioritized when the main thread is busy (e.g. a large virtual list render, or IPC response processing). If the interval fires late, `elapsed` jumps ahead, the midpoint fires early, and the fade-out → fade-in curve is uneven — the crossfade sounds like a sudden cut rather than a smooth blend.

The `fadeStartTimeRef` correctly uses `Date.now()` for elapsed calculation, which means **timing accuracy** is fine — but **volume update frequency** degrades. A 50ms interval firing every 80ms gives 37 volume steps over a 3-second fade instead of 60, perceptibly coarser.

**Fix:** Use `requestAnimationFrame` instead of `setInterval`. WebView2 synchronises rAF with the display refresh and does not throttle it under normal load. The callback should still use `Date.now()` for elapsed time, just trigger more reliably. Add cleanup via `cancelAnimationFrame` in `cancelCrossfade`.

---

### A-009 🟢 — Five dead private `_fn` helpers in `commands/audio.rs`

**File:** `src-tauri/src/commands/audio.rs`

**Problem:**  
Legacy audio health commands were removed from the Tauri command registration table but their implementations were kept as private functions suffixed `_fn` (e.g. `check_audio_health_fn`). These functions are never called by any registered command, never referenced in tests, and never exported. They are dead code that will confuse future maintainers.

**Fix:** Delete all five `_fn` helper functions. If the diagnostic logic inside them is valuable, extract the relevant parts into the active `get_audio_status` command or a shared utility.

---

### A-010 🟢 — Dead `tracks.album_art` column never cleaned up

**File:** `src-tauri/src/database_schema.rs` — migration v7

**Problem:**  
Migration v7 moved album art storage from an inline `album_art BLOB` column in the `tracks` table to a separate `track_album_art` table, then nullified every existing row with `UPDATE tracks SET album_art = NULL`. SQLite prior to 3.35 cannot `DROP COLUMN`, so the column was intentionally left in place. The migration comment acknowledges this.

As of SQLite 3.35 (released March 2021), `ALTER TABLE … DROP COLUMN` is available. The minimum SQLite version bundled with recent Tauri targets supports this. The column occupies one NULL cell per row in every page, adding page fragmentation. After a `VACUUM` the overhead shrinks but the schema stays cluttered.

**Fix (non-urgent):** Add a schema version v9 migration that runs `ALTER TABLE tracks DROP COLUMN album_art` when the SQLite version is ≥ 3.35 (guard with a version check). Increment `SCHEMA_VERSION` to 9.

---

### A-011 🟢 — `memory_usage` in `get_performance_stats` is fabricated

**File:** `src-tauri/src/commands/cache.rs` — `get_performance_stats`

**Problem:**  
The `performance.memory_usage_bytes` field returned by this command is computed as `track_count as usize * 1024`. This is not actual process memory — it is a made-up estimate. The `get_performance_stats` endpoint is surfaced in the UI's stats panel; displaying this as "Memory usage: X MB" misleads users diagnosing performance issues.

**Fix:** Either remove the memory field entirely and omit it from the JSON response, or use `std::alloc`-based tracking / a platform query (e.g. `GetProcessMemoryInfo` on Windows via `winapi`) to return real RSS. The fake estimate is worse than nothing.

---

### A-012 🟢 — `FolderWatcher.tx` is stored but never used

**File:** `src-tauri/src/watcher.rs`

**Problem:**  
`FolderWatcher.start_watching` stores `self.tx = Some(tx)` after cloning the sender into the watcher closure. Neither `add_path` nor `remove_path` nor any other method uses `self.tx`. It is a dead field that exists without purpose.

**Fix:** Remove `tx: Option<Sender<…>>` from the struct and the associated `self.tx = Some(tx)` assignment.

---

### A-013 🟢 — `WalkDir::follow_links(true)` without root boundary check

**File:** `src-tauri/src/scanner.rs` — `scan_directory` / `scan_directory_incremental`

**Problem:**  
Both scan functions use `WalkDir::new(root).follow_links(true)`. WalkDir's cycle detection prevents infinite loops, but it does **not** prevent traversing into directories outside the root. If a user's music folder contains a symlink pointing to, say, `C:\Windows\System32\`, the scanner will walk into it and attempt to decode any files with matching extensions. This is unlikely to cause data loss but can cause unexpected tracks from arbitrary locations to appear in the library.

**Fix:** After resolving each entry's path, verify it `starts_with(&root_canonical)` (where `root_canonical = root.canonicalize()`). Skip any entry that resolves outside the scanned root.

---

### A-014 🟢 — Drag-image cleanup has no error guard

**File:** `src/windows/LibraryWindow.tsx` — `VirtualTrackRow.onDragStart`

**Problem:**  
A temporary `<div>` is appended to `document.body` as a drag image, then removed inside a `setTimeout(..., 0)`. If the component tree is torn down (e.g. a rapid window close during drag initiation) before the timeout fires, `document.body.removeChild(dragImg)` may throw `NotFoundError` because the element was cleaned up as part of unmount. The error is uncaught and leaks to the console.

**Fix:** Wrap the `removeChild` call in `try { document.body.removeChild(dragImg); } catch {}`, or track the element in a ref and clean it up in an `useEffect` return.

---

### A-015 🟢 — Three pre-existing unimplemented stubs

**Tracked in `docs/readmeforai.md` Known Bugs #1, #2, #3**

These are known gaps, included here for audit completeness:

| # | Description |
|---|-------------|
| 1 | **Mini-player** — `MiniPlayerWindow` exists but opens a blank panel; no playback controls are wired |
| 2 | **"Add to Playlist" in playlist context menu** — shown even when the track is already inside a playlist window; should be hidden in that context |
| 3 | **Minimize to tray** — setting is persisted but the tray-minimize behavior on the window close event is not hooked up |

---

### A-016 🟡 — Context menu edge correction undone by async `useEffect`

**File:** `src/components/ContextMenu.tsx` — `ContextMenu`

**Problem:**  
`ContextMenu` uses a `useLayoutEffect` (deps `[x, y, items]`) to measure the rendered menu and flip it away from the right/bottom viewport edge before the browser paints. This is correct. However, there is also a `useEffect` (deps `[x, y]`) that unconditionally resets `position` back to the raw cursor coordinates `{ x, y }`:

```tsx
useEffect(() => {
  setPosition({ x, y });
}, [x, y]);
```

Because `useEffect` is asynchronous — it fires *after* the browser has painted — it runs after `useLayoutEffect` and overwrites the corrected position. The visible result is that every context menu opened near the right or bottom edge of the window first appears at the corrected position (for one frame), then snaps back to the clipped position. On slower machines the two-frame difference is clearly visible as a jump.

Additionally, the clamp logic did not apply a margin from the window edge (`Math.max(0, ...)` allows the menu to touch pixel 0) and did not protect against the adjusted position going off the left or top edge after a flip.

**Fix:**  
Remove the redundant `useEffect` entirely — `useLayoutEffect` already re-runs on every `x`/`y` change and handles initialisation. Tighten the clamp:

```tsx
useLayoutEffect(() => {
  if (menuRef.current) {
    const MARGIN = 4;
    const rect = menuRef.current.getBoundingClientRect();
    let newX = x;
    let newY = y;

    // Right edge → flip to left of cursor
    if (newX + rect.width + MARGIN > window.innerWidth) {
      newX = x - rect.width;
    }

    // Bottom edge → flip to above cursor
    if (newY + rect.height + MARGIN > window.innerHeight) {
      newY = y - rect.height;
    }

    // Clamp to viewport (prevents going off left/top edge after flipping)
    newX = Math.max(MARGIN, newX);
    newY = Math.max(MARGIN, newY);

    setPosition({ x: newX, y: newY });
  }
}, [x, y, items]);
```

---

## Implementation Priority

### Phase 1 — Fix now (affects correctness)
- **A-001** — Seek glitch with EQ on (one-line fix)
- **A-004** — Search wildcard escaping (user-visible, easy fix)
- **A-005** — `update_track_path` validation (one-line fix)
- **A-006** — Double `loadPlaylists` on mount (minor IPC waste + flash)

### Phase 2 — Fix soon (code health / edge cases)
- **A-002** — Batch the incremental scan writes
- **A-003** — Reject malformed `between` values
- **A-007** — Clear consumed queue items from the array
- **A-008** — Switch crossfade timer to `requestAnimationFrame`
- **A-016** — Remove async position reset overriding context menu edge correction

### Phase 3 — Cleanup (low risk, low urgency)
- **A-009** — Delete dead `_fn` helpers
- **A-010** — Drop `tracks.album_art` column (v9 migration)
- **A-011** — Remove fake memory stat
- **A-012** — Remove dead `FolderWatcher.tx` field
- **A-013** — Add symlink root-boundary guard in scanner
- **A-014** — Guard drag-image `removeChild`
- **A-015** — Implement mini-player / tray / context menu fixes

---

## What Was *Not* Found

The following areas were reviewed and found to be in good shape:

- **SQL injection** — `QueryBuilder` whitelists sort fields via `resolve_sort()`; all user values are parameterised. Smart playlists use `ALLOWED_FIELDS` + `ALLOWED_SORT_FIELDS` whitelists and `escape_like()`. No interpolation found.
- **Mutex poison resilience** — `lock_or_recover()` is used consistently across the audio engine. No raw `.unwrap()` on mutex locks in hot paths.
- **Device reinit logic** — `has_device_changed()` correctly handles both device-disappearance and Windows default-device-change scenarios.
- **Track-ended spurious events** — `looksLikePauseTransition` guard in `useAudio.ts` prevents false end-of-track advances during pause transitions.
- **Preload path validation** — `useTrackLoading` verifies `preloadedPath === track.path` before swapping to preload, preventing audio/UI mismatch on shuffle reorder.
- **Crypto-grade shuffle** — Fisher-Yates with `crypto.getRandomValues()` is correct.
- **Crossfade midpoint timing** — `fadeStartTimeRef` + `Date.now()` arithmetic means timing accuracy survives throttling even when update frequency degrades.
- **Batch playlist import** — uses `add_tracks_to_playlist_batch` (single transaction).
- **Scan validation** — `scan_folder` and `scan_folder_incremental` both call `validate_path()` on the folder argument before dispatching `spawn_blocking`.
- **`write_text_file` TOCTOU** — canonicalization + `starts_with` check present and correct.
- **ReplayGain** — applied after load success, before auto-play, with correct fallback order (track → album → off).
- **`setCurrentTrack` self-healing** — `getCurrentTrackData()` has a fast path (index + ID check) and a self-healing fallback (scan by ID, fix stale index) so stale indices don't produce wrong tracks.
- **Schema migrations** — v1–v8 are cumulative and idempotent; `SCHEMA_VERSION` check gates each migration.
- **`BroadcastWake` condvar** — adaptive sleep (100 ms playing / 30 s idle) correctly prevents the broadcast thread from burning CPU while idle.
