# Changelog

All notable changes to VPlayer will be documented in this file.


## [0.9.14] - 2026-02-10

### Bug Fixes (Phase 1 — continued)
- **BassBoost biquad filter** — replaced broken Direct Form I with thin wrapper around `BiquadFilter::set_lowshelf`, fixing distorted bass boost
- **ReplayGain all-channel analysis** — analyze interleaved samples from all channels instead of mono-only `chan(0)`
- **Scanner/watcher extension mismatch** — watcher now references shared `AUDIO_EXTENSIONS` from scanner (removes unsupported `wma`)
- **`formatDuration` hours support** — durations over 3600s now display as `H:MM:SS` instead of `60:00`
- **Native dialogs in playlists** — replaced browser `confirm()`/`alert()` with Tauri native dialogs
- **Missing `use tauri::Manager`** — fixed compilation error in `library.rs` for `app_handle.path()`

### Performance (Phase 3)
- **SQLite WAL mode** — enabled `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON` for better concurrent reads
- **Lazy-loaded windows** — all 15 window components use `React.lazy()` + `Suspense`, reducing initial bundle size

### Code Quality
- **Deduplicated useDiscography** — extracted shared `findBestArtistMatch()` helper, eliminating 3 duplicate verification loops (~90 lines)
- **Removed dead code** — `ErrorContext` trait, redundant re-exports, unused `requestQueue`/`isProcessingQueue`, unused `image` crate, dead `handleRescanAll`/`currentColors` props
- **Watcher logging** — replaced `eprintln!` with structured `log::error!`


## [0.9.13] - 2026-02-09

### Security (Phase 0)
- **Parameterized smart playlist SQL** — `to_sql()` now returns `(String, Vec<Value>)` with field whitelist, eliminating SQL injection
- **Restricted `write_text_file`** — validates target path is within app data directory via `canonicalize()`
- **Narrowed `assetProtocol.scope`** — reduced from `$HOME/**` to specific music/app directories
- **Wired input validation** — `validate_playlist_name()` and `validate_rating()` now called in command handlers

### Bug Fixes (Phase 1)
- **Fixed `nextInQueue` stale state** — captured new index before `set()` to return correct next track
- **Fixed seek shortcuts** — read `progress`/`duration` from Zustand store instead of non-existent `audio.currentTime`
- **Fixed play count double-increment** — tracks last-incremented ID via ref, skips on array identity change
- **Debounced position save** — at most once per second instead of ~10x/sec
- **Fixed scan listener stale closures** — uses `refreshFoldersRef` pattern for event listeners
- **MusicBrainz 503 retry limit** — max 3 retries with exponential backoff instead of infinite recursion
- **CoverArtArchive caching fix** — network errors no longer cached for 30 days; only confirmed results cached
- **Consolidated startup restore** — removed duplicate logic from `useTrackLoading`, kept `useStartupRestore`
- **Removed dead `storeState` variable** in `useTrackLoading.ts`

### Performance (Phase 2)
- **Memoized PlayerProvider context** — `value` wrapped in `useMemo` to prevent unnecessary consumer re-renders
- **Removed TrackList forced remount** — eliminated `JSON.stringify(columnWidths)` key that destroyed scroll position on column resize

### Dependencies
- **React 18 → 19** — upgraded `react`/`react-dom` to 19.1.0, `@testing-library/react` to 16.3.0
- **Removed `@testing-library/react-hooks`** — deprecated, `renderHook` built into `@testing-library/react`
- **Upgraded `lucide-react`** to 0.563.0 for React 19 compatibility
- **Fixed MusicBrainz User-Agent** — updated from hardcoded `0.7.0` to `0.9.13`

### Tests
- All 159 tests passing with React 19


## [0.9.12] - 2026-02-09

### Architecture Refactors (6 High-Effort Items)

