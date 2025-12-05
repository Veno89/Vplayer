# VPlayer Comprehensive Code Analysis & Refactoring Plan

**Generated:** December 5, 2025
**Last Updated:** December 5, 2025 - Implementation Complete

---

## Implementation Status

### ✅ COMPLETED IMPLEMENTATIONS

| Item | Status | Description |
|------|--------|-------------|
| **Dead code removal** | ✅ Done | Deleted 4 unused hook files (~450 lines) |
| **settingsSlice fix** | ✅ Done | Removed undefined crossfade references |
| **validation.rs integration** | ✅ Done | Integrated into audio commands |
| **Balance/Pan control** | ✅ Done | Added Rust backend + JS API |
| **A-B repeat feature** | ✅ Done | Full implementation (state, UI, logic) |
| **Multi-select in TrackList** | ✅ Done | Shift/Ctrl+click selection |
| **Batch operations** | ✅ Done | Add to queue/playlist, batch delete |
| **Copy file path** | ✅ Done | Already existed in context menu |
| **Show in folder** | ✅ Done | New Tauri command + integration |
| **Reset play count** | ✅ Done | New Tauri command + context menu |
| **Search in queue** | ✅ Done | Filter queue by search term |

### Files Changed

**Deleted:**
- `src/hooks/useLibraryFilter.js`
- `src/hooks/useLibraryFolders.js`
- `src/hooks/useLibraryScan.js`
- `src/hooks/useWindows.js`

**Modified - Rust:**
- `src-tauri/src/audio.rs` - Added balance/pan support
- `src-tauri/src/commands/audio.rs` - Added set_balance, get_balance, validation integration
- `src-tauri/src/commands/library.rs` - Added show_in_folder, reset_play_count
- `src-tauri/src/database.rs` - Added reset_play_count
- `src-tauri/src/main.rs` - Registered new commands
- `src-tauri/src/validation.rs` - Removed dead_code markers

