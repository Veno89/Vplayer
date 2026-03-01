# VPlayer Architecture & Correctness Audit

**Auditor**: Senior Desktop Application Architect  
**Date**: March 2026  
**Version Audited**: 0.9.22  
**Target**: Commercial-grade Windows desktop music player (A–A+ quality)

---

## Executive Summary

| Subsystem | Grade | Notes |
|-----------|-------|-------|
| **Architecture & Layering** | A− | Clean IPC boundary via TauriAPI; 20+ component-level bypasses found |
| **SOLID Compliance** | B+ | Good SRP in audio module decomposition; smart playlist OCP weak |
| **DRY Compliance** | B+ | Settings slice pattern excellent; error handling boilerplate in commands |
| **KISS Compliance** | A− | Provider composition could be simpler; overall good restraint |
| **IPC Design** | A− | 80+ commands well-structured; some chatty patterns; few missing batches |
| **Audio Engine** | A | Best-in-class for indie app; lock contention strategy solid; 2 unsafe blocks justified |
| **DSP Pipeline** | A− | Correct biquad math; configurable chain order; soft clipper guard |
| **Database & Performance** | B+ | Good indexes; missing transactions in some paths; no query plan analysis |
| **React / Zustand State** | A− | Granular selectors enforced; event-driven playback; minor re-render risks |
| **Testing** | C+ | ~110 TS tests, Rust unit tests present; large gaps in integration/audio |
| **Feature Completeness** | A− | All advertised features implemented; album gain mode placeholder |

**Overall Grade: B+ / A−** — Production-capable with a focused list of improvements below.

---

## 0. User-Reported Bugs (Root-Cause Analysis)

These are active bugs observed in v0.9.22 that were traced to specific code paths during this audit.

### Bug A: Pause Button Requires Double-Click / Icon Stays on Pause

**Symptom**: Click pause → icon stays as ⏸ instead of switching to ▶. Must click again to see the correct icon and actually pause.

**Root Cause**: Race between optimistic UI toggle and backend state sync.

1. `PlayerWindow.tsx` defines `togglePlay` as `setPlaying(p => !p)` — a pure optimistic Zustand toggle.
2. `usePlaybackEffects` watches `playing` and calls `audio.pause()` (async, takes time).
3. Meanwhile, `useAudio`'s `playback-tick` listener runs every 100ms and has a **sync-correction** block: if `store.playing !== backend.isPlaying`, it overwrites the store with the backend value.
4. After the optimistic toggle sets `playing=false`, a tick arrives **within the 500ms `isTogglingRef` suppression window** or **just after it expires** — but the backend hasn't finished `.pause()` yet (it's behind `withTimeout`). The tick's `isPlaying=true` overwrites the store back to `playing=true`.
5. Result: the icon flips to ▶ then immediately back to ⏸. User sees no change.

**Contributing Factor**: The `isTogglingRef` guard uses a fixed 500ms `setTimeout` to suppress sync corrections, but long fade-on-pause (e.g., `fadeDuration=1000ms`) means the backend is still playing during the entire suppression window and beyond. The pause only happens *after* the fade completes, which can exceed 500ms.

**Fix Direction**: Instead of a fixed timeout, keep `isTogglingRef=true` until the audio.play()/pause() promise settles. The fade-out case in `usePlaybackEffects` should only set `isTogglingRef=false` after the final `audio.pause()` resolves.

### Bug B: Visualizer Freezes on Pause Instead of Decaying

**Symptom**: Hit pause → visualizer bars freeze at their current height instead of smoothly dropping to zero.

**Root Cause**: Hard stop of both data fetching AND render loop on `!isPlaying`.

In `VisualizerWindow.tsx`:
- Lines 68–73: The data-fetch interval stops immediately when `isPlaying` becomes false (`if (!isPlaying) return;`).
- Lines 77–83: The `requestAnimationFrame` loop is cancelled immediately when `isPlaying` becomes false (`cancelAnimationFrame`).

Since both loops halt simultaneously, the last-fetched spectrum values remain painted on canvas. No decay animation runs.

**Fix Direction**: On pause, stop the data-fetch interval but keep the render loop running. In the render loop, when `!isPlaying`, decay `smoothedSpectrumRef.current` values toward zero each frame (e.g., multiply by 0.9). Stop the render loop only when all values are below a threshold (e.g., 0.001).

### Bug C: Progress Resets to 0 / Time Desyncs on Pause

**Symptom**: After pause, the progress bar sometimes jumps to 0:00.

**Root Cause**: `track-ended` event fires spuriously during state transitions.

The broadcast thread in `main.rs` detects track end as: `was_playing && !snap.is_playing && snap.is_finished`. However, between a pause command and the next broadcast cycle (~100ms), the Rodio sink can report both `!is_playing` (paused) and `is_finished` (empty buffer) briefly. This triggers `track-ended`, which calls `useStore.getState().setProgress(0)` in the event handler.

Additionally, the `setCurrentTrack` action in the store does `set({ currentTrack: track, progress: 0 })` — so if any track-change logic fires during a pause transition, progress resets.

**Fix Direction**: The broadcast thread should distinguish "paused" from "finished" more robustly. When the pause command sets a `paused` flag in `PlaybackState`, the broadcast thread should check `!snap.is_paused` before emitting `track-ended`.

### Bug D: Player Shows Wrong Song (Stale Track Display)

**Symptom**: The player window sometimes displays metadata for a track that isn't the one actually playing.

**Root Cause**: `currentTrack` is an integer index into `activePlaybackTracks`. When the tracks array is mutated (library refresh, re-sort, filter change, playlist edit), the array content shifts but the index doesn't update.