- **#7 — Decompose AudioPlayer God Object**: Split monolithic `AudioPlayer` (18 `Arc<Mutex<>>` fields) into 5 focused structs: `PlaybackState`, `PreloadManager`, `VolumeManager`, `DeviceState` + thin coordinator `mod.rs`. Each sub-struct owns its own Mutex, reducing per-operation lock contention from 2–5 to 1–2.
- **#13 — Audit/Resolve unsafe Send/Sync**: Replaced blanket `unsafe impl Send/Sync for AudioPlayer` with targeted `SendOutputStream` newtype wrapper in `device.rs` — only the `OutputStream` (which is `!Send` due to cpal) needs the unsafe wrapper. Safety invariant documented: held behind Mutex, never moved between threads.
- **#2 — Align Rust/TS Track Types**: Added `genre`, `year`, `track_number`, `disc_number`, `play_count`, `last_played` fields to Rust `Track` struct. DB migration v6 adds columns. All 7+ SELECT queries updated to use `TRACK_SELECT_COLUMNS` constant. Metadata extracted via lofty `Accessor` trait.
- **#4 — Event-Driven Position Updates**: Replaced 100ms IPC polling (10 round-trips/sec) with Rust background thread emitting `playback-tick` and `track-ended` events. Frontend simply listens via `TauriAPI.onEvent()` — zero polling overhead.
- **#1 — Unify Audio State to Zustand**: Rewrote `useAudio.ts` (~200 lines, down from ~350) as event-driven hook. Removed local `useState` for `isPlaying`, `progress`, `duration`, `volume` — Zustand store is now the single source of truth. Simplified `usePlaybackEffects.ts` by removing redundant duration/progress sync effects. Cleaned up `PlayerProvider.tsx` wiring.
- **#14 — Resolve Stale Closure Patterns**: Fixed `handlePrevTrack` in `usePlayer.ts` — was recreated every 100ms tick due to `progress` in deps; now reads from store getter. Added clarifying `#14` comments to all intentional `useStore.getState()` escape hatches.

### Test & Build
- All 159 tests passing across 10 files (useAudio + usePlaybackEffects tests rewritten for event-driven architecture)
- `tsc --noEmit`: 0 errors
- `cargo check`: 0 errors, 0 warnings


## [0.9.10] - 2026-02-09

### Bug Fixes
- **Playback Position Drift Past Track End**: Fixed critical bug where the position counter would keep climbing past the track's actual duration (e.g., showing 10:00/4:00), preventing automatic advance to the next track. Root cause: Rust `get_position()` used wall-clock arithmetic (`Instant::now()`) which never stopped counting after the sink emptied. Fixed by clamping position to `total_duration` and returning duration when the sink is empty. Additionally, the JS `isFinished()` check was gated behind a narrow position window (`position >= duration - 0.1`) that could be missed when the poll timer was throttled (e.g., background window on Windows). Now always checks `isFinished()` when playing. Also clamps displayed progress to prevent UI drift.

### Full TypeScript Migration (Architecture Analysis §3.3, #19)
- **JSX → TSX**: Renamed all 53 `.jsx` files to `.tsx` (components, windows, options tabs, tests, entry points)
- **Barrel export**: Renamed `src/components/playlist/index.js` → `index.ts`
- **Prop interfaces**: Added typed prop interfaces for every component and window
- **Typed event handlers, refs, state generics**: Full type annotations across all React code
- **935 TypeScript errors resolved** down to zero — `tsc --noEmit` clean
- **Fixed infinite render loop** in `OptionsWindowEnhanced`: `useStore(s => s.getLayouts())` created new array every render → split into selector + call