**Modified - Frontend:**
- `src/store/slices/playerSlice.js` - Added A-B repeat state
- `src/store/slices/settingsSlice.js` - Fixed crossfade bug
- `src/hooks/useStoreHooks.js` - Added A-B repeat exports
- `src/windows/PlayerWindow.jsx` - Added A-B repeat UI
- `src/windows/PlaylistWindow.jsx` - Added multi-select/batch support
- `src/windows/QueueWindow.jsx` - Added search filter
- `src/components/TrackList.jsx` - Added multi-select support
- `src/components/ContextMenu.jsx` - Added show in folder, reset play count
- `src/services/TauriAPI.js` - Added new API methods
- `src/VPlayer.jsx` - Wired A-B repeat feature

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Dead Code Analysis](#dead-code-analysis)
3. [Duplicate Functions & Responsibilities](#duplicate-functions--responsibilities)
4. [Files Needing Refactoring](#files-needing-refactoring)
5. [Duplicated UI Patterns](#duplicated-ui-patterns)
6. [Missing Features](#missing-features)
7. [Plan of Attack](#plan-of-attack)

---

## Executive Summary

### Key Findings

| Category | Count | Impact |
|----------|-------|--------|
| **Completely unused hook files** | 4 | ~600 lines removable |
| **Unused Rust module** | 1 | ~100 lines removable |
| **Duplicate functionality sets** | 6 | Maintenance burden |
| **Files over 200 lines** | 15 | Complexity issues |
| **Duplicated UI patterns** | 8 | Code duplication |
| **Missing features** | 20+ | Feature gaps |

### Health Score

- **Frontend (React):** ⚠️ Moderate - significant dead code, duplicate hooks
- **Backend (Rust):** ⚠️ Moderate - large files, duplicate functionality
- **Architecture:** ✓ Good - clear separation of concerns
- **Feature Completeness:** ✓ Good - but room for improvement

---

## Dead Code Analysis

### 🔴 Frontend - Completely Unused Files (DELETE THESE)

#### 1. `src/hooks/useLibraryFilter.js`
- **Status:** Never imported anywhere
- **Lines:** ~150
- **Issue:** Duplicates ALL filtering logic already present in `useLibrary.js`
- **Action:** Delete file

#### 2. `src/hooks/useLibraryFolders.js`
- **Status:** Never imported anywhere
- **Lines:** ~120
- **Issue:** Duplicates folder management from `useLibrary.js`:
  - `loadFolders` - duplicated
  - `addFolder` - duplicated
  - `removeFolder` - duplicated
  - `scanFolder` - duplicated
  - `refreshLibrary` - duplicated
- **Action:** Delete file

#### 3. `src/hooks/useLibraryScan.js`
- **Status:** Never imported anywhere
- **Lines:** ~100
- **Issue:** Duplicates scan event handling already in `useLibrary.js`
- **Action:** Delete file

#### 4. `src/hooks/useWindows.js`
- **Status:** Never imported anywhere
- **Lines:** ~80
- **Issue:** Duplicates window management from `uiSlice` + `useStoreHooks`
- **Action:** Delete file

#### 5. Unused Exports in Used Files

| File | Unused Export | Notes |
|------|---------------|-------|
| `useCrossfade.js` | `getFadeInMultiplier()` | Never called anywhere |
| `useCrossfade.js` | `startFadeIn()` | Never called anywhere |
| `usePlayer.js` | `stop()` | Never called - code uses `audio.pause()` + `audio.seek(0)` |

#### 6. TauriAPI Unused Methods

```javascript
// src/services/TauriAPI.js - Gapless Playback (never used)
preloadTrack(path)      // Line ~188
swapToPreloaded()       // Line ~192
clearPreload()          // Line ~196
hasPreloaded()          // Line ~200
```

### 🔴 Backend - Unused Rust Code

#### 1. `src-tauri/src/validation.rs` - ENTIRE MODULE UNUSED
- Contains validators that are never called:
  - `validate_track_path()`
  - `validate_playlist_name()`
  - `validate_folder_path()`
  - `validate_rating()`
- **Action:** Either integrate into commands or delete

#### 2. Dead Functions (marked `#[allow(dead_code)]`)

| File | Function | Notes |
|------|----------|-------|
| `lyrics.rs` | `SyncedLyric::interpolate_timestamp()` | Never called |
| `smart_playlists.rs` | `SmartPlaylistCondition::default()` | Never called |
| `effects.rs` | `EffectsChain::process_batch()` | Never called |
| `scanner.rs` | `is_valid_cover_image()` | Never called |
| `audio.rs` | `visualizer_buffer` field | Stored but never read |

#### 3. Incomplete Implementations

```rust
// src-tauri/src/effects.rs - EffectsConfig
pub struct EffectsConfig {
    pub pitch_shift: f32,  // ❌ Field exists but DSP not implemented
    pub tempo: f32,        // ❌ Field exists but DSP not implemented
}
```

---

## Duplicate Functions & Responsibilities

### Frontend Duplications

#### 1. Library Management - TRIPLE DUPLICATION 🔴

| Function | `useLibrary.js` | `useLibraryFolders.js` | `useLibraryScan.js` |
|----------|-----------------|------------------------|---------------------|
| Folder loading | ✅ Primary | ❌ Duplicate | ❌ |
| Folder add/remove | ✅ Primary | ❌ Duplicate | ❌ |
| Scan progress | ✅ Primary | ❌ | ❌ Duplicate |
| Filtering/sorting | ✅ Primary | ❌ | ❌ |

**Resolution:** Delete `useLibraryFolders.js` and `useLibraryScan.js`

#### 2. Window Management - DOUBLE DUPLICATION 🟡

| Feature | `useWindows.js` | `uiSlice` + `useStoreHooks` |
|---------|-----------------|------------------------------|
| `openWindow` | ✅ Unused | ✅ **Used** |
| `closeWindow` | ✅ Unused | ✅ **Used** |
| Window state | ✅ Unused | ✅ **Used** |

**Resolution:** Delete `useWindows.js`

#### 3. Store Persistence Bug 🔴

```javascript
// src/store/slices/settingsSlice.js - settingsPersistState()
crossfadeEnabled: state.crossfadeEnabled,   // ❌ NOT defined in slice!
crossfadeDuration: state.crossfadeDuration, // ❌ NOT defined in slice!
```

Crossfade is managed by `useCrossfade` hook with localStorage, creating inconsistency.

**Resolution:** Either add to settingsSlice or remove from persist function

### Backend Duplications

#### 1. ReplayGain - DUAL IMPLEMENTATION 🔴

**Location 1:** `audio.rs`
```rust
pub fn set_replaygain(&self, gain_db: f32, preamp_db: f32)
pub fn clear_replaygain(&self)
pub fn get_replaygain_multiplier(&self) -> f32
```

**Location 2:** `replaygain.rs`
```rust
pub struct ReplayGainInfo { ... }
pub fn calculate_replaygain(path: &str) -> ReplayGainInfo
pub fn save_replaygain(...), load_replaygain(...)
```

**Issue:** Two separate systems - one for runtime gain, one for analysis/storage

**Resolution:** Consolidate into single coherent module

#### 2. Scanner Logic - PARTIAL DUPLICATION 🟡

`scan_folders()` and `scan_folder_incremental()` share ~70% identical code:
- Same audio extension filtering
- Same progress emission logic
- Same error handling
- Same file iteration

**Resolution:** Extract common logic into private helper function

#### 3. Biquad Filter - IMPLEMENTATION DUPLICATION 🟡

`effects.rs` contains:
- `BiquadFilter` struct (lines 47-120)
- `AllPassFilter` struct (lines 221-267) - essentially another biquad

**Resolution:** `AllPassFilter` could extend `BiquadFilter`

---

## Files Needing Refactoring

### Frontend - Files Over 200 Lines

| File | Lines | Priority | Issues |
|------|-------|----------|--------|
| `PlaylistWindow.jsx` | ~560 | 🔴 Critical | 5+ inline dialogs, drag-drop logic, search logic |
| `LibraryWindow.jsx` | ~375 | 🔴 High | Folder CRUD, missing files, scanning progress mixed |
| `VPlayer.jsx` | ~280 | 🔴 High | 25+ state pieces, acts as "god component" |
| `TrackList.jsx` | ~340 | 🟡 Medium | Virtualized + non-virtualized modes, inline components |
| `OnboardingWindow.jsx` | ~285 | 🟡 Medium | 6 inline step components |
| `AlbumViewWindow.jsx` | ~270 | 🟡 Medium | Grid + detail views mixed |
| `PlayerWindow.jsx` | ~260 | 🟡 Medium | Progress bar drag logic, volume control |
| `VisualizerWindow.jsx` | ~310 | 🟢 Low | 3 separate draw functions |
| `EqualizerWindow.jsx` | ~240 | 🟢 Low | Acceptable complexity |
| `ThemeEditorWindow.jsx` | ~230 | 🟢 Low | Complex but focused |
| `LyricsWindow.jsx` | ~280 | 🟢 Low | Synced lyrics logic |
| `SmartPlaylistsWindow.jsx` | ~245 | 🟢 Low | Query builder complexity |

### Backend - Files Over 300 Lines

| File | Lines | Priority | Issues |
|------|-------|----------|--------|
| `audio.rs` | ~600 | 🔴 Critical | Playback, devices, gapless, ReplayGain, visualizer all in one |
| `database.rs` | ~500 | 🔴 Critical | All CRUD + migrations + caching in single file |
| `effects.rs` | ~400 | 🟢 Acceptable | Well-organized DSP, contains tests |

### Specific Refactoring Recommendations

#### `VPlayer.jsx` - God Component Problem
**Current responsibilities:**
- 25+ pieces of state
- Audio logic
- Window management
- Theme logic
- Shortcuts
- Drag-drop
- Auto-resize
- Track loading side effects
- Volume management
- Play count tracking

**Proposed split:**
1. Extract `usePlayerManager` hook
2. Extract `useWindowLayout` hook
3. Create `AppStateProvider` context
4. Move `WINDOW_CONFIGS` to separate file

#### `PlaylistWindow.jsx` - Too Many Concerns
**Current responsibilities:**
- Playlist CRUD operations
- Drag-and-drop reordering
- 3 inline dialogs (new playlist, playlist picker, rating)
- Auto-scroll logic
- Fuzzy search

**Proposed split:**
1. Extract `NewPlaylistDialog` component
2. Extract `PlaylistPickerDialog` component
3. Extract `RatingDialog` component
4. Move drag-drop to `usePlaylistDragDrop` hook
5. Move search to `usePlaylistSearch` hook

#### `database.rs` - Too Many Responsibilities
**Proposed split into module directory:**
```
database/
  mod.rs          # Database struct, initialization
  tracks.rs       # Track CRUD
  playlists.rs    # Playlist operations
  folders.rs      # Folder management
  album_art.rs    # Album art caching
  migrations.rs   # Schema migrations
```

#### `audio.rs` - Mixed Concerns
**Proposed split into module directory:**
```
audio/
  mod.rs          # Core exports
  player.rs       # Play, pause, stop, seek
  devices.rs      # Device enumeration/switching
  gapless.rs      # Preloading logic
  replaygain.rs   # Consolidate with existing module
```

---

## Duplicated UI Patterns

### 1. Empty State Pattern 🔄
**Found in:** PlaylistWindow, LibraryWindow, QueueWindow, HistoryWindow, LyricsWindow, DuplicatesWindow

```jsx
// Duplicated pattern
<div className="empty-state">
  <Icon className="icon" />
  <h3>Title</h3>
  <p>Description</p>
  <button>Action</button>
</div>
```

**Action:** Create `EmptyState.jsx` component

### 2. Search Input Pattern 🔄
**Found in:** LibraryWindow, PlaylistWindow, TrackList, AdvancedSearch

**Action:** Create `SearchInput.jsx` with clear button and icon

### 3. Dialog/Modal Pattern 🔄
**Found in:** PlaylistWindow (3 dialogs), TagEditorWindow, ThemeEditorWindow

**Action:** Standardize on existing `Modal.jsx`, create dialog variants

### 4. Loading Progress Bar Pattern 🔄
**Found in:** LibraryWindow, PlaylistWindow, OnboardingWindow

**Action:** Generalize `ScanningProgress` to `ProgressIndicator` component

### 5. Tab Navigation Pattern 🔄
**Found in:** HistoryWindow, OptionsWindowEnhanced

**Action:** Create `TabNavigation.jsx` component

### 6. Track List Row Pattern 🔄
**Found in:** TrackList, QueueWindow, PlaylistWindow, HistoryWindow

**Action:** Consolidate into single configurable `TrackRow` component

### 7. Window Header Pattern 🔄
**Found in:** Almost every window (icon + title + actions)

**Action:** Create `WindowHeader.jsx` with slots

### 8. Confirmation Dialog Pattern 🔄
**Found in:** PlaylistWindow, DuplicatesWindow, ThemeEditorWindow, LibraryWindow

**Action:** Create `ConfirmDialog.jsx` to replace `window.confirm`

---

## Missing Features

### 🔴 High Priority - Core Features

| Feature | Description | Complexity |
|---------|-------------|------------|
| **A-B Repeat / Loop Section** | Mark start (A) and end (B) within a track to loop that section | Medium |
| **Bookmarks / Cue Points** | Save specific timestamps for quick navigation | Medium |
| **Multi-Select / Batch Operations** | Shift+click, Ctrl+click for multiple tracks | Medium |
| **Balance / Stereo Pan Control** | Adjust left/right audio balance | Low-Medium |
| **Audio Limiter** | Prevent clipping with EQ boost or ReplayGain | Medium |

### 🟡 Medium Priority - Enhanced Functionality

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Go to Current Track (Library)** | Scroll to currently playing track in library view | Low |
| **Column Customization** | Show/hide columns (bitrate, file size, path) | Medium |
| **Library Context Menu Rating** | Rate tracks directly from library (not just playlist) | Low |
| **Play Count Reset** | Reset play count for tracks | Low |
| **Sort by Last Played** | Add "Last Played" sort option | Low |
| **Random Album/Artist Playback** | Play random album instead of just shuffle | Medium |
| **Auto-Queue Similar Tracks** | Queue similar tracks based on genre/artist | Medium |

### 🟢 Lower Priority - Nice-to-Have

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Additional Keyboard Shortcuts** | Delete key, F2 for tags, number keys for rating | Low |
| **Visualizer Configuration** | Configure bar count, colors, peak hold | Low-Medium |
| **Mono Audio Mode** | Mix stereo to mono | Low |
| **Search in Queue** | Filter queued tracks | Low |
| **File Path Copy** | Copy track path to clipboard | Very Low |
| **Pre-Amp Control** | Master gain before EQ | Low |

### 🔵 Accessibility Features

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Screen Reader Support** | ARIA labels, roles, live regions | Medium |
| **High Contrast Mode** | Built-in high-contrast theme | Low |
| **Reduced Motion Mode** | Option to disable animations | Low-Medium |
| **Focus Indicators** | Consistent visible focus ring | Low |

---

## Plan of Attack

### Phase 1: Dead Code Cleanup (1-2 days)
**Goal:** Remove ~700+ lines of dead code, reduce cognitive overhead

#### Frontend Tasks
- [ ] Delete `src/hooks/useLibraryFilter.js`
- [ ] Delete `src/hooks/useLibraryFolders.js`
- [ ] Delete `src/hooks/useLibraryScan.js`
- [ ] Delete `src/hooks/useWindows.js`
- [ ] Remove unused exports from `useCrossfade.js` (`getFadeInMultiplier`, `startFadeIn`)
- [ ] Remove or implement `stop()` in `usePlayer.js`
- [ ] Remove unused TauriAPI gapless methods (or implement gapless)
- [ ] Fix `settingsSlice.js` crossfade persistence bug

#### Backend Tasks
- [ ] Delete `src-tauri/src/validation.rs` OR integrate validators
- [ ] Remove dead functions marked `#[allow(dead_code)]`
- [ ] Remove or implement `pitch_shift`/`tempo` in EffectsConfig

---

### Phase 2: Extract Shared UI Components (2-3 days)
**Goal:** Reduce duplication, improve consistency

- [ ] Create `src/components/EmptyState.jsx`
- [ ] Create `src/components/SearchInput.jsx`
- [ ] Create `src/components/ProgressIndicator.jsx`
- [ ] Create `src/components/TabNavigation.jsx`
- [ ] Create `src/components/ConfirmDialog.jsx`
- [ ] Create `src/components/WindowHeader.jsx`
- [ ] Refactor windows to use new shared components

---

### Phase 3: Consolidate Track Rendering (2-3 days)
**Goal:** Single source of truth for track display

- [ ] Unify track row implementations across TrackList, QueueWindow, PlaylistWindow, HistoryWindow
- [ ] Extract shared keyboard navigation to `useTrackListKeyboard` hook
- [ ] Create configurable `TrackRow.jsx` component

---

### Phase 4: Split Large Frontend Files (3-5 days)
**Goal:** Reduce file complexity, improve maintainability

#### VPlayer.jsx
- [ ] Extract `usePlayerManager` hook
- [ ] Extract `useWindowLayout` hook
- [ ] Move `WINDOW_CONFIGS` to `src/config/windowConfigs.js`

#### PlaylistWindow.jsx
- [ ] Extract `NewPlaylistDialog` to `src/components/dialogs/`
- [ ] Extract `PlaylistPickerDialog`
- [ ] Extract `RatingDialog`
- [ ] Create `usePlaylistDragDrop` hook

#### LibraryWindow.jsx
- [ ] Extract `MissingFilesAlert` component
- [ ] Extract `ScanProgress` component
- [ ] Reuse shared components

#### OnboardingWindow.jsx
- [ ] Extract step components to `src/windows/onboarding/`

---

### Phase 5: Refactor Rust Backend (3-5 days)
**Goal:** Improve code organization, reduce duplication

#### Consolidate ReplayGain
- [ ] Merge `audio.rs` ReplayGain with `replaygain.rs`
- [ ] Single coherent API for gain management

#### Split database.rs
- [ ] Create `src-tauri/src/database/` module directory
- [ ] Separate tracks, playlists, folders, migrations

#### Split audio.rs
- [ ] Create `src-tauri/src/audio/` module directory
- [ ] Separate player core, devices, gapless

#### Refactor Scanner
- [ ] Extract common logic between `scan_folders` and `scan_folder_incremental`

---

### Phase 6: Implement Missing Features (Ongoing)
**Goal:** Feature parity with modern music players

#### Sprint 1: Quick Wins
- [ ] Go to Current Track in Library
- [ ] File Path Copy
- [ ] Play Count Reset
- [ ] Sort by Last Played
- [ ] Search in Queue

#### Sprint 2: Core Features
- [ ] Multi-Select / Batch Operations
- [ ] Balance / Pan Control
- [ ] Column Customization

#### Sprint 3: Advanced Features
- [ ] A-B Repeat / Loop Section
- [ ] Bookmarks / Cue Points
- [ ] Random Album/Artist Playback

#### Sprint 4: Accessibility
- [ ] Screen Reader Support audit
- [ ] High Contrast Mode theme
- [ ] Reduced Motion Mode
- [ ] Focus Indicator consistency

---

## Summary

### Immediate Actions (This Week)
1. **Delete 4 unused hook files** - instant ~450 lines removed
2. **Delete or integrate validation.rs** - remove confusion
3. **Fix settingsSlice crossfade bug** - prevents runtime errors
4. **Remove unused TauriAPI methods** - cleaner API surface

### Short-Term (Next 2 Weeks)
1. Extract shared UI components
2. Split `PlaylistWindow.jsx`
3. Split `VPlayer.jsx`

### Medium-Term (Next Month)
1. Refactor Rust backend modules
2. Consolidate track rendering
3. Implement quick-win features

### Long-Term (Next Quarter)
1. Advanced features (A-B repeat, bookmarks)
2. Full accessibility audit
3. Performance optimization pass

---

## Files Reference

### To Delete
```
src/hooks/useLibraryFilter.js
src/hooks/useLibraryFolders.js
src/hooks/useLibraryScan.js
src/hooks/useWindows.js
src-tauri/src/validation.rs (or integrate)
```

### To Split
```
src/VPlayer.jsx → hooks + config
src/windows/PlaylistWindow.jsx → dialogs + hooks
src/windows/LibraryWindow.jsx → components
src/windows/OnboardingWindow.jsx → step components
src-tauri/src/audio.rs → audio/ module
src-tauri/src/database.rs → database/ module
```

### To Create
```
src/components/EmptyState.jsx
src/components/SearchInput.jsx
src/components/ProgressIndicator.jsx
src/components/TabNavigation.jsx
src/components/ConfirmDialog.jsx
src/components/WindowHeader.jsx
src/components/dialogs/NewPlaylistDialog.jsx
src/components/dialogs/PlaylistPickerDialog.jsx
src/components/dialogs/RatingDialog.jsx
src/hooks/usePlayerManager.js
src/hooks/useWindowLayout.js
src/hooks/usePlaylistDragDrop.js
src/hooks/useTrackListKeyboard.js
src/config/windowConfigs.js
```