Example: User is playing track index 42 ("Song A"). Library refresh comes in and a new scan adds tracks, re-sorting the array. Index 42 now points to "Song B". The `currentTrack` index is never re-mapped.

`getCurrentTrackData()` in `playerSlice.ts` simply does `state.activePlaybackTracks[state.currentTrack]` — no ID-based verification.

**Fix Direction**: After any `setActivePlaybackTracks` call, find the currently-playing track by ID (stored in `lastTrackId` or similar) and update the index. Alternatively, store `currentTrackId` instead of an index, and derive the index when needed.

### Bug E: Shuffle Repeats Same Song Too Often (4k+ Library)

**Symptom**: With shuffle enabled on a 4k+ track playlist, the same song comes up noticeably more often than expected.

**Root Cause**: The shuffle is **random-pick, not true shuffle**. In `usePlayer.ts` lines 120–124:
```ts
let nextIdx: number;
do {
    nextIdx = Math.floor(Math.random() * effectiveTotalTracks);
} while (nextIdx === current && effectiveTotalTracks > 1);
```

This picks a random index each time, only avoiding the *immediately previous* track. With 4000 tracks and `Math.random()`, the Birthday Problem probability gives ~50% chance of a repeat within ~75 picks. Over a listening session of 100+ tracks, repeats are expected and noticeable.

The `shuffleQueue` in `playerSlice.ts` uses proper Fisher-Yates, but **that only shuffles the explicit queue** (tracks added via "Add to Queue"). Normal shuffle playback uses the random-pick path above.

**Fix Direction**: Maintain a shuffle history set. On each `getNextTrackIndex` with shuffle, exclude all tracks in the history. Only reset the history when it reaches ~80% of the library. Alternatively, pre-generate a Fisher-Yates permutation of the entire `activePlaybackTracks` and walk through it sequentially.

### Bug F: Update Download Shows Absurd Percentage (e.g., "65154169%")

**Symptom**: The update banner shows percentages like "65154169%" during download.

**Root Cause**: Incorrect progress calculation in `useUpdater.ts` lines 92–95:
```ts
case 'Progress': {
    const total = (event.data as any).contentLength ?? 1;
    const progress = event.data.chunkLength / total * 100;
    set({ downloadProgress: Math.round(progress) });
    break;
}
```

`contentLength` is the **total** file size (e.g., 65,154,169 bytes), but `chunkLength` is the size of **one chunk** (e.g., a few KB). The Tauri updater emits multiple `Progress` events, each with that chunk's size. The code calculates `chunkLength / total * 100` which gives a tiny fraction — except when `contentLength` is `null`/`undefined`, it falls back to `?? 1`, turning the calculation into `chunkLength / 1 * 100` = the raw chunk byte count × 100.

Even when `contentLength` is present, the progress is wrong: it shows only the *current chunk's* percentage, not the cumulative progress. It should accumulate `chunkLength` across all events.

**Fix Direction**: Accumulate downloaded bytes:
```ts
case 'Started':
    set({ downloadProgress: 0 });
    downloadedRef = 0;
    totalRef = (event.data as any).contentLength ?? 0;
    break;
case 'Progress':
    downloadedRef += event.data.chunkLength;
    if (totalRef > 0) {
        set({ downloadProgress: Math.round((downloadedRef / totalRef) * 100) });
    }
    break;
```

---

## 1. Architecture & Layering Audit

### Intended Architecture

```
React UI → Hooks → TauriAPI (IPC boundary) → Rust Commands → Services / Engine / Database
```

### Compliance

**IPC Boundary (TauriAPI.ts)**: Properly centralized. All 80+ IPC calls wrapped with consistent error handling, logging, and timeout support. No component calls `invoke()` directly. **Grade: A**

**Component-Level Bypasses**: 20+ files in `src/components/` and `src/windows/` call `TauriAPI.*` directly instead of going through custom hooks. While `TauriAPI` is the proper IPC abstraction (not raw `invoke()`), the project's own README says *"never call invoke() directly from components"* — conceptually, components calling `TauriAPI` directly bypasses the hooks layer for business logic coordination.

**Files with direct TauriAPI calls in components/windows**:
- `WaveformSeekbar.tsx` — `TauriAPI.getTrackWaveform()`
- `AlbumArt.tsx` — `TauriAPI.extractAndCacheAlbumArt()`
- `ContextMenu.tsx` — `TauriAPI.showInFolder()`
- `TrackInfoDialog.tsx` — `TauriAPI.updateTrackTags()`
- `EqualizerWindow.tsx` — `TauriAPI.setAudioEffects()`
- `HistoryWindow.tsx` — `TauriAPI.getRecentlyPlayed()`, `getMostPlayed()`
- `LibraryWindow.tsx` — `checkMissingFiles`, `removeDuplicateFolders`, `findDuplicates`, `removeTrack`
- `DiscographyWindow.tsx` — `TauriAPI.writeTextFile()`
- `LyricsWindow.tsx` — `TauriAPI.loadLyrics()`
- `PlaylistWindow.tsx` — `TauriAPI.setTrackRating()`
- `TagEditorWindow.tsx` — `TauriAPI.updateTrackTags()`
- `VisualizerWindow.tsx` — `TauriAPI.getVisualizerData()`
- `options/AudioTab.tsx` — multiple device/effects calls
- `options/LibraryTab.tsx` — `getAllFolders()`, `getAllTracks()`

**Severity**: Low–Medium. These are still going through the typed IPC service, not raw `invoke()`. The practical risk is that business logic coordination (error handling, cache invalidation, state updates) could diverge between different call sites. Most of these are simple data-fetch or fire-and-forget patterns where a hook wrapper would be pure boilerplate.

