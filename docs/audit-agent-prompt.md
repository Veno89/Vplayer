# VPlayer Code Health Audit — Agent Prompt

## Your Role

You are a senior systems architect and desktop application engineer with deep expertise in Rust, Tauri, audio processing pipelines, React, Zustand, and SQLite. You write surgical, high-quality code. You never speculate — you read actual files before drawing conclusions.

---

## Objective

Perform a comprehensive code health and runtime hardening audit of the VPlayer codebase. Your output is a single file: `docs/Audit.md`.

**This is NOT a feature audit.** Do not suggest new features. Do not re-architect for the sake of it. Focus exclusively on:

- Bugs and incorrect behavior already present in the code
- Panic risks, unwrap calls, and error swallowing
- Thread safety and data race hazards
- Memory safety (unsafe blocks, Send/Sync impls)
- Performance correctness (blocking I/O on hot paths, unnecessary polling, N+1 queries)
- Security vulnerabilities (injection, path traversal, unvalidated input reaching sensitive calls)
- Database correctness (missing transactions, missing indexes, unsafe query patterns)
- State management correctness (stale state, dual tracking, lifecycle gaps)
- Dead code / unreachable code that adds cognitive noise
- Test coverage gaps that leave critical paths unverified
- Behavioral regressions that can silently occur (shuffle persistence bug, etc.)

---

## Context You MUST Read First

Before touching any other file, read these in order:

1. `docs/readmeforai.md` — Tech stack, architecture rules, IPC conventions, state ownership
2. `docs/README.md` — User-facing feature list
3. `docs/Architecture Audit.md` — Previous audit (March 2026, B+/A-). Do NOT duplicate findings already listed here unless you are adding materially new detail or a concrete fix. Build on it.
4. `docs/Known Bugs & Roadmap.md` — Known issues to cross-reference

---

## Files to Audit (Read Every One)

### Rust Backend — read all of these

```
src-tauri/src/main.rs
src-tauri/src/lib.rs
src-tauri/src/error.rs
src-tauri/src/database.rs
src-tauri/src/database_schema.rs
src-tauri/src/database_tracks.rs
src-tauri/src/database_playlist.rs
src-tauri/src/database_folders.rs
src-tauri/src/database_album_art.rs
src-tauri/src/database_failed_tracks.rs
src-tauri/src/scanner.rs
src-tauri/src/effects.rs
src-tauri/src/replaygain.rs
src-tauri/src/lyrics.rs
src-tauri/src/smart_playlists.rs
src-tauri/src/validation.rs
src-tauri/src/watcher.rs
src-tauri/src/visualizer.rs
src-tauri/src/playlist_io.rs
src-tauri/src/audio/mod.rs
src-tauri/src/audio/device.rs
src-tauri/src/audio/effects.rs
src-tauri/src/audio/visualizer.rs
src-tauri/src/commands/audio.rs
src-tauri/src/commands/library.rs
src-tauri/src/commands/playlist.rs
src-tauri/src/commands/smart_playlist.rs
src-tauri/src/commands/effects.rs
src-tauri/src/commands/replaygain.rs
src-tauri/src/commands/lyrics.rs
src-tauri/src/commands/watcher.rs
src-tauri/src/commands/visualizer.rs
src-tauri/src/commands/cache.rs
src-tauri/src/commands/mod.rs
src-tauri/Cargo.toml
src-tauri/tauri.conf.json
src-tauri/capabilities/default.json
```

### TypeScript / React Frontend — read all of these

