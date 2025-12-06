# VPlayer - Remaining Improvements

**Last Updated:** December 5, 2025

---

## Remaining Dead Code

### Frontend - Unused Exports

| File | Unused Export | Notes |
|------|---------------|-------|
| `useCrossfade.js` | `getFadeInMultiplier()` | Never called |
| `useCrossfade.js` | `startFadeIn()` | Never called |
| `usePlayer.js` | `stop()` | Never called |

### Frontend - Unused TauriAPI Methods

```javascript
// Gapless Playback (never used)
preloadTrack(path)
swapToPreloaded()
clearPreload()
hasPreloaded()
```

### Backend - Dead Functions

| File | Function | Notes |
|------|----------|-------|
| `lyrics.rs` | `SyncedLyric::interpolate_timestamp()` | Never called |
| `smart_playlists.rs` | `SmartPlaylistCondition::default()` | Never called |
| `effects.rs` | `EffectsChain::process_batch()` | Never called |
| `scanner.rs` | `is_valid_cover_image()` | Never called |
| `audio.rs` | `visualizer_buffer` field | Stored but never read |
| `validation.rs` | `validate_playlist_name()` | Never called |
| `validation.rs` | `validate_rating()` | Never called |

### Backend - Incomplete Implementations

```rust
// src-tauri/src/effects.rs - Fields exist but DSP not implemented
pub struct EffectsConfig {
    pub pitch_shift: f32,  // ❌ Not implemented
    pub tempo: f32,        // ❌ Not implemented
}
```

---

## Duplicate Code to Consolidate

### Backend - ReplayGain Dual Implementation

Two separate systems exist:
- `audio.rs`: Runtime gain (`set_replaygain`, `clear_replaygain`)
- `replaygain.rs`: Analysis/storage (`calculate_replaygain`, `save_replaygain`)

**Action:** Consolidate into single coherent module

### Backend - Scanner Duplication

`scan_folders()` and `scan_folder_incremental()` share ~70% identical code.

**Action:** Extract common logic into private helper function

---

## Files Needing Refactoring

### Frontend - Large Files

| File | Lines | Issues |
|------|-------|--------|
| `PlaylistWindow.jsx` | ~560 | 5+ inline dialogs, drag-drop, search logic |
| `LibraryWindow.jsx` | ~375 | Folder CRUD, missing files, scanning progress |
| `VPlayer.jsx` | ~280 | 25+ state pieces, "god component" |
| `TrackList.jsx` | ~340 | Virtualized + non-virtualized modes |
| `OnboardingWindow.jsx` | ~285 | 6 inline step components |

### Backend - Large Files

| File | Lines | Issues |
|------|-------|--------|
| `audio.rs` | ~600 | Playback, devices, gapless, ReplayGain, visualizer all in one |
| `database.rs` | ~500 | All CRUD + migrations + caching in single file |

---

## Duplicated UI Patterns

| Pattern | Found In | Action |
|---------|----------|--------|
| Empty State | 6 windows | Create `EmptyState.jsx` |
| Search Input | 4 windows | Create `SearchInput.jsx` |
| Dialog/Modal | 5 windows | Standardize on `Modal.jsx` |
| Progress Bar | 3 windows | Create `ProgressIndicator.jsx` |
| Tab Navigation | 2 windows | Create `TabNavigation.jsx` |
| Window Header | All windows | Create `WindowHeader.jsx` |
| Confirm Dialog | 4 windows | Create `ConfirmDialog.jsx` |

---

## Missing Features

### High Priority

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Bookmarks / Cue Points** | Save timestamps for quick navigation | Medium |
| **Audio Limiter** | Prevent clipping with EQ boost | Medium |

### Medium Priority

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Go to Current Track (Library)** | Scroll to playing track in library | Low |
| **Column Customization** | Show/hide columns (bitrate, file size) | Medium |
| **Library Context Menu Rating** | Rate from library, not just playlist | Low |
| **Sort by Last Played** | Add sort option | Low |
| **Random Album/Artist Playback** | Play random album instead of shuffle | Medium |
| **Auto-Queue Similar Tracks** | Queue similar by genre/artist | Medium |

### Lower Priority

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Additional Keyboard Shortcuts** | Delete, F2 for tags, number keys for rating | Low |
| **Visualizer Configuration** | Bar count, colors, peak hold | Low-Medium |
| **Mono Audio Mode** | Mix stereo to mono | Low |
| **Pre-Amp Control** | Master gain before EQ | Low |

### Accessibility

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Screen Reader Support** | ARIA labels, roles, live regions | Medium |
| **High Contrast Mode** | Built-in theme | Low |
| **Reduced Motion Mode** | Option to disable animations | Low-Medium |
| **Focus Indicators** | Consistent visible focus ring | Low |

---

## Refactoring Plan

### Extract Shared UI Components

- [ ] `src/components/EmptyState.jsx`
- [ ] `src/components/SearchInput.jsx`
- [ ] `src/components/ProgressIndicator.jsx`
- [ ] `src/components/TabNavigation.jsx`
- [ ] `src/components/ConfirmDialog.jsx`
- [ ] `src/components/WindowHeader.jsx`

### Split Large Frontend Files

#### VPlayer.jsx
- [ ] Extract `usePlayerManager` hook
- [ ] Extract `useWindowLayout` hook
- [ ] Move `WINDOW_CONFIGS` to `src/config/windowConfigs.js`

#### PlaylistWindow.jsx
- [ ] Extract dialogs to `src/components/dialogs/`
- [ ] Create `usePlaylistDragDrop` hook

### Refactor Rust Backend

#### Split database.rs
```
database/
  mod.rs          # Database struct, initialization
  tracks.rs       # Track CRUD
  playlists.rs    # Playlist operations
  folders.rs      # Folder management
  album_art.rs    # Album art caching
  migrations.rs   # Schema migrations
```

#### Split audio.rs
```
audio/
  mod.rs          # Core exports
  player.rs       # Play, pause, stop, seek
  devices.rs      # Device enumeration/switching
  gapless.rs      # Preloading logic
```

---

## Files to Create

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
src/config/windowConfigs.js
```