**Zustand slices doing IPC**: None. All slices are pure state management. **Grade: A**

**Rust command handlers**: Properly thin. Commands delegate to `Database`, `AudioPlayer`, `Scanner`, and `smart_playlists` module functions. No business logic leaks into command handlers except for `library.rs` which has tag-writing logic inline (using `lofty` directly in the command). This should be extracted to a service.

**Module coupling in Rust**: Low. The audio module has clean sub-module decomposition (`device.rs`, `playback_state.rs`, `preload.rs`, `volume_manager.rs`, `effects.rs`, `visualizer.rs`). Each has clear ownership. The `replaygain.rs` module takes `&Mutex<Connection>` directly which couples it to the DB implementation.

### Architectural Risks

| Risk | Severity | Location |
|------|----------|----------|
| Tag writing logic in command handler | Medium | `commands/library.rs` `update_track_tags` |
| `replaygain.rs` takes raw `Mutex<Connection>` | Low | `replaygain.rs:store_replaygain()` |
| Components calling TauriAPI directly (20+ sites) | Low | Listed above |

---

## 2. SOLID Violations

### Rust

**AudioPlayer (SRP)**: ✅ **Well-decomposed**. The `AudioPlayer` struct in `audio/mod.rs` is a thin coordinator delegating to:
- `PlaybackState` — position/timing
- `PreloadManager` — gapless preload
- `VolumeManager` — volume/ReplayGain/balance
- `DeviceState` — device lifecycle
- `EffectsProcessor` — DSP chain
- `VisualizerBuffer` — visualization data

This is strong SRP. The only concern is that `AudioPlayer` still has ~50 public methods, but they all delegate cleanly.

**effects.rs (SRP)**: ✅ Each DSP effect (`Equalizer`, `Reverb`, `Echo`, `BassBoost`, `SoftClipper`) is its own struct. `EffectsProcessor` orchestrates them. The chain order is configurable via `effect_order` field. Clean.

**database.rs (SRP violation)**: ⚠️ `database.rs` is a 900+ line god file containing schema creation, migrations, query methods for tracks, folders, playlists, failed tracks, ratings, paths, metadata updates, album art, duplicates, and folder tracks. This should be decomposed into:
- `schema.rs` — DDL & migrations
- `track_repository.rs` — track CRUD
- `playlist_repository.rs` — playlist CRUD
- `album_art_repository.rs` — art storage

**Smart Playlist Rule Engine (OCP)**: ⚠️ The `to_sql()` method uses a big `match` on operator strings. Adding a new operator requires modifying this match. A trait-based approach (`OperatorHandler`) would be more extensible, but given the operator set is stable (SQL comparison operators), this is acceptable pragmatically.

**validate_playlist_name**: The validation strips non-alphanumeric characters. Playlist names like "Café Vibes" or "日本の音楽" would be destroyed. This is overly restrictive for an internationalized app.

### TypeScript / React

**PlayerProvider (SRP)**: ✅ Well-decomposed into 3 focused providers (`AudioEngineProvider`, `EffectsProvider`, `PlaybackProvider`) composed via `PlayerProvider`. The `PlayerContextBridge` aggregates them for backward compatibility. Clean architecture.

**Settings auto-generation pattern**: ✅ Excellent DRY. `SETTINGS_DEFAULTS` is the single source of truth. Setters are auto-generated. Persistence is automatic. The `updateSetting(key, value)` generic setter is clean.

**Window self-sufficient pattern**: ✅ Each window reads its own state from Zustand. No prop drilling. The `windowRegistry.tsx` maps window IDs to components declaratively. Clean.

**musicBrainzSlice**: ✅ Isolated. Pure state management. No IPC calls. Handles its own cache expiration via `pruneExpiredDiscographyData`.

---

## 3. DRY Violations

### Good DRY Patterns
- **Settings slice**: Auto-generated setters from `SETTINGS_DEFAULTS`. Exemplary.
- **TRACK_SELECT_COLUMNS**: Single constant shared across all queries. Excellent.
- **`Track::from_row()`**: Centralized row mapping function used everywhere.
- **`lock_or_recover()`**: Consistent Mutex recovery across audio module.
- **`TauriAPIService._invoke()`**: Centralized IPC wrapper with error formatting.

### DRY Violations

| Violation | Locations | Risk |
|-----------|-----------|------|
| `.map_err(\|e\| e.to_string())` repeated 50+ times in commands | All `commands/*.rs` files | Low — boilerplate but no divergence risk |
| `state.db.conn.lock().unwrap()` in smart_playlist + cache commands (6 sites) bypasses `self.conn()` helper | `commands/smart_playlist.rs`, `commands/cache.rs` | **Medium** — bypasses poisoned-mutex recovery |
| `EffectId` type duplicated in `store/types.ts` and `services/TauriAPI.ts` | Two files | Low — can diverge if one is updated |
| `DEFAULT_EFFECT_ORDER` duplicated in same two files | Two files | Low |
| EQ effects config construction with hardcoded defaults in `useEqualizer.ts` | `useEqualizer.ts:syncWithBackend()` | Medium — default values for reverb/echo/bass are hardcoded separately from `EffectsConfig::default()` |
| `SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()` — timestamp generation repeated 5+ times | `database.rs`, `scanner.rs`, `commands/library.rs` | Low — extract a `now_millis()` helper |

### Safe Consolidation Strategy
1. Smart playlist commands should use `state.db.conn()` (the poison-safe wrapper) instead of raw `lock().unwrap()`. **Priority: High** — this is the only place where a panicked DB thread could crash the app.
2. Introduce a `now_millis()` utility function in Rust.
3. Move `EffectId` and `DEFAULT_EFFECT_ORDER` to a single canonical location in TypeScript.