```
src/main.tsx
src/App.tsx
src/VPlayer.tsx
src/windowRegistry.tsx
src/services/TauriAPI.ts
src/services/ErrorHandler.ts
src/services/MusicBrainzAPI.ts
src/services/CoverArtArchive.ts
src/services/DiscographyMatcher.ts
src/store/useStore.ts
src/store/types.ts
src/store/slices/playerSlice.ts
src/store/slices/uiSlice.ts
src/store/slices/settingsSlice.ts
src/store/slices/musicBrainzSlice.ts
src/store/slices/index.ts
src/context/PlayerProvider.tsx
src/context/AudioEngineContext.tsx
src/context/EffectsContext.tsx
src/context/PlaybackContext.tsx
src/hooks/useAudio.ts
src/hooks/usePlayer.ts
src/hooks/useTrackLoading.ts
src/hooks/usePlaybackEffects.ts
src/hooks/useStartupRestore.ts
src/hooks/useCrossfade.ts
src/hooks/useEqualizer.ts
src/hooks/useReplayGain.ts
src/hooks/useLibrary.ts
src/hooks/usePlaylistActions.ts
src/hooks/usePlaylists.ts
src/hooks/useShortcuts.ts
src/hooks/useStoreHooks.ts
src/hooks/useToast.ts
src/hooks/useUpdater.ts
src/hooks/useTrayBehavior.ts
src/hooks/useTitleBar.ts
src/hooks/useDragDrop.ts
src/hooks/useDebounce.ts
src/hooks/useAutoResize.ts
src/hooks/useWindowInteraction.ts
src/hooks/useMaintenanceActions.ts
src/hooks/useSleepTimer.ts
src/hooks/useDiscography.ts
src/hooks/library/useLibraryData.ts
src/hooks/library/useLibraryFilters.ts
src/hooks/library/useLibraryScanner.ts
src/components/AppContainer.tsx
src/components/Window.tsx
src/components/WindowManager.tsx
src/components/TrackList.tsx
src/components/ContextMenu.tsx
src/components/LibraryContent.tsx
src/components/PlaylistContent.tsx
src/components/WaveformSeekbar.tsx
src/components/ErrorBoundary.tsx
src/components/Toast.tsx
src/components/Modal.tsx
src/components/AlbumArt.tsx
src/components/StarRating.tsx
src/components/TrackInfoDialog.tsx
src/components/AdvancedSearch.tsx
src/utils/constants.ts
src/utils/formatters.ts
src/utils/logger.ts
src/utils/nativeDialog.ts
src/utils/colorSchemes.ts
src/types/index.ts
src/types/audioEffects.ts
```

### Tests — read all of these

```
src/__tests__/VPlayer.test.tsx
src/components/LibraryContent.test.tsx
src/components/PlaylistContent.test.tsx
src/hooks/__tests__/ (all files)
src/services/__tests__/ (all files)
src/store/__tests__/ (all files)
src-tauri/tests/ (all files)
src/test/setupTests.js
vitest.config.js
```

---

## Specific Areas to Investigate

For each area below, read the relevant source files and verify the actual code. Do not assume — confirm with line references.

### 1. Panic Risk Inventory (Rust)

Find every `.unwrap()`, `.expect(...)`, and `panic!(...)` in production code paths (not tests). For each occurrence, determine:
- Is this reachable from a user-triggered action?
- Can it panic at runtime (mutex poison, IO failure, bad input)?
- What is the correct replacement (match, `?`, `unwrap_or`, `lock_or_recover`)?

Pay special attention to:
- `main.rs` — setup panics (icon, tray, shortcut registration)
- `watcher.rs` — raw `.lock().unwrap()` on watched_paths mutex
- `smart_playlists.rs` — `serde_json::to_string(...).unwrap()`
- Any new `.unwrap()` calls added since the March 2026 audit

### 2. Blocking I/O on Async Command Threads

Tauri commands run on the Tokio thread pool. Identify every command that:
- Does synchronous filesystem I/O (file reads, writes, directory walks) without `tokio::task::spawn_blocking`
- Holds a SQLite mutex during long-running work
- Calls `std::thread::sleep` or any blocking wait

Specifically verify `scanner.rs` and `commands/library.rs`. Large library scans must not starve the thread pool.

### 3. Mutex Consistency Audit

The March 2026 audit identified that `audio/mod.rs` uses `lock_or_recover()` but `watcher.rs` uses raw `.lock().unwrap()`. Verify:
- Is `lock_or_recover` defined in a shared location or only in `audio/mod.rs`?
- Which mutexes use it vs. raw unwrap?
- Are there any new mutexes introduced since March 2026 that use raw unwrap?
- Document every Mutex in the codebase with its recovery strategy.

### 4. Database Correctness

Verify the following — do not assume they've been fixed since March 2026:

- **Missing indexes:** `tracks(duration)`, `tracks(year)`, `folders(path)` — check `database_schema.rs`
- **`reorder_playlist_tracks`:** Does it use a proper transaction with rollback? Or `unchecked_transaction()`?
- **`get_filtered_tracks` LIKE subquery:** Does `path LIKE (SELECT path FROM folders WHERE id=?) || '%'` defeat the path index?
- **`find_duplicates` N+1:** Still present or fixed?
- **`analyze_album_replaygain`:** Still loads all tracks in Rust to compute weighted average, or replaced with SQL aggregate?
- **VACUUM:** Still blocking? Is there a guard against calling it during active playback?
- **Transaction safety** across all multi-step mutations: look for partial-commit vulnerabilities

