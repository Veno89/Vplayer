# Changelog

All notable changes to VPlayer will be documented in this file.

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