---

## 4. KISS Violations

### Identified Over-Engineering
| Area | Assessment |
|------|------------|
| Provider composition (`AudioEngine + Effects + Playback + Bridge`) | Borderline. 4-level composition for what could be 2 providers. Justified by the team's documented need for cross-provider ref bridges. |
| Crossfade implementation | Uses `setInterval` + cosine easing for volume automation. Appropriate complexity for the feature. |
| Effect chain order configurability | Users can reorder EQ/reverb/echo/bass. Cool feature but UX benefit is minimal for 99% of users. |
| `BroadcastWake` condvar for idle optimization | Well-justified — reduces CPU from constant polling to near-zero when paused. |
| Settings auto-generation via SETTINGS_DEFAULTS | Excellent. **Good KISS** — avoids 50+ manual setters. |

### Areas Where Simpler Would Suffice
1. **`useEqualizer`** reconstructs the entire `AudioEffectsConfig` object (with hardcoded zeros for reverb/echo/bass) on every EQ change. It should only send the EQ band changes, with the backend merging into existing config.
2. **Lock-or-recover pattern**: Used in the audio module but NOT in `commands/smart_playlist.rs` and `commands/cache.rs` which use raw `.lock().unwrap()`. Inconsistency — not a KISS issue per se, but a consistency gap.

---

## 5. Dead Code & Dead Files

### Rust `#[allow(dead_code)]`

| File | Item | Verdict |
|------|------|---------|
| `audio/mod.rs` | `get_current_path()` | **Safe to delete** — unused, `current_path` accessible via `PlaybackState` |
| `audio/device.rs` | `SendOutputStream` struct itself | The `#[allow(dead_code)]` is on the inner field `.0` — the struct IS used. Keep. |
| `effects.rs` | `process_buffer()` | **Needs investigation** — only used in tests. Could be useful for batch processing. Keep as test utility. |
| `database.rs:445` | `get_play_count()` | **Safe to delete** — `play_count` is included in `Track` from all queries. |
| `database.rs:550` | `get_all_folders()` | **Used** — called from `commands/library.rs`. The `#[allow(dead_code)]` is incorrect; remove the annotation. |
| `replaygain.rs` | `ReplayGainData::get_adjustment()` | **Safe to delete** — volume adjustment is calculated in `VolumeManager` instead. |
| `lyrics.rs` | `Lrc::get_lyrics_around()` | **Possibly future feature** — returns current+next lyric. Keep. |

### Potentially Unused IPC Commands

All registered commands in `invoke_handler` have matching `TauriAPI.ts` wrappers. However:
- `is_audio_healthy` / `needs_audio_reinit` / `get_inactive_duration` — these are health-check commands. Verify if the frontend actually calls them outside of the initial health check in `useAudio`.
- `get_position` / `get_duration` / `is_playing` / `is_finished` — these were used by the old polling model. With the event-driven `playback-tick` model, they may be called only during initialization. The commands should be retained for recovery scenarios.

### Commented-Out Code
No commented-out code blocks found. Clean.

---

## 6. IPC Audit (Critical Section)

### Command Count: 80 registered commands

### Return Type Consistency

| Pattern | Count | Assessment |
|---------|-------|------------|
| `Result<T, String>` | ~70 | Standard Tauri pattern ✅ |
| `Result<T, AppError>` (via `Into<String>`) | ~10 | `AppError` implements Serialize ✅ |
| Bare value (no Result) | ~8 | `get_balance`, `is_playing`, `is_finished`, `clear_preload`, `has_preloaded`, `clear_replaygain` — these never fail |

### Panic Risk Assessment

**Critical Finding**: Smart playlist commands and cache/performance commands use `state.db.conn.lock().unwrap()` instead of the poison-safe `state.db.conn()` method. If ANY thread panics while holding the DB lock, ALL subsequent calls to these 8 commands will panic, crashing the Tauri command handler.

**Affected commands**:
- `create_smart_playlist`
- `get_all_smart_playlists`
- `get_smart_playlist`
- `update_smart_playlist`
- `delete_smart_playlist`
- `execute_smart_playlist`
- `get_performance_stats`
- `vacuum_database`

**Similarly**: `replaygain.rs` functions (`store_replaygain`, `get_replaygain`) use `conn.lock().unwrap()` on the raw Mutex.

**Recommendation**: All these should use `state.db.conn()` which calls `unwrap_or_else(PoisonError::into_inner)`.

### Missing Batch Operations

| Current Chatty Pattern | Suggested Batch |
|------------------------|-----------------|
| `get_album_art` called per-track as user scrolls | `get_album_art_batch(track_ids: Vec<String>)` |
| `set_track_rating` called per-track | Acceptable — always single-track |
| `analyze_replaygain` called per-track | `analyze_replaygain_batch(paths: Vec<String>)` already needed for "analyze all" UX |

### Missing Validation

| Command | Issue |
|---------|-------|
| `seek_to` | No validation that `position >= 0` or `position <= duration` |
| `set_audio_device` | No validation that `device_name` is non-empty |
| `load_track` in `preload_track` | `preload_track` does NOT validate path via `validation::validate_path()` unlike `load_track` |
| `scan_folder` | Path is not validated via `validation::validate_path()` — relies on OS-level errors |

### IPC Data Size Risks

`get_all_tracks` returns the entire track database in one IPC call. For libraries with 50k+ tracks, this serializes/deserializes a large JSON array (~50MB+). The `get_filtered_tracks` command exists as an alternative, but initial library load uses `get_all_tracks`. Consider pagination or streaming.

---