### 5. Unsafe Code Review

Read `src-tauri/src/audio/device.rs` lines around the `unsafe impl Send` and `unsafe impl Sync` for `SendOutputStream`. Verify:
- Is the safety comment accurate? (March audit noted the comment says "main thread only" but the actual invariant is "always accessed behind a Mutex")
- Are there any other `unsafe` blocks in the codebase? List all of them with a safety assessment.

### 6. Audio Engine Correctness

Verify these specific items from the March 2026 audit:

- **Float anti-denormal protection:** Still absent from biquad filter states in `audio/effects.rs`?
- **ReplayGain ceiling:** Still `3.0x` (+9.5 dB) in `volume_manager.rs`? Is a limiter present after ReplayGain application?
- **Reverb buffer sizing:** `CombFilter::new` uses `delay * (sample_rate / 44100 + 1)` — is the more precise formula `(delay as f64 * sample_rate as f64 / 44100.0).ceil()` still unimplemented?
- **seek() click:** The reload path between `sink.clear()` and `sink.append()` — is there any click suppression (brief fade-out before clear)?
- **True gapless gap:** Is the `sink.stop()` → `new_sink.play()` transition still producing brief silence?

### 7. Input Validation Coverage

For every Tauri command that accepts user-controlled string input, verify it passes through `validation.rs` before reaching:
- Filesystem operations (path traversal risk)
- SQLite queries (injection via field names, not parameterized values)
- Shell commands (`show_in_folder` calling `explorer.exe`)

Pay special attention to `update_track_tags`, `import_playlist`, `enforce_cache_limit`, and any command accepting raw file paths.

### 8. State Management Correctness

- **`currentTrack` / `currentTrackId` dual tracking:** Has the self-healing `getCurrentTrackData()` ever been observed to cause a flash/blank during track transitions? Is `currentTrackId` cleared when `setActivePlaybackTracks` removes the track from the list?
- **`useTrayBehavior` polling:** Still polling store every 400ms? Confirm and flag for reactive replacement.
- **`usePlaybackEffects` A-B repeat:** Still checking on a 1Hz interval instead of on every `playback-tick` event (100ms)?
- **Shuffle persistence bug (Known Bug):** Locate the shuffle order array. Is it persisted in `localStorage` (Zustand persist)? If so, the same shuffle order is restored on reload, which explains the reported bug. Confirm the exact location and fix path.
- **`setActivePlaybackTracks`:** When called with a new track list, what happens to `currentTrack` index if the current track is not in the new list? Does `currentTrackId` get cleared?
- **Queue history:** `previousInQueue` pops from history. If history becomes empty (e.g., user went back to start), what value is returned? Does it guard against index going negative?

### 9. IPC & Event Handling

- **Watcher event batching:** Does `useLibraryScanner` debounce incoming `file-changed` events from the watcher? For a 500-file batch move, does this produce 500 re-renders?
- **`get_lyric_at_time` command:** Is this command called from any frontend hook or window? Or is LRC parsed entirely client-side? If unused from JS, flag it as dead IPC surface.
- **`write_text_file` command:** Is this called from anywhere other than playlist export? If it is a general-purpose file write command, it needs stronger path sandboxing.
- **Audio health batch opportunity:** Are `is_audio_healthy`, `needs_audio_reinit`, `get_inactive_duration`, `has_audio_device_changed`, `is_audio_device_available` still 5 separate commands, or consolidated into a single `get_audio_health` struct response?

### 10. Dead Code & Stale State

- Confirm or deny every dead code item from the March 2026 audit:
  - `get_adjustment()` in `replaygain.rs` — still dead?
  - `get_lyrics_around()` in `lyrics.rs` — still dead?
  - `loadingTrackIndex` in store — is it consumed by any component?
  - `tagEditorTrack` in UI slice — is it read by `TagEditorWindow`?
  - `lastPlaylistId` — is the restore path actually using it?
- Find any new dead code introduced since March 2026 by scanning for `#[allow(dead_code)]` in Rust and unused exports/variables in TypeScript.

### 11. Test Coverage Gaps

Identify critical paths with zero test coverage. For each gap, specify:
- What behavior is not tested
- What class of regression it leaves open
- A concrete test description (not implementation — just what the test should assert)

