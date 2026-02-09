# VPlayer — Deep Codebase Analysis

> **Date:** 2026-02-09  
> **Scope:** Full-stack audit — Rust backend, React frontend, state management, hooks, services, tests, configuration  
> **Verdict:** The architecture is **well-designed** with clear layer separation and sound patterns. There are no fundamental rewrites needed. However, there are **security vulnerabilities, correctness bugs, and performance issues** that should be addressed. This document catalogs every finding and provides a phased remediation plan.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What's Already Good](#2-whats-already-good)
3. [Critical Issues (Fix Immediately)](#3-critical-issues)
4. [High-Priority Issues](#4-high-priority-issues)
5. [Medium-Priority Issues](#5-medium-priority-issues)
6. [Low-Priority / Polish](#6-low-priority)
7. [Dead Code Inventory](#7-dead-code-inventory)
8. [Test Coverage Gaps](#8-test-coverage-gaps)
9. [Phased Remediation Plan](#9-phased-remediation-plan)

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Rust backend | ~3,500 lines across 32 files, 84 Tauri commands |
| React frontend | ~60 components/hooks/services |
| TypeScript adoption | ~95% (configs and 3 test files remain JS) |
| Test coverage | 7 test suites, ~120 tests — **strong in hooks/services, weak in components/windows** |
| Architecture | Zustand (sliced + persisted) + React Context (actions) + Tauri IPC — **sound** |
| Security issues | 2 critical, 2 medium |
| Correctness bugs | 3 confirmed |
| Performance concerns | 4 significant |

**Bottom line:** The codebase is above-average for a project of this scope. The architecture decisions (Zustand slices, thin PlayerContext, TauriAPI abstraction, sub-struct AudioPlayer) are correct and maintainable. The issues below are targeted fixes, not structural failures.

---

## 2. What's Already Good

These areas require **no changes** — they're well-implemented and should be preserved:

| Area | Why It's Good |
|------|---------------|
| **AudioPlayer sub-struct decomposition** (`audio/mod.rs`) | Per-concern Mutex granularity (PlaybackState, VolumeManager, DeviceState, etc.) reduces lock contention. Best-structured module in the backend. |
| **Effects DSP** (`effects.rs`) | Correct biquad filter implementations (Audio EQ Cookbook), proper Schroeder reverberator. Test coverage included. |
| **TauriAPI abstraction** (`TauriAPI.ts`) | All 55 IPC methods centralized. No direct `invoke()` calls in components. Clean error formatting. |
| **Zustand slice architecture** (`store/slices/`) | 4 clean slices, DRY settings pattern with auto-generated setters, proper `partialize` for persistence. |
| **Database migration system** (`database.rs`) | 6 versioned, idempotent migrations. Schema is well-normalized. |
| **DiscographyMatcher** (`DiscographyMatcher.ts`) | Excellent fuzzy matching with Levenshtein, artist extraction from collaboration strings. Comprehensive test coverage. |
| **Error boundary placement** | Double boundary per window (chrome + content) means one window crash doesn't take down the app. |
| **PlayerProvider design** | Thin orchestrator that composes hooks. Scalar state stays in Zustand; context only provides actions. Well-documented. |
| **CoverArtArchive deduplication** | `pendingRequests` Map prevents duplicate in-flight requests. Cache bounded at 500 with FIFO eviction. |
| **useAudio hook** | Comprehensive error recovery with retry/backoff. Excellent test coverage (21 tests). |

---

## 3. Critical Issues (Fix Immediately)

### 3.1 SQL Injection in Smart Playlists

**File:** `src-tauri/src/smart_playlists.rs` (lines 34–71)

`to_sql()` directly interpolates `rule.field` and `rule.value` into SQL strings:
```rust
format!("{} LIKE '%{}%'", rule.field, rule.value)
```

A user-crafted rule value like `'; DROP TABLE tracks; --` executes arbitrary SQL.

**Fix:** Use parameterized queries. Build the SQL with `?` placeholders and return `(sql_string, Vec<rusqlite::types::Value>)` from `to_sql()`.

---

### 3.2 Unrestricted File Write Command

**File:** `src-tauri/src/commands/library.rs` (lines 252–255)

`write_text_file` accepts any path from the frontend and writes arbitrary content. No path validation, no sandboxing.

**Fix:** Either remove this command or restrict writes to specific directories (e.g., the app data folder). Use `validation::validate_path()` at minimum.

---

### 3.3 React / @types/react Version Mismatch

**File:** `package.json`

Runtime is React **18.2.0** but type definitions are `@types/react@^19.2.9`. React 19 types include APIs (`useActionState`, updated `ReactNode`, etc.) that don't exist at runtime. This can cause phantom type errors and runtime crashes when using React-19-only APIs.

**Fix:** Either upgrade React to 19, or pin types to `@types/react@^18.2.0`.

---

### 3.4 Stale Queue Index in `nextInQueue`

**File:** `src/store/slices/playerSlice.ts` (line 127)

`nextInQueue` reads `state.queueIndex` after calling `set()` — but `set()` in Zustand does not immediately update `state`. The function returns the wrong next track.

**Fix:** Capture the new index in a local variable before the `set()` call, or read from the updated state.

---

## 4. High-Priority Issues

### 4.1 Seek Shortcuts Broken

**File:** `src/hooks/useShortcuts.ts` (line 144)

`audio.currentTime` doesn't exist on the `AudioService` interface. Forward/backward seek shortcuts silently fail.

**Fix:** Use the store's `progress` value: `useStore.getState().progress`.

---

### 4.2 MusicBrainz 503 Retry Has No Max Limit

**File:** `src/services/MusicBrainzAPI.ts` (lines 155–158)

Recursive retry on HTTP 503 has no depth limit — an persistent 503 causes an infinite loop.

**Fix:** Add a `maxRetries` parameter (default 3) and decrement on each retry.

---

### 4.3 CoverArtArchive Caches Network Failures

**File:** `src/services/CoverArtArchive.ts` (line 77)

Transient network errors return `{ found: false }`, which is then cached for 30 days. The user can never retry.

**Fix:** Only cache when the server explicitly returns 404. On network errors, don't cache.

---

### 4.4 Per-Sample Mutex Locking in Audio Pipeline

**File:** `src-tauri/src/audio/effects.rs` (lines 55–67)

`self.processor.try_lock()` and `self.visualizer_buffer.try_lock()` are called for **every audio sample** (~44,100/sec per channel). While `try_lock` is non-blocking, the overhead is significant on the hot path.

**Fix (incremental):**
1. Short-term: Lock once per `next()` batch call rather than per sample (buffer a small block of samples)
2. Long-term: Use `AtomicPtr` for config swapping and a lock-free ring buffer for the visualizer

---

### 4.5 SQLite Missing WAL Mode and Foreign Key Enforcement

**File:** `src-tauri/src/database.rs`

- No `PRAGMA journal_mode = WAL` — all reads serialize through the single `Mutex<Connection>`
- No `PRAGMA foreign_keys = ON` — FK constraints in the schema are never enforced

**Fix:** Add to `Database::new()` after connection creation:
```rust
conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;")?;
```

---

### 4.6 Scan Event Listeners Capture Stale Closures

**File:** `src/hooks/library/useLibraryScanner.ts` (line 73)

Tauri event listeners are registered with an empty `[]` dependency array, capturing the initial `refreshFolders` function. When folders change, the stale closure is called.

**Fix:** Use a ref to hold the latest `refreshFolders` and read it inside the listener.

---

### 4.7 PlayerProvider Context Value Not Memoized

**File:** `src/context/PlayerProvider.tsx` (line 152+)

The `value` object is recreated every render. Since it contains functions from hooks, every `PlayerProvider` re-render re-renders **all** `usePlayerContext()` consumers.

**Fix:** Wrap in `useMemo` with the stable hook references as dependencies. The design doc already says components should prefer `useStore` for scalar reads — but memoizing the context value is still necessary.

---

### 4.8 `TrackList` Forced Remount on Column Resize

**File:** `src/components/TrackList.tsx` (line 640)

```jsx
key={columnWidths ? JSON.stringify(columnWidths) : 'default'}
```

This forces react-window to fully remount the virtualized list on every column resize, destroying scroll position and causing visual flashing.

**Fix:** Remove the `key` prop. Pass column widths through `itemData` (which is already done) and use them in `TrackRow`.

---

### 4.9 Validation Functions Written But Never Called

**File:** `src-tauri/src/validation.rs`

`validate_playlist_name()` and `validate_rating()` exist but are `#[allow(dead_code)]`. The command handlers for `create_playlist`, `rename_playlist`, and `set_track_rating` skip validation entirely.

**Fix:** Wire validation into the corresponding command handlers. Remove `#[allow(dead_code)]`.

---

### 4.10 Play Count Increments on Track Array Identity Change

**File:** `src/hooks/usePlaybackEffects.ts` (line 67)

The play-count-increment effect depends on the `tracks` array. When the array identity changes (e.g., library refresh), the effect re-fires and re-increments the count for the already-playing track.

**Fix:** Track the last-incremented track ID in a ref and skip if it matches.

---

## 5. Medium-Priority Issues

### 5.1 No Code Splitting for Windows

**File:** `src/windowRegistry.tsx`

All 15 window components are statically imported. The full code for Equalizer, Visualizer, Tag Editor, Discography, etc. is in the initial bundle even if never opened.

**Fix:** Use `React.lazy()` per window component, add `<Suspense>` fallback in `WindowManager`.

---

### 5.2 `useDiscography.ts` Is a God Hook

**File:** `src/hooks/useDiscography.ts` — 530 lines

Contains search, resolve, stats, and matching logic all in one hook with massive code duplication across resolve functions.

**Fix:** Split into `useDiscographySearch`, `useDiscographyResolver`, `useDiscographyStats`.

---

### 5.3 Duplicate Restore-Track Logic

**Files:** `src/hooks/useStartupRestore.ts` + `src/hooks/useTrackLoading.ts` (line 59)

Both contain logic for restoring the last-played track at startup. This creates a race condition where both fire on mount.

**Fix:** Consolidate into `useStartupRestore` only.

---

### 5.4 `usePlaylistActions` Uses Browser Dialogs

**File:** `src/hooks/usePlaylistActions.ts` (line 138)

Uses `confirm()` and `alert()` (browser built-ins) instead of `nativeDialog.ts` wrappers. These render differently in Tauri's webview and look jarring.

**Fix:** Replace with `nativeConfirm()` and `nativeAlert()` from `src/utils/nativeDialog.ts`.

---

### 5.5 ReplayGain Only Analyzes One Channel

**File:** `src-tauri/src/replaygain.rs` (line 83)

Only channel 0 is analyzed. For stereo files, the right channel is ignored entirely, producing inaccurate loudness measurements.

**Fix:** Use `add_frames_planar_f32` with all channels, or interleave samples from all channels.

---

### 5.6 Position Save Fires ~10x Per Second

**File:** `src/hooks/usePlaybackEffects.ts` (line 43)

The position-save effect fires on every `progress` change (~10 updates/sec) when conditions are met, instead of once.

**Fix:** Debounce the save to fire at most once per second, or use a ref to track the last-saved timestamp.

---

### 5.7 BassBoost Biquad Filter Implementation Bug

**File:** `src-tauri/src/effects.rs` (lines 227–237)

The `BassBoost::process()` uses `z1 = input` — writing the **input** delay tap where the **output** delay tap should be. This produces incorrect biquad behavior for the low-shelf filter.

**Fix:** Correct the Direct Form I/II implementation to properly track both input and output delay lines.

---

### 5.8 Scanner Extension Mismatch with Watcher

**File:** `src-tauri/src/scanner.rs` (line 67) vs `src-tauri/src/watcher.rs` (line 29)

Scanner supports: `mp3, m4a, flac, wav, ogg, opus, aac`  
Watcher checks for: `wma` (not in scanner list)

**Fix:** Define a shared `SUPPORTED_EXTENSIONS` constant used by both modules.

---

### 5.9 `formatDuration` Doesn't Handle Hours

**File:** `src/utils/formatters.ts` (line 3)

A 3600-second track shows as "60:00" instead of "1:00:00".

**Fix:** Add hours handling: `${hours}:${mins.toString().padStart(2,'0')}:${secs}`.

---

### 5.10 `Mutex::lock().unwrap()` Used Pervasively in Database

**File:** `src-tauri/src/database.rs` — 30+ instances

A poisoned mutex (from a thread panic) will crash the entire app.

**Fix:** Create a helper method `fn conn(&self) -> Result<MutexGuard<Connection>, AppError>` that converts the poison error to `AppError::Database`.

---

### 5.11 Accessibility Gaps

Multiple components have accessibility issues:

| Component | Issue |
|-----------|-------|
| `Window.tsx` | Min/max/close buttons lack `aria-label` |
| `ContextMenu.tsx` | No `role="menu"` / `role="menuitem"`, no keyboard navigation |
| `Modal.tsx` | No focus trap, no `role="dialog"`, no `aria-modal` |
| `TrackInfoDialog.tsx` | No focus trap, no dialog role |
| `PlaylistDialogs.tsx` | No focus traps in any of 4 dialogs |
| `StarRating.tsx` | No `role="radiogroup"`, no AT state conveyance |

**Fix:** Add ARIA roles and focus management. Consider a shared `useFocusTrap` hook.

---

## 6. Low-Priority / Polish

| # | File | Issue |
|---|------|-------|
| 1 | `main.rs` L126–L155 | Broadcast thread has no graceful shutdown (orphaned on exit) |
| 2 | `main.rs` L157–L202 | Global shortcut registration is repetitive — refactor to a loop |
| 3 | `device.rs` L83–L86 | Config analysis is dead code — `open_default_stream()` ignores selected config |
| 4 | `Cargo.toml` | `image` crate listed but never used |
| 5 | `Cargo.toml` | `symphonia features = ["all"]` pulls unnecessary codecs |
| 6 | `Cargo.toml` | `tokio features = ["full"]` but barely used — slim to `["rt", "macros"]` |
| 7 | `Cargo.toml` | `anyhow` only used in `playlist_io.rs` — inconsistent with `AppError` elsewhere |
| 8 | `visualizer.rs` L18–L23 | `CircularSpectrum`/`Spectrogram` modes defined but never processed |
| 9 | `effects.rs` L17 | `pitch_shift`/`tempo` config fields exist but are never applied |
| 10 | `watcher.rs` L34 | Uses `eprintln!` instead of `log::error!` |
| 11 | `commands/lyrics.rs` L14 | `get_lyric_at_time` re-parses entire LRC file on every call — cache it |
| 12 | `App.tsx` L6 | Unnecessary `<div>` wrapper — use fragment |
| 13 | `VPlayer.tsx` L57 | `focusSearch` uses fragile DOM query — use ref or data-attribute |
| 14 | `ContextMenu.tsx` L103–L106 | Empty `handleScroll` — dead code |
| 15 | `TrackList.tsx` | 800 lines — extract `TrackRow` into its own file |
| 16 | `ContextMenu.tsx` | 280 lines — extract menu generators to a utils file |
| 17 | `PlayerProvider.tsx` | 4 `any` types — should be properly typed |
| 18 | `Window.tsx` L13 | `[key: string]: any` in `WindowData` — use `WindowPosition` type |
| 19 | `useToast.ts` | Hook subscribes to entire store — split into read/write hooks |
| 20 | `useWindowInteraction.ts` | Drag handler recreates on every frame due to windowData in deps |
| 21 | `useDragDrop.ts` L158 | `log.info` on every global dragover — extremely noisy |
| 22 | `package.json` | `@testing-library/react-hooks` is deprecated — use `@testing-library/react` |
| 23 | `package.json` | No ESLint or Prettier configured |
| 24 | `MusicBrainzAPI.ts` L10 | Hardcoded User-Agent version `0.7.0` vs actual `0.9.12` |
| 25 | `MusicBrainzAPI.ts` L79–L80 | `requestQueue` and `isProcessingQueue` declared but never used |
| 26 | `layoutTemplates.ts` | All pixel positions hardcoded — won't adapt to different screen sizes |
| 27 | `AutoSizer.tsx` | ResizeObserver not throttled — rapid updates during window drag |
| 28 | `PlaylistContent.tsx` L30 | Hard-coded 400px max height — use AutoSizer |
| 29 | `tauri.conf.json` | `assetProtocol.scope` includes `$HOME/**` — overly broad |
| 30 | `store/types.ts` L33 | `WindowsState` uses `string` key instead of `WindowId` union |
| 31 | `constants.ts` L100 | `DEFAULT_PREFERENCES` partially overlaps settings slice defaults — drift risk |

---

## 7. Dead Code Inventory

| Item | File |
|------|------|
| `image` crate | `Cargo.toml` |
| `ErrorContext` trait | `error.rs` L82–100 |
| `validate_playlist_name()` | `validation.rs` L33 |
| `validate_rating()` | `validation.rs` L52 |
| `pitch_shift` / `tempo` fields | `effects.rs` L17–18 |
| `VisualizerMode::CircularSpectrum/Spectrogram` | `visualizer.rs` L18–23 |
| `process_buffer()` | `effects.rs` L283 |
| `get_lyrics_around()` | `lyrics.rs` L107 |
| `get_play_count()` | `database.rs` L294 |
| Redundant re-exports | `commands/mod.rs` L17–20 |
| Audio config analysis in `device.rs` | `device.rs` L83–96 |
| `handleScroll` (empty fn) | `ContextMenu.tsx` L103–106 |
| `miniPlayerMode` state | `VPlayer.tsx` (never set to true) |
| `handleRescanAll` prop | `LibraryContent.tsx` (unused) |
| `currentColors` prop | `LibraryContent.tsx` (unused) |
| `withTimeout` / `BACKEND_TIMEOUT_MS` | `useAudio.ts` |
| `preloadAudioRef` | `usePlayer.ts` L43 |
| `requestQueue` / `isProcessingQueue` | `MusicBrainzAPI.ts` L79–80 |
| `idb` storage mock | `setupTests.js` L38 |
| `StoreState` type alias | `types/index.ts` L39 |

---

## 8. Test Coverage Gaps

### Well-Tested (keep investing here)

| Module | Tests | Assessment |
|--------|-------|-----------|
| `TauriAPI.ts` | 35+ | Excellent — every major method verified |
| `useAudio.ts` | 21 | Excellent — retry/backoff/recovery |
| `DiscographyMatcher.ts` | 20+ | Excellent — normalization, fuzzy matching |
| `Zustand store` | 16 | Good — queue ops, player setters, layouts |
| `usePlaybackEffects.ts` | 11 | Good — volume, position, A-B repeat |
| `usePlayer.ts` | 8 | Good — core navigation |
| `ErrorHandler.ts` | 9 | Good — message mapping |

### Not Tested (high risk)

| Module | Risk | Recommendation |
|--------|------|----------------|
| `MusicBrainzAPI.ts` | Rate limiting, pagination, retry logic untested | Add unit tests with `fetch` mocks |
| `CoverArtArchive.ts` | Cache eviction, dedup, error caching untested | Add unit tests |
| `useCrossfade.ts` | Complex timing logic, dual-engine management | Add integration tests |
| `useEqualizer.ts` | EQ preset application, band adjustments | Add unit tests |
| `useLibrary.ts` (composed) | Library data flow, scanner integration | Add integration tests |
| `usePlaylists.ts` | Playlist CRUD, ordering | Add unit tests |
| `useShortcuts.ts` | All keyboard shortcuts | Add smoke tests |
| All 18 window components | User interactions, data rendering | Add smoke render tests |

---

## 9. Phased Remediation Plan

### Phase 0: Security Hotfixes (1–2 days)

**Goal:** Eliminate all security vulnerabilities before any other work.

| Task | File(s) | Effort |
|------|---------|--------|
| Parameterize smart playlist SQL | `smart_playlists.rs` | 2h |
| Restrict/remove `write_text_file` command | `commands/library.rs` | 30m |
| Narrow `assetProtocol.scope` | `tauri.conf.json` | 15m |
| Wire `validate_path` into all file-accepting commands | `commands/library.rs`, `validation.rs` | 1h |

---

### Phase 1: Correctness Bugs (2–3 days)

**Goal:** Fix all confirmed bugs affecting end-user behavior.

| Task | File(s) | Effort |
|------|---------|--------|
| Fix `nextInQueue` stale state read | `playerSlice.ts` | 30m |
| Fix seek shortcut (`audio.currentTime` → store progress) | `useShortcuts.ts` | 30m |
| Fix scan event listener stale closures | `useLibraryScanner.ts` | 1h |
| Fix play count double-increment | `usePlaybackEffects.ts` | 30m |
| Debounce position save | `usePlaybackEffects.ts` | 30m |
| Fix BassBoost biquad (Direct Form) | `effects.rs` | 1h |
| Fix ReplayGain mono-only analysis | `replaygain.rs` | 1h |
| Resolve React/@types/react version mismatch | `package.json` | 30m |
| Max retry limit for MusicBrainz 503 | `MusicBrainzAPI.ts` | 30m |
| Don't cache CoverArt network failures | `CoverArtArchive.ts` | 30m |
| Consolidate startup restore logic | `useStartupRestore.ts`, `useTrackLoading.ts` | 1h |

---

### Phase 2: Performance (3–4 days)

**Goal:** Address the most impactful performance bottlenecks.

| Task | File(s) | Effort |
|------|---------|--------|
| Enable SQLite WAL mode + foreign keys | `database.rs` | 30m |
| Add `Mutex::lock` helper that converts poison errors | `database.rs` | 1h |
| Memoize PlayerProvider context `value` | `PlayerProvider.tsx` | 30m |
| Remove JSON.stringify key from `TrackList` | `TrackList.tsx` | 15m |
| Lazy-load window components | `windowRegistry.tsx`, `WindowManager.tsx` | 2h |
| Reduce per-sample lock frequency (batch processing) | `audio/effects.rs` | 4h |
| Cache parsed LRC in lyrics commands | `commands/lyrics.rs` | 1h |
| Share extension list between scanner/watcher | `scanner.rs`, `watcher.rs` | 30m |

---

### Phase 3: Code Quality (3–5 days)

**Goal:** Clean up dead code, fix type safety gaps, improve maintainability.

| Task | File(s) | Effort |
|------|---------|--------|
| Remove `image` crate from Cargo.toml | `Cargo.toml` | 5m |
| Remove all dead code (see §7 inventory) | Multiple | 2h |
| Wire validation functions (`validate_playlist_name`, `validate_rating`) | `commands/playlist.rs`, `commands/library.rs` | 1h |
| Replace `any` types in PlayerProvider/Window | `PlayerProvider.tsx`, `Window.tsx` | 1h |
| Split `useDiscography` into 3 hooks | `useDiscography.ts` | 3h |
| Split `TrackList.tsx` (extract `TrackRow`) | `TrackList.tsx` | 1h |
| Split `ContextMenu.tsx` (extract generators) | `ContextMenu.tsx` | 1h |
| Replace `confirm()`/`alert()` with native dialogs | `usePlaylistActions.ts` | 30m |
| Fix `formatDuration` for hours | `formatters.ts` | 15m |
| Update MusicBrainz User-Agent version | `MusicBrainzAPI.ts` | 5m |
| Add graceful shutdown for broadcast thread | `main.rs` | 1h |
| Refactor global shortcut registration to loop | `main.rs` | 30m |

---

### Phase 4: Testing (4–6 days)

**Goal:** Close the most dangerous test coverage gaps.

| Task | Files | Effort |
|------|-------|--------|
| Add MusicBrainzAPI tests (rate limit, retry, pagination) | New test file | 3h |
| Add CoverArtArchive tests (cache, dedup, eviction) | New test file | 2h |
| Add useCrossfade integration tests | New test file | 2h |
| Add useShortcuts smoke tests | New test file | 2h |
| Add window component render tests (18 windows) | New test files | 4h |
| Convert remaining `.js` test files to `.ts` | 3 files | 1h |
| Remove deprecated `@testing-library/react-hooks` | `package.json` | 30m |
| Add ESLint + Prettier | `package.json`, new configs | 2h |

---

### Phase 5: Accessibility & Polish (ongoing)

**Goal:** Improve accessibility and UX details.

| Task | Files | Effort |
|------|-------|--------|
| Add focus traps to Modal, TrackInfoDialog, PlaylistDialogs | Multiple | 3h |
| Add ARIA roles to ContextMenu | `ContextMenu.tsx` | 2h |
| Add `aria-label`s to Window controls | `Window.tsx` | 30m |
| Add `role="alert"` to error/update banners | `AppContainer.tsx`, `UpdateComponents.tsx` | 30m |
| Add `role="radiogroup"` to StarRating | `StarRating.tsx` | 30m |
| Throttle AutoSizer ResizeObserver | `AutoSizer.tsx` | 30m |
| Make layout templates screen-size-aware | `layoutTemplates.ts` | 4h |

---

## Summary

The codebase is in **good shape architecturally**. The Zustand slice pattern, the TauriAPI abstraction, the sub-struct AudioPlayer, and the hooks composition model are all well-designed. There's no need to rearchitect anything fundamental.

The highest-impact work is:
1. **Phase 0** (security) — SQL injection and unrestricted file write are real vulnerabilities
2. **Phase 1** (correctness) — The stale queue index, broken seek shortcuts, and play-count bugs affect daily use
3. **Phase 2** (performance) — SQLite WAL mode and context memoization are easy wins with outsized impact

Estimated total effort across all phases: **~3–4 weeks** of focused work if done sequentially. Phases 0–2 could be completed in the first week.