## 7. Audio Engine & DSP Audit

### Rodio Stream Lifecycle: **Grade: A**
- `DeviceState` properly owns `OutputStream` + `Mixer`
- `reinit_device()` is the single reinit path — all callers go through `reinit_and_reload()`
- Device generation counter prevents stale preloaded sinks from playing on dead mixers
- `BroadcastWake` condvar eliminates polling overhead during idle

### Device Switching Safety: **Grade: A**
- `has_device_changed()` polls the OS device list to detect disconnected devices
- `is_device_available()` checks for default output device
- Auto-recovery loop in the broadcast thread (`device_lost` flag) attempts reconnection every 1s
- Device-loss emits `device-lost` to frontend; recovery emits `device-recovered`
- `play()` handles stale sinks, long pauses, device changes with reinit+reload

### Gapless Preload: **Grade: A**
- `PreloadManager` with generation-based stale detection is correct
- Preloaded sink connects to the same mixer — zero-gap swap
- `swap_to_preloaded()` holds the sink lock across stop→replace→play atomically
- Frontend preloads 5s before track end (or crossfade window + 2s)

### Thread Safety: **Grade: A−**
- `lock_or_recover()` pattern for Mutex poisoning — excellent defense
- `VisualizerBuffer` uses lock-free atomic ring buffer — no contention with audio thread
- Balance uses `AtomicU32` for lock-free per-sample L/R attenuation
- `EffectsSource` uses `try_lock()` on the effects processor — if contention occurs, samples pass through unprocessed rather than blocking the audio thread. Correct priority ordering.

**Concern**: `BroadcastWake` uses `self.flag.lock().unwrap()` — this is the one place in the audio module that doesn't use `lock_or_recover()`. If the flag mutex is poisoned (extremely unlikely), the broadcast thread would panic. Low risk but inconsistent.

### Unsafe Code: **Justified**
1. `unsafe impl Send/Sync for SendOutputStream` — `OutputStream` is `!Send` but wrapped in `Mutex<DeviceState>`, so access is serialized. Documented and scoped. ✅
2. `unsafe impl Send/Sync for VisualizerBuffer` — all fields are atomics. Correct. ✅

### DSP Pipeline: **Grade: A−**
- Biquad IIR filters use standard Audio EQ Cookbook formulas (correct)
- Freeverb implementation with 8 comb filters + 4 allpass filters (standard)
- Effect chain order is configurable via `effect_order` field
- `SoftClipper::saturate()` uses tanh for analog-style limiting (correct)
- Optimization: `tanh()` only applied when `abs(sample) > 0.9` — good branch prediction

**Concern**: Echo buffer reallocation on delay change (`set_delay()`) creates a new `Vec` and zeroes it. During playback, this causes a brief silence artifact. Should crossfade between old and new delay buffers. Low priority.

### Float Safety
- `SoftClipper::saturate()` ensures output is bounded
- `VolumeManager::effective_volume()` clamps to `[0.0, 1.0]`
- `ReplayGain` multiplier clamped to `[0.1, 3.0]` — prevents extreme amplification
- EQ gains bounded to `[-12, +12]` dB in the frontend; Rust `BiquadFilter` trusts input

**Missing**: No NaN guard in the DSP pipeline. If a decoder emits NaN (corrupted file), it propagates through the entire effect chain unchecked. The `SoftClipper::saturate()` tanh will output NaN for NaN input. Should add `if sample.is_nan() { return 0.0; }` at pipeline entry.

### Memory
- FFT planner in `FftAnalyzer` reused across calls (no per-frame allocation)
- `VisualizerBuffer` is a fixed 4096-sample ring buffer (no growth)
- Reverb/echo buffers are statically sized based on sample rate
- No memory growth risk identified

---

## 8. Database & Performance Audit

### Index Coverage: **Grade: A−**
9 indexes covering: `genre`, `artist`, `album`, `rating`, `play_count`, `last_played`, `date_added`, `playlist_tracks(playlist_id)`, `playlist_tracks(track_id)`.

**Missing indexes**:
- `tracks(path)` — used by `get_track_by_path`, `update_track_path`, folder LIKE queries. This is a frequent query during scanning, tag updates, and file validation.
- `tracks(title, artist, album)` — composite index for duplicate detection. The current `find_duplicates()` query `GROUP BY title, artist, album HAVING COUNT(*) > 1` does a full table scan.

### Query Caching
The README mentions "5-minute TTL cache for `get_all_tracks`" but I found no caching implementation in `database.rs`. The `get_all_tracks()` method goes directly to SQLite every time. Either the cache was removed or never implemented.

### Missing Transactions

| Operation | Issue |
|-----------|-------|
| `remove_folder()` in `commands/library.rs` | Calls `remove_tracks_by_folder` then `remove_folder` as two separate operations. If the second fails, tracks are orphaned. Should be one transaction. |
| `scan_folder()` | Adds folder + tracks in separate calls. No transaction wrapping. |
| `delete_playlist()` | Deletes `playlist_tracks` then `playlists` — two separate queries, but both in the same `conn()` call. Should use explicit transaction. |

### N+1 Query Risks
- `find_duplicates()`: Phase 1 gets duplicate keys (1 query), Phase 2 queries each key group individually (N queries). For 100 duplicate groups, that's 101 queries. Could use `WHERE (title, artist, album) IN (...)` with a temporary table.
- `check_missing_files()`: Loads ALL track paths into memory, then checks each file on disk. For 50k tracks, this is 50k `Path::exists()` calls. Acceptable since it's user-initiated, but worth noting.