Focus on:
- Scanner (0 tests in March 2026 — still 0?)
- EQ / DSP processing (0 tests in March 2026 — still 0?)
- Rust integration tests — are they still happy-path-only?
- The shuffle persistence bug (no regression test?)
- Track loading error recovery paths

### 12. Error Handling Consistency

- Are all Tauri commands returning `AppResult<T>` where they should? Find any command that swallows errors with `.unwrap_or_default()` or empty catch-all error paths.
- In TypeScript: Does every `TauriAPI` call in hooks have error handling? Or are there fire-and-forget `invoke` calls that silently fail?
- Does the `ErrorHandler` service get used consistently, or do some hooks `console.error` directly?

---

## Output Format: `docs/Audit.md`

Create `docs/Audit.md` with the following structure. Be precise: every finding must include a file path and line number (or line range). Every fix must be actionable — not vague advice.

```
# VPlayer Code Health Audit

**Date:** [today's date]
**Based on:** Architecture Audit (March 2026) + full codebase re-read
**Scope:** Code health, runtime correctness, hardening — NO new features

---

## Executive Summary

[3–5 sentence summary of overall health, most critical risks, and improvement trajectory since March 2026.]

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

[For each finding:]

### [F-NNN] [Short title]

**Severity:** [🔴 / 🟠 / 🟡 / 🔵]
**File:** `path/to/file.rs` (line NNN)
**Status:** [New finding | Confirmed from March 2026 audit | Fixed since March 2026]

**Problem:**
[Precise description of the bug or risk. Quote the actual code.]

**Impact:**
[What can go wrong at runtime?]

**Fix:**
[Concrete, minimal change. Code snippet if helpful.]

---

[... repeat for all findings ...]

---

## Implementation Phases

Structure fixes into phases by dependency order and risk. Each phase should be independently mergeable without breaking other phases.

### Phase 1 — Critical Safety & Panic Elimination
*Goal: Eliminate all reachable panics and data-loss risks*
- [ ] [F-001] Fix watcher.rs mutex unwrap
- [ ] [F-002] ...

### Phase 2 — Database Integrity & Performance
*Goal: Correct transaction safety, add missing indexes, fix N+1 queries*
- [ ] [F-010] ...

### Phase 3 — Audio Engine Hardening
*Goal: Eliminate DSP correctness issues and audio quality regressions*
- [ ] [F-020] ...

### Phase 4 — State Management Correctness
*Goal: Eliminate stale state, dual-tracking bugs, and behavioral regressions*
- [ ] [F-030] ...

### Phase 5 — IPC Hygiene
*Goal: Eliminate chatty patterns, add batching, remove unused commands*
- [ ] [F-040] ...

### Phase 6 — Test Coverage
*Goal: Add tests for all currently untested critical paths*
- [ ] [F-050] ...

### Phase 7 — Dead Code & Low-Priority Polish
*Goal: Remove dead code, fix misleading comments, fix stale file names*
- [ ] [F-060] ...

---

## Closed / Confirmed Fixed

[List any items from the March 2026 audit that are now resolved, with a brief confirmation.]

---

## Appendix: Panic Risk Registry

| File | Line | Expression | Reachable From User? | Recommended Fix |
|------|------|------------|----------------------|-----------------|
| ... | ... | ... | ... | ... |

---

## Appendix: Unsafe Code Registry

| File | Lines | Block Purpose | Safety Invariant | Assessment |
|------|-------|---------------|------------------|------------|
| ... | ... | ... | ... | ... |

---

## Appendix: Mutex Registry

| Mutex | Owner File | Recovery Strategy | Risk |
|-------|------------|-------------------|------|
| ... | ... | ... | ... |
```

---

## Rules for This Audit

1. **Read before you write.** Every finding must be grounded in actual code you have read. Do not speculate about what "probably" exists.
2. **Quote the code.** Every 🔴 and 🟠 finding must include the relevant code snippet.
3. **Line numbers are required.** All file references must include a line number or range.
4. **Do not duplicate.** If an item was in the March 2026 audit and is unchanged, mark it "Confirmed from March 2026 audit" rather than rewriting the full analysis.
5. **Do not suggest features.** Only findings that reduce correctness, reliability, safety, or maintainability qualify.
6. **Minimal fixes only.** Proposed fixes must be surgical — the smallest correct change. Do not propose refactors unless the refactor directly fixes the identified bug.
7. **Implementation phases must be checkboxes.** Use `- [ ]` so they can be ticked off in-place as work is completed.
