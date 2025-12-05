# Changelog

All notable changes to VPlayer will be documented in this file.

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