### Migration Idempotency: **Grade: A**
- `ALTER TABLE ADD COLUMN` failures for "duplicate column" are caught and handled
- Tables use `CREATE TABLE IF NOT EXISTS`
- Indexes use `CREATE INDEX IF NOT EXISTS`
- Schema version tracking via `schema_version` table
- Migration v7 (album art to separate table) uses `INSERT OR IGNORE`

### Vacuum
`VACUUM` is exposed as an IPC command. The performance stats page recommends it when DB > 10MB. Correct approach.

### WAL Mode
Enabled on startup: `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;`. Correct for a desktop app with concurrent reads.

---

## 9. React & Zustand State Integrity

### Granular Selector Compliance: **Grade: A**
The codebase consistently uses `useStore(s => s.field)` everywhere. No full-store destructuring found. The README explicitly documents this convention.

### Event-Driven Playback: **Grade: A**
`useAudio` listens for `playback-tick`, `track-ended`, `device-lost`, `device-recovered` events from the Rust broadcast thread. This replaces the old polling model. Position/duration are written directly to Zustand. This is the correct architecture — events from the source of truth (Rust audio engine) drive UI state.

### Derived vs Stored State
- `activePlaybackTracks` stores the current playback track list in Zustand. This duplicates tracks already in the library but represents "what is currently playing" — justified.
- `loadingTrackIndex` is transient state properly reset on load completion.
- `currentTrack` is an index into `activePlaybackTracks` — correct.
- No derived state is stored where it should be computed.

### Queue State Correctness
- `addToQueue` supports 'end', 'next', 'start' positions
- `shuffleQueue` uses Fisher-Yates (correct)
- `nextInQueue` pops from queue and pushes to `queueHistory` (for back navigation)
- `previousInQueue` pops from history and goes back one index

**Edge case**: If `rememberQueue` is disabled, queue is stripped from persistence but `queueHistory` is also stripped — correct.

### A-B Repeat
- `setPointA`, `setPointB`, `toggleABRepeat`, `clearABRepeat` are clean
- `setPointB` auto-enables A-B repeat when both points are set
- `toggleABRepeat` won't enable if either point is null — correct

### Persisted State Hydration
- `merge` function in `useStore` merges persisted state with fresh defaults
- New windows from layout templates are added to existing persisted windows — correct
- If `rememberWindowPositions` is disabled, windows reset to defaults
- Expired discography data is pruned on hydration
- Legacy localStorage key is removed on load

**Concern**: If a new settings key is added to `SETTINGS_DEFAULTS` but the user has an old persisted state, the merge will use the fresh default. This is correct behavior but undocumented.

### Memory Leak Risks
- All `useEffect` hooks in `useAudio` return cleanup functions for event listeners
- `seekTimeoutRef` in `usePlayer` is cleaned up on unmount
- Crossfade intervals are cleaned up on component unmount and on cancel
- No orphaned listeners detected

---

## 10. Missing Features / Broken Wiring

### Feature Verification vs README

| Advertised Feature | Status | Notes |
|-------------------|--------|-------|
| MP3, FLAC, OGG, WAV, AAC, Opus, M4A | ✅ Implemented | `AUDIO_EXTENSIONS` array in scanner |
| Gapless Playback | ✅ Implemented | Preload/swap pipeline verified |
| Crossfade | ✅ Implemented | Volume-based with cosine easing |
| ReplayGain (EBU R128) | ✅ Implemented | `ebur128` crate, −18 LUFS target |
| 10-band EQ | ✅ Implemented | Biquad IIR with presets |
| A-B Repeat | ✅ Implemented | In playerSlice |
| Stereo Balance | ✅ Implemented | Lock-free atomic per-sample |
| Audio Effects (Reverb, Echo, Bass) | ✅ Implemented | Configurable chain order |
| Waveform Seekbar | ✅ Implemented | Rust-computed waveform |
| Smart Playlists (AND/OR) | ✅ Implemented | `match_all` flag for AND/OR |
| Duplicate Detection | ✅ Implemented | Title+artist+album+duration matching |
| Missing File Detection | ✅ Implemented | Path existence check |
| Tag Editor | ✅ Implemented | `lofty` crate, writes back to file |
| Multi-Window Layout | ✅ Implemented | 15 windows, 8 layout presets |
| Theme Editor | ✅ Implemented | Custom theme save/load/delete |
| Visualizer (FFT) | ✅ Implemented | Spectrum, waveform, circular modes |
| Lyrics Display | ✅ Implemented | LRC parsing with synced display |
| System Tray | ✅ Implemented | Click to show/hide, menu with show/quit |
| Media Keys | ✅ Implemented | Play/Pause, Next, Previous, Stop, Volume Up/Down, Mute |
| Auto-Updater | ✅ Available | `tauri-plugin-updater` configured |
| Keyboard Shortcuts (customizable) | ✅ Implemented | ShortcutsWindow with customization |
| Album Gain mode | ⚠️ Placeholder | Only 'off' and 'track' modes. 'album' is in the type but has no implementation |
| File Relocation Flow | ⚠️ Partial | `update_track_path` exists in backend/TauriAPI but no UI wizard to batch-relocate |
| Drag & Drop folders | ✅ Mentioned | Stated in README, implemented via Tauri events |

---

## 11. Testing Integrity

### Test Distribution

| File | Tests | Coverage Area |
|------|-------|---------------|
| `services/__tests__/TauriAPI.test.ts` | 47 | IPC wrapper methods |
| `hooks/__tests__/useAudio.test.ts` | 24 | Audio hook |
| `store/__tests__/store.test.ts` | 22 | Zustand store slices |
| `hooks/__tests__/usePlaybackEffects.test.ts` | 12 | Playback side-effects |
| `components/PlaylistContent.test.tsx` | 2 | Playlist rendering |
| `components/LibraryContent.test.tsx` | 2 | Library rendering |
| `__tests__/VPlayer.test.tsx` | 1 | Smoke test |
| **TypeScript Total** | **~110** | |