### Architecture Improvements
- **MusicBrainz Persistence Consolidation (#11)**: Removed manual `localStorage` save/load in `musicBrainzSlice.ts`; `resolvedArtists` and `artistDiscographies` now included in Zustand persist state. Added `pruneExpiredDiscographyData()` called during store hydration to auto-expire stale cache entries. One-time migration removes legacy `vplayer_discography_data` localStorage key.
- **UUID for ID Generation (#17)**: Playlist IDs in Rust now use `uuid::Uuid::new_v4()` instead of `SystemTime` epoch millis. Folder IDs in JS now use `crypto.randomUUID()` instead of `Date.now()`. Added `uuid` crate v1 to `Cargo.toml`.
- **find_duplicates SQL Optimization (#20)**: Replaced full-table load + in-memory grouping with 2-pass SQL: `GROUP BY` + `HAVING COUNT(*) > 1` to find candidate keys, then targeted fetch per group.

### Test & Build
- All 159 tests passing across 10 files
- `tsc --noEmit`: 0 errors
- `cargo check`: clean


## [0.9.9] - 2026-02-08

### Bug Fixes
- **Library "0 Folders" Bug**: Fixed critical issue where library showed "0 folders" despite having tracks. `LibraryWindow` was reading 14 state values (`libraryFolders`, `isScanning`, `scanProgress`, `searchQuery`, `sortBy`, etc.) from the Zustand store where they didn't exist — all returned `undefined`. Rewired to read from `usePlayerContext().library` instead.
- **Folder Scanning Not Triggered**: Adding a folder via file picker only added it to in-memory state without triggering the actual scan. Composed `addFolder` in `useLibrary.ts` now chains folder selection → `scanNewFolder()` → DB persistence → track loading.
- **Playlist Tracks Not Playing**: Clicking a track in the playlist loaded it silently but never called `setPlaying(true)`, so no audio would start. `handleTrackSelect` in `PlaylistWindow` now explicitly starts playback.

### Architecture Improvements (from Architecture Analysis)
- **BiquadFilter Fix (§5.4)**: Changed EQ filter from incorrect Direct Form I to correct Direct Form II Transposed in `effects.rs`
- **Track::from_row() DRY (§4.1)**: Extracted shared row-mapping logic in `database.rs`, replacing 7 duplicate inline closures
- **Scanner Deduplication (§4.3)**: Extracted `collect_audio_files()` and `process_files()` helpers in `scanner.rs`, eliminating ~150 lines of duplicated scan logic
- **TauriAPI Typed (§3.3)**: Replaced all `any` types with proper interfaces (`AudioEffectsConfig`, `TagUpdate`, `PerformanceStats`, `MissingFile`, `SelectFolderOptions`)
- **Crossfade/EQ State Dedup (§4.4)**: Removed local `useState` copies from `useCrossfade.ts` and `useEqualizer.ts` — both now read/write directly from Zustand store
- **Dead Type Removal (§5.3)**: Removed unused `WindowState`/`WindowConfig` types from `types/index.ts`
- **Native Dialog (§5.1)**: Replaced `window.confirm()` in `useTrackLoading.ts` with Tauri native dialog
- **Layout Templates Extracted (§6.3)**: Moved ~200 lines of hardcoded layout data from `uiSlice.ts` to `src/utils/layoutTemplates.ts`
- **TODO Resolved (§5.7)**: Confirmed 40.0 divisor in `effects.rs` peaking EQ is correct per Audio EQ Cookbook

### Test Coverage
- All 159 tests passing across 10 files


## [0.9.8] - 2026-02-08

### Architecture Overhaul (6 Phases)

Major internal refactoring across Rust and React layers. No new user-facing features — all changes are structural improvements for stability, maintainability, and developer productivity.

#### Phase 1 — Service & State Consolidation
- **Centralized IPC Bridge**: Routed all 50+ raw `invoke()` call sites through `TauriAPI` singleton (19 typed methods), eliminating duplicate error handling
- **Unified Persistence**: Migrated 15 files from ad-hoc `localStorage` to Zustand `persist` middleware — single source of truth for all settings
- **Fixed test dependency**: Moved `vitest` from `dependencies` to `devDependencies`

#### Phase 2 — Break the God Component
- **Extracted `PlayerProvider`**: Created context provider encapsulating audio engine, player controller, crossfade, and track loading
- **Self-sufficient Windows**: All 15 windows now read store/context directly — removed ~70 prop-drilling parameters
- **Window Registry**: Created declarative `windowRegistry.jsx`, deleted `useWindowConfigs` (~300 lines)
- **VPlayer Reduction**: Main component reduced from 350 → 83 lines (76% reduction)
- **Stale Closure Elimination**: Replaced 8 stale-closure refs across `PlayerProvider` and `usePlayer` with `useStore.getState()` / `storeGetter()`
- **Self-managing hooks**: `useAutoResize` now reads store and manages `Ctrl+R` internally

#### Phase 3 — TypeScript Migration
- **Store types**: Comprehensive `AppStore = PlayerSlice & UISlice & SettingsSlice & MusicBrainzSlice` with full interfaces
- **All 20 hooks** converted from `.js` to `.ts` with typed parameters and return interfaces
- **All 3 services** (`CoverArtArchive`, `MusicBrainzAPI`, `DiscographyMatcher`) converted to typed TypeScript
- **Utility files** (`colorSchemes`, `constants`, `formatters`) converted to TypeScript
- TypeScript coverage increased from 6% → 38%

#### Phase 4 — DRY Cleanup & Developer Experience
- **Dead code removal**: Deleted `Row.jsx`, `AudioContextProvider.jsx`, `PlaylistComponents.jsx`, `ErrorDisplay.jsx`, empty `storage/` directory
- **`useMaintenanceActions` hook**: Extracted maintenance logic, added `formatBytes` utility
- **Mutable globals → Zustand**: Replaced module-level mutables in `useAutoResize` with Zustand atom; `useToast` converted to Zustand store singleton
- **Native dialogs**: Replaced all browser `confirm()`/`alert()` with native Tauri dialogs via `nativeDialog.ts` (`nativeConfirm`/`nativeAlert`/`nativeError`)
- **Logger**: Created `logger.ts` gating `console.log` behind `import.meta.env.DEV`; replaced ~60 bare `console.log` calls across 11 hook files
- **DRY settings slice**: `SETTINGS_DEFAULTS` object with auto-generated setters — cut ~65 lines
- **Updater singleton**: `useUpdater` converted to Zustand store; removed `window.updater` global

#### Phase 5 — Security & Backend Hardening
- **Content Security Policy**: Enabled CSP with `default-src 'self'`, restricted script/style/img/connect sources
- **Asset protocol scope**: Restricted from `**` (everything) to `$HOME/**`, `$APPDATA/**`, `$RESOURCE/**`
- **Dialog permissions**: Added missing `allow-ask`, `allow-message`, `allow-save`
- **Versioned database migrations**: Replaced 8 silent `ALTER TABLE` attempts with a `schema_version` system — each migration logs clearly and fails loudly on real errors
- **Bug fix**: Fixed duplicate `duration_to` filter and unused variable warning in `get_filtered_tracks`

#### Phase 6 — Critical Path Testing & Final Cleanup
- **`TauriAPI.test.ts`**: 47 tests covering all audio commands, balance, library CRUD, playlist CRUD, gapless playback, error formatting (decode/permission/not-found/unknown), health check, ReplayGain, effects, database
- **`useAudio.test.ts`**: 21 tests covering initialization, loadTrack with retry/backoff, play with recovery, pause, stop, volume clamping, seek, and polling (progress + track-end detection)
- **`usePlaybackEffects.test.ts`**: 15 tests covering volume sync, duration/progress sync, A-B repeat, play/pause translation, error handling, play count increment
- **Store tests**: 22 tests for queue operations, A-B repeat, window management, themes, layouts
- **Path aliases**: Configured `@/` → `src/` in Vite `resolve.alias` (matching existing tsconfig `paths`)
- **PlayerProvider breakup**: Extracted `usePlaybackEffects.ts` (audio↔store sync) and `useStartupRestore.ts` (resume last track) — PlayerProvider is now a thin orchestrator
- **Core TSX migration**: `PlayerProvider.tsx`, `AppContainer.tsx`, `Window.tsx` with full typed props

### Test Coverage
- **Before**: 54 tests across 6 files
- **After**: 159 tests across 10 files (194% increase)
- All tests passing, zero TypeScript errors in typed files


## [0.9.7] - 2026-02-04

### Fixed
- **Stale Closures After Long Idle**: Fixed player crashing or playing wrong tracks after the app sat idle for hours. `onEnded`, `repeatMode`, `currentTrack`, and `tracks` callbacks now use refs so they always read fresh state.
- **Stale Store Snapshot in usePlayer**: Replaced one-time `useStore.getState()` snapshot with a `storeGetter` function so queue, shuffle, and next-track logic always reads current store state.
- **Stale Polling Callbacks in useAudio**: Stored `onEnded`/`onTimeUpdate` in refs and removed them from the polling `useEffect` dependency array, preventing the interval from using outdated callbacks.
- **RepeatMode Type Mismatch**: Fixed `RepeatMode` type using `'none'` in types while the store used `'off'`, which caused the keyboard repeat-toggle shortcut to break.
- **Playlist Sort Sync Race Condition**: Replaced `setTimeout`-based index remap with synchronous `setCurrentTrack` when playlist display order changes, preventing the highlight from drifting to the wrong track.

## [0.9.5] - 2026-01-21

### Fixed
- **Playlist Navigation**: Fixed player ignoring playlist sort order when skipping tracks
- **Track Selection**: Fixed clicking a track playing the wrong song due to race conditions
- **Player UI**: Fixed player window showing metadata for the wrong track index when playing from sorted playlists

## [0.9.4] - 2026-01-21

### Added
- **Resizable Playlist Columns**: All playlist columns (including #, Title, Artist, Album, Rating, Duration) are now resizable with Excel-like drag handles
- **Functional Separators**: Column separators are always visible and respond to hover with cyan highlight

### Fixed
- **Library "0 Folders" Bug**: Fixed issue where added folders wouldn't appear in the library sidebar
- **Playlist Crash**: Fixed `ReferenceError: isValidDuration is not defined` crash
- **Duplicate Duration Column**: Removed duplicate duration display in playlist rows
- **Column Resize Sync**: Fixed issue where resizing headers didn't update the playlist rows

### Changed
- All playlist columns now use fixed widths for consistent resizing behavior
- Improved column resize handle visibility and grab area

## [0.9.3] - 2026-01-21

### Changed
- **Refactoring**: Major codebase maintenance and modernization
  - **Typescript Migration**: Converted core services (`TauriAPI`, `ErrorHandler`) and store slices to TypeScript for better stability
  - **Audio Backend**: Modularized the audio engine (`audio.rs` split into `visualizer`, `effects`, `device`)
  - **Library Hook**: Split `useLibrary` into focused hooks (`useLibraryData`, `useLibraryScanner`, `useLibraryFilters`)
  - **Playlist Code**: Extracted playlist components and logic into smaller, reusable units
- **State Management**: Centralized active track state in global store, reducing prop drilling
- **Playlist UI**: Replaced fragile manual resizing with robust `AutoSizer` component
- **Drag & Drop**: Fixed multiple drag-and-drop glitches in Playlist

### Fixed
- **Playlist Scrollbar**: Fixed issue where playlist tracks were clipped or unreachable
- **React Crash**: Fixed "React is not defined" crash in PlaylistWindow
- **Layout**: Fixed visual glitches with playlist container height

## [0.9.2] - 2026-01-20

### Fixed
- Fixed auto-updater not working due to missing permissions and incorrect ES module imports
- Added `updater:default` and `process:default` permissions to capabilities

## [0.9.1] - 2026-01-20

### Fixed
- Fixed major playlist track desync bug where wrong songs would play after prolonged use
- Fixed stale closure issue in audio callbacks causing incorrect track navigation
- Fixed displayCurrentTrack mapping using wrong track array index

## [0.9.0] - 2026-01-19

### Fixed
- Fixed empty playlists not showing delete button
- Fixed playlist track selection playing wrong song due to sort order mismatch
- Fixed next/previous navigation not respecting playlist sort order
- Fixed race condition where activePlaybackTracks updated after track index was set

## [0.8.9] - 2026-01-18

### Fixed
- **Auto-Updater**: Fixed updater signature generation by enabling `createUpdaterArtifacts` in Tauri configuration
  - Signature files (`.sig`) are now properly generated during build
  - `latest.json` updater manifest is now created with signature data
  - Users can now receive automatic updates when new versions are released

## [0.8.3] - 2026-01-18

### Added
- **Playlist Sorting**: Added ability to sort playlist by Title, Artist, and Album
  - Click on column headers to sort ascending/descending
  - Visual indicators for sort direction

## [0.8.2] - 2026-01-18

### Fixed
- **Drag & Drop**: Fixed drag-and-drop functionality from Library to Playlist
  - Resolved conflicts with Tauri's internal drag-drop handler by disabling `dragDropEnabled`
  - Fixed "dialog.message not allowed" error when dropping folders
  - Increased track drop limit from 100 to 10000 for large folders
- **Playlist Playback**: Fixed player not respecting playlist boundaries
  - Player now correctly loops within playlists instead of jumping to library tracks
  - Fixed logic bug where library tracks were used instead of active playlist context
- **Context Menu**: Unified context menu for tracks in Playlist
  - Merged conflicting context menus
  - Added "Remove from Playlist" option
  - Added "Play Now", "Add to Queue", "Set Rating" options

## [0.8.1] - 2026-01-15

### Fixed
- **Build System**: Fixed build issues related to private key handling
- **Auto-Update**: Verified configuration and secrets setup

## [0.8.0] - 2026-01-15

### Changed
- **Options Menu**: Redesigned options menu layout for better usability

## [0.7.0] - 2026-01-10

### Fixed
- **Export Missing Albums**: Fixed "Export all missing albums" button not working
  - Now uses Tauri's native save dialog instead of browser download
  - Defaults to Desktop folder for saving
  - Properly formatted text file with organized album listings
  - Shows save dialog to let you choose filename and location

## [0.6.9] - 2026-01-10

### Added
- **Re-Match All Button**: Added "Re-Match All" button in discography view
  - Re-matches ALL resolved artists using album verification in one click
  - Bypasses cache and re-searches MusicBrainz for fresh results
  - Shows progress as it works through each artist
  - Orange button next to Auto-Match in the toolbar

## [0.6.8] - 2026-01-10

### Fixed
- **Discography Rematch Button**: Fixed the rematch button completely
  - Now bypasses the MusicBrainz cache to get fresh search results
  - Clears both search and discography cache before re-resolving
  - Added detailed logging to show candidates and verification results
  - Previously the button was using cached (wrong) results instead of re-searching

## [0.6.7] - 2026-01-10

### Fixed
- **Discography Rematch Button**: Fixed the rematch button not properly re-resolving artists
  - Added improved artist lookup in library that handles name mismatches
  - Now logs debug information to help diagnose matching issues
  - Uses consistent artist name from library data when storing resolved matches

## [0.6.6] - 2026-01-10

### Fixed
- **Audio Stability**: Fixed audio randomly stopping mid-track while UI continues showing playback
  - Changed effects processor lock from blocking `.unwrap()` to non-blocking `try_lock()` to prevent audio thread deadlocks
  - Added automatic recovery when audio stops unexpectedly - will reload and seek to current position
  - Added logging to detect when audio sink becomes unexpectedly empty
  - Prevents audio dropouts when EQ settings are being adjusted during playback

## [0.6.5] - 2026-01-10

### Changed
- Updated signing keys for auto-updater functionality

## [0.6.4] - 2026-01-10

### Fixed
- **Discography Refresh Button**: Fixed the refresh button in discography view
  - Button now re-matches the artist using album verification instead of just re-fetching the same (potentially wrong) artist
  - Allows correcting wrongly matched artists (e.g., "My Dream's Over" showing 115 wrong albums)
  - Clears existing match and re-resolves using the improved album-based verification

## [0.6.3] - 2026-01-10

### Fixed
- **Version Display**: About tab and settings now show actual app version from Tauri instead of hardcoded value
  - Version is fetched dynamically from `@tauri-apps/api/app` at runtime
  - Fixes issue where "Check for Updates" showed wrong version number

## [0.6.2] - 2026-01-10

### Fixed
- **Discography Matching**: Improved artist matching accuracy for non-unique artist names
  - Now verifies artist by checking if their albums match albums in your local library
  - Prevents matching wrong artists with similar names (e.g., "My Dream's Over" no longer shows 115 wrong albums)
  - Searches multiple MusicBrainz candidates and picks the one whose discography matches your owned albums

### Added
- New `verifyArtistByAlbums()` method in DiscographyMatcher for album-based artist verification
- `quickCheck` option for fast discography fetches during artist verification
- 4 new tests for artist verification functionality

## [0.6.1] - 2026-01-10

### Fixed
- **Drag & Drop**: Enabled native Tauri drag-drop for dropping folders from Windows Explorer
- **Library Search**: Fixed search/filter not working in Library window (now uses filtered tracks)
- **Updater**: Added missing updater permission to capabilities for auto-update functionality
- **Release Workflow**: Changed releases from draft to auto-publish

### Changed
- Removed confusing "Add Folder" message when dropping files

## [0.6.0] - 2026-01-09

### Added
- **MusicBrainz Discography Matching**: Find missing albums from your favorite artists
  - Automatically matches local artists with MusicBrainz database
  - Fetches complete discographies from MusicBrainz API
  - Shows which albums you own vs which are missing
  - Cover art from Cover Art Archive integration
  - Smart album name matching (handles deluxe editions, remasters, etc.)
  - Manual artist matching and correction
  - Configurable options: include/exclude EPs, live albums, compilations
  - Persistent caching with 7-day refresh interval
  - Rate-limited API calls (respects MusicBrainz 1 req/sec limit)
  
- **Discography Window**: New dedicated window for browsing artist discographies
  - Artist list with match status indicators
  - Album grid showing owned/missing/uncertain status
  - Quick stats: total artists, matched, missing albums
  - Filter by: all artists, matched, unmatched, with missing albums
  - Auto-match all unresolved artists with one click
  - Manual artist search and selection
  - Mark albums as owned/not owned manually
  - Direct links to MusicBrainz for each artist

### Technical
- New services: MusicBrainzAPI, CoverArtArchive, DiscographyMatcher
- New store slice: musicBrainzSlice for state management
- New hook: useDiscography for consuming the feature
- Full test coverage for matching algorithms

---

## [0.5.4] - 2025-12-05

### Added
- **ReplayGain / Volume Normalization**: Automatically normalize volume levels across your library
  - Uses EBU R128 loudness standard (-18 LUFS target)
  - Track and Album gain modes
  - Configurable preamp adjustment (±15 dB)
  - "Analyze Library" button in Options → Playback to scan all tracks
  - Gain applied seamlessly during playback without re-encoding

- **Enhanced Keyboard Shortcuts**: Fully customizable keyboard shortcuts
  - Press `?` to open the Shortcuts window and customize any key binding
  - New shortcuts: `J`/`L` for 5s seek, `Shift+Arrow` for 10s seek
  - `S` for shuffle toggle, `R` for repeat mode toggle
  - `Escape` to stop playback
  - Shortcuts are now synced between ShortcutsWindow and actual key handling
  - Changes take effect immediately without restart

### Fixed
- **Auto-Resize Flickering**: Main window no longer flickers while dragging child windows
  - Window resize is now deferred until drag/resize operation completes
  - Increased debounce from 50ms to 200ms for stability
  - Smooth resize happens after you release the mouse

### Improved
- Keyboard shortcut system now uses localStorage for persistence
- All shortcuts are conflict-checked when customizing

---

## [0.5.3] - 2025-12-05

### Added
- **True Crossfade**: Fully implemented smooth volume-based crossfading between tracks
  - Volume gradually fades out on current track while next track fades in
  - Uses cosine/sine easing curves for natural-sounding transitions
  - Configurable duration from 1-10 seconds
  - Enable in Options → Audio → Crossfade

### Improved
- Crossfade respects user's volume settings - automatically restores after transition
- Volume up/down now properly tracks user intent during crossfade
- Better state management for crossfade in-progress detection

### Note
- **Audio Device Selection** and **Track Virtualization** were already implemented:
  - Device selection available in Options → Audio → Output Device
  - Track list uses react-window for smooth scrolling with large libraries

---

## [0.5.2] - 2025-12-05

### Added
- **Drag & Drop Support**: Drop audio folders directly onto the window to add them to your library
  - Visual drop zone indicator when files are dragged over
  - Supports common audio formats (MP3, FLAC, WAV, OGG, M4A, AAC, WMA)

- **Keyboard Shortcut Help**: Press `?` to quickly open the keyboard shortcuts window

- **Batch Playlist Operations**: Adding multiple tracks to a playlist is now significantly faster
  - Uses single database transaction instead of N separate calls

### Fixed
- **Memory Leak in Visualizer**: Fixed async data fetching inside animation frame that could cause race conditions and stacking calls
- **Seek Timeout Cleanup**: Fixed potential state update on unmounted component in usePlayer
- **Library Auto-scan**: Fixed dependency array in useLibrary that could cause auto-scan to use stale folder data
- **Queue Track Not Found**: Fixed race condition where queue would advance even if track wasn't found in library
- **Dynamic Sample Rate**: Effects processor (EQ, reverb, etc.) now adapts to source file sample rate instead of assuming 44.1kHz

### Improved
- Visualizer now uses separate interval for data fetching (30fps) independent of render loop (60fps) for smoother performance
- Better error handling for queue tracks that are missing from library

---

## [0.5.1] - 2025-12-05

### Added
- **Real-time FFT Visualizer**: Visualizer now displays actual audio spectrum data from the playing track instead of simulated patterns
  - Taps audio samples directly from the Rust audio engine via ring buffer
  - Uses rustfft for real FFT analysis
  - Supports bars, wave, and circular visualization modes
  - ~30fps refresh rate with smoothing

- **Playback Speed Control**: Adjust playback tempo from 0.5x to 2.0x in Options → Audio
  - Quick preset buttons (0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x)
  - Affects tempo without changing pitch

- **Enhanced Album Grid View**: Improved album browsing experience
  - Real album artwork display instead of placeholder icons
  - Search/filter albums by name or artist
  - Adjustable grid size (Small/Medium/Large)
  - Toggle between grid and list views
  - Play album button on hover

- **Queue Improvements**: Better queue management
  - Visual badge showing upcoming track count
  - Quick stats (total tracks, up next count)
  - One-click clear queue button (no confirmation needed)
  - Improved header layout

- **Context Menu Actions**: Playlist window context menu now fully functional
  - "Add to Playlist" opens playlist picker dialog
  - "Set Rating" opens inline star rating dialog
  - "Edit Tags" opens tag editor window

### Fixed
- Onboarding window now properly appears on top of all other windows on first launch
- Mute toggle now remembers previous volume level instead of resetting to 0.7

---

## [0.5.0] - 2025-12-04

### 🎉 Initial Public Beta Release

VPlayer is a modern, feature-rich desktop music player built with Tauri 2 and React.

### Features

#### Audio Playback
- High-quality audio playback with 48kHz sample rate support
- Gapless playback between tracks
- Full seeking support (forward and backward)
- Volume control with persistence
- Play/pause, stop, next/previous track controls

#### Library Management
- Scan and import music from folders
- Incremental scanning for faster updates
- Automatic metadata extraction (title, artist, album, duration)
- Album art extraction and caching
- Star ratings (0-5 stars)
- Play count tracking
- Recently played and most played views
- Duplicate detection
- Missing file detection

#### Playlists
- Create, rename, and delete playlists
- Drag and drop track reordering
- Import/export M3U playlists
- Smart playlists with custom rules

#### Audio Effects
- 10-band equalizer with presets
- Bass boost
- Reverb with adjustable room size
- Echo/delay effect
- Real-time audio visualization

#### User Interface
- Multi-window interface (player, library, queue, etc.)
- Draggable and resizable windows
- Mini player mode
- System tray integration
- Dark theme
- Keyboard shortcuts
- Global media key support

#### Additional Features
- Lyrics display (.lrc file support)
- Theme editor
- Folder watching for automatic library updates
- ReplayGain analysis

### Technical
- Built with Tauri 2.9, React 18, and Rust
- SQLite database for library storage
- Rodio audio backend with Symphonia decoder
- Cross-platform (Windows primary, macOS/Linux possible)

### Known Issues
- Code signing not yet implemented (Windows may show "Unknown Publisher" warning)
- Some advanced tag editing features are planned but not yet complete

---

## Future Plans
- macOS and Linux builds
- Audio device selection
- More equalizer presets
- Crossfade between tracks
- Last.fm scrobbling
- Discord rich presence
