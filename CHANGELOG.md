# Changelog

All notable changes to VPlayer will be documented in this file.

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