**Rust tests** (in `#[cfg(test)]` blocks):
- `validation.rs` — 7 tests (playlist name, rating, volume validation)
- `effects.rs` — 4 tests (config default, soft clipper, reverb, processor chain)
- `lyrics.rs` — 2 tests (LRC parsing, lyric-at-time)
- `smart_playlists.rs` — 1+ tests (SQL generation)
- `audio/volume_manager.rs` — 4+ tests (volume, ReplayGain multiplier)

### High-Risk Untested Areas

| Area | Risk Level | Why It Matters |
|------|-----------|----------------|
| **Audio engine integration** | 🔴 Critical | No tests for `AudioPlayer::load()`, `play()`, `seek()`, `preload()`, `swap_to_preloaded()`, device reinit, recovery |
| **Database migrations** | 🔴 Critical | No tests that migration v1→v7 produces correct schema. No test for upgrade from v0. |
| **Smart playlist execution** | 🟡 High | SQL generation is tested but execution against a real DB is not. No test for `execute_smart_playlist` with actual tracks. |
| **Watcher event handling** | 🟡 High | No tests for file watcher — event batching, callback invocation, path filtering |
| **Scanner edge cases** | 🟡 High | No tests for corrupted files, permission-denied files, very long paths, symlink loops |
| **Crossfade timing** | 🟡 Medium | No tests for crossfade initiation timing, midpoint callback, volume restoration |
| **ReplayGain analysis** | 🟡 Medium | No tests for accuracy of LUFS measurement, edge cases (silence, clipping) |
| **IPC integration** | 🟡 Medium | TauriAPI.test.ts mocks `invoke()` — no actual Rust backend integration tests |
| **Concurrent access** | 🟡 Medium | No tests for concurrent load+play, concurrent seek, race conditions |

### Over-Tested Areas
- `TauriAPI.test.ts` has 47 tests but they all mock `invoke()` — they test that the TS wrapper calls invoke with the right args, not that the backend handles them correctly. Still valuable but gives false confidence.

### Recommendations
1. Add Rust integration tests with an in-memory SQLite database testing the full command→database path
2. Add migration tests: create a v0 database, run `Database::new()`, verify schema
3. Add audio engine unit tests that verify state transitions (load→play→pause→seek→stop)
4. Add smart playlist execution tests with test data

---

## 12. Critical Structural Risks

### Risk 1: Panic-Propagating unwrap() in Command Handlers
**Severity**: 🔴 Critical  
**Location**: `commands/smart_playlist.rs` (6 sites), `commands/cache.rs` (2 sites), `replaygain.rs` (2 sites)  
**Issue**: These use `state.db.conn.lock().unwrap()` instead of `state.db.conn()` which recovers from Mutex poisoning. If any DB operation panics (stack overflow, OOM), ALL subsequent calls to these commands will also panic.  
**Fix**: Replace `state.db.conn.lock().unwrap()` with `state.db.conn()` everywhere.

### Risk 2: No NaN Guard in DSP Pipeline
**Severity**: 🟡 Medium  
**Location**: `audio/effects.rs` → `EffectsSource::next()`  
**Issue**: If a decoder emits NaN (corrupted file), it propagates through EQ, reverb, echo, bass boost, and soft clipper. NaN audio samples cause silence on most sound cards but could cause undefined behavior in the DSP state (filter histories become NaN permanently until track change).  
**Fix**: Add `if sample.is_nan() { return 0.0; }` at the start of `EffectsProcessor::process()`.

### Risk 3: Lyrics Timestamp Sort Uses unwrap()
**Severity**: 🟡 Medium  
**Location**: `lyrics.rs:53` — `a.timestamp.partial_cmp(&b.timestamp).unwrap()`  
**Issue**: If any lyric timestamp is NaN (malformed LRC), `partial_cmp` returns `None`, and `unwrap()` panics in the `load_lyrics` command.  
**Fix**: Use `.unwrap_or(std::cmp::Ordering::Equal)`.

### Risk 4: preload_track Missing Path Validation
**Severity**: 🟡 Medium  
**Location**: `commands/audio.rs` — `preload_track`  
**Issue**: `load_track` validates the path via `validation::validate_path()`, but `preload_track` does not. A malicious or malformed path could be preloaded.  
**Fix**: Add `validation::validate_path(&path)` to `preload_track`.

---

## 13. Dead Code Deletion List

| Item | Location | Action |
|------|----------|--------|
| `get_play_count()` | `database.rs:445` | ✅ Safe to delete |
| `get_current_path()` | `audio/mod.rs:501` | ✅ Safe to delete |
| `ReplayGainData::get_adjustment()` | `replaygain.rs:30` | ✅ Safe to delete |
| `#[allow(dead_code)]` on `get_all_folders()` | `database.rs:550` | Remove annotation (method is used) |
| `process_buffer()` | `effects.rs:593` | Keep — used in tests |

---

## 14. Duplicate Logic Map

| Duplication | Files | Notes |
|-------------|-------|-------|
| `EffectId` + `DEFAULT_EFFECT_ORDER` types | `store/types.ts`, `services/TauriAPI.ts` | Consolidate to single source |
| Timestamp generation (`SystemTime::now()...as_millis()`) | `database.rs`, `scanner.rs`, `commands/library.rs` | Extract utility |
| Error mapping `.map_err(\|e\| e.to_string())` | All command files | Consider a macro `map_err_str!()` |
| Effects config default values | `effects.rs::Default`, `useEqualizer.ts::syncWithBackend()` | Frontend hardcodes zeros — should send partial config or read current |
| `conn.lock().unwrap()` pattern in smart_playlist/cache vs `self.conn()` | `commands/smart_playlist.rs`, `commands/cache.rs` vs `database.rs` | Use consistent `conn()` helper everywhere |

---

## 15. Refactor Priority Roadmap

### P0 — Safety & Active Bugs (Do First)
1. [x] **Replace all `conn.lock().unwrap()` with poison-safe `conn()`** in `commands/smart_playlist.rs`, `commands/cache.rs`, `replaygain.rs`
2. [x] **Add NaN guard** to `EffectsProcessor::process()` entry point
3. [x] **Fix `partial_cmp().unwrap()`** in `lyrics.rs` timestamp sort
4. [x] **Add path validation** to `preload_track` command
5. [x] **Fix pause/play toggle race** (Bug A) — keep `isTogglingRef=true` until play/pause promise settles; extend for fade duration
6. [x] **Fix update download progress** (Bug F) — accumulate `chunkLength` across `Progress` events instead of dividing each chunk by total
7. [x] **Fix progress reset on pause** (Bug C) — add `is_paused` flag to broadcast snapshot; don't emit `track-ended` while paused

### P1 — Correctness
8. [x] **Add missing transactions** for `remove_folder` (tracks + folder), `delete_playlist` (tracks + playlist), `scan_folder` (folder + tracks)
9. [x] **Add `tracks(path)` index** — used in scanning, tag editing, file validation queries
10. [x] **Add `tracks(title, artist, album)` composite index** — used in duplicate detection
11. [x] **Fix stale track display** (Bug D) — after `setActivePlaybackTracks`, re-resolve `currentTrack` index by track ID instead of trusting the old index
12. [x] **Fix shuffle bias** (Bug E) — replace random-pick with a pre-generated Fisher-Yates permutation or a history-aware avoid-repeats set

### P2 — Architecture Quality
13. [x] **Decompose `database.rs`** into focused repository modules (900+ lines → 4 files)
14. [x] **Extract tag-writing logic** from `commands/library.rs::update_track_tags()` into a `tag_service.rs`
15. [x] **Consolidate `EffectId`** type to single TypeScript source
16. [x] **Add visualizer decay on pause** (Bug B) — keep render loop running after pause, multiply spectrum values by 0.9 per frame until silent

### P3 — Testing
17. [x] **Add Rust integration tests** for smart playlist execution, migrations, scanner
18. [x] **Add audio engine state machine tests**
19. [x] **Add concurrent access tests** for database operations

### P4 — Enhancement
20. [x] **Add `get_album_art_batch`** IPC command for scroll performance
21. [x] **Investigate query cache** for `get_all_tracks` (claimed in README, not implemented)
22. [x] **Relax playlist name validation** to allow Unicode characters

---

## 16. Quick Wins

| # | Change | Impact | Effort |
|---|--------|--------|--------|
| 1 | Replace 8 `conn.lock().unwrap()` → `state.db.conn()` | Prevents crash cascade | 10 min |
| 2 | Add `if sample.is_nan() { return 0.0; }` in `EffectsProcessor::process()` | Prevents DSP corruption | 2 min |
| 3 | Fix `partial_cmp().unwrap()` in lyrics.rs | Prevents panic on malformed LRC | 2 min |
| 4 | Add `validate_path()` to `preload_track` | Closes validation gap | 5 min |
| 5 | Fix updater progress: accumulate `chunkLength` across events | Fixes "65154169%" display | 10 min |
| 6 | Fix `isTogglingRef` to await promise settlement | Fixes pause double-click | 15 min |
| 7 | Add `is_paused` to broadcast snapshot, guard `track-ended` | Fixes progress reset on pause | 15 min |
| 8 | Remove `#[allow(dead_code)]` from `get_all_folders()` | Code hygiene | 1 min |
| 9 | Delete `get_play_count()`, `get_current_path()`, `get_adjustment()` | Dead code cleanup | 5 min |
| 10 | Add `CREATE INDEX idx_tracks_path ON tracks(path)` | Query performance for path lookups | 2 min |

---

## 17. Long-Term Architectural Improvements

### 1. Database Layer Decomposition
Split `database.rs` (900+ lines) into focused repository modules: `schema.rs`, `track_repo.rs`, `playlist_repo.rs`, `art_repo.rs`. Each module gets its own methods and tests. The `Database` struct becomes a thin facade.

### 2. Typed Error Propagation End-to-End
Currently, commands convert `AppError → String` for Tauri IPC. Since `AppError` implements `Serialize`, consider returning `Result<T, AppError>` directly from commands. The frontend could then distinguish error types (Network vs Decode vs NotFound) and show appropriate UI.

### 3. IPC Streaming for Large Data
For `get_all_tracks` with 50k+ libraries, consider Tauri's event stream or chunked responses instead of a single JSON blob. This prevents UI freezing during serialization/deserialization.

### 4. DSP Pipeline Per-Block Processing
The current `EffectsSource` processes one sample at a time through the effect chain. For CPU cache friendliness, process each effect on the entire batch before moving to the next effect. This is a performance optimization, not a correctness issue.

### 5. Integration Test Infrastructure
Set up a Tauri test harness that spins up the backend with an in-memory SQLite database and exercises the full IPC path. This would catch the serialization/deserialization mismatches that unit tests miss.

### 6. Album ReplayGain
The type system has `'album'` mode but it's unimplemented. Album gain requires computing the average gain across all tracks in an album and applying it uniformly. The `ebur128` crate supports this — it's a matter of plumbing.

---

*End of audit.*
