# VPlayer User Manual

## Welcome to VPlayer

VPlayer is a modern, feature-rich desktop music player built with speed and simplicity in mind. This manual will help you get started and make the most of VPlayer's features.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Keyboard Shortcuts](#keyboard-shortcuts)
3. [Library Management](#library-management)
4. [Playlists](#playlists)
5. [Smart Playlists](#smart-playlists)
6. [Audio Features](#audio-features)
7. [Tag Editing](#tag-editing)
8. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Adding Music to Your Library

1. **Add a Folder**
   - Click the folder icon or press `Ctrl+F`
   - Navigate to your music folder
   - Click "Select Folder"
   - VPlayer will scan and import all supported audio files

2. **Supported Formats**
   - MP3, FLAC, OGG, WAV, AAC
   - Album art embedded in files
   - ID3 tags (v1 and v2)

3. **Automatic Watching**
   - VPlayer monitors your library folders
   - New files are automatically added
   - Deleted files are removed from the library

---

## Keyboard Shortcuts

### Playback Controls

| Shortcut | Action |
|----------|--------|
| `Space` | Play/Pause |
| `→` (Right Arrow) | Next Track |
| `←` (Left Arrow) | Previous Track |
| `↑` (Up Arrow) | Volume Up |
| `↓` (Down Arrow) | Volume Down |
| `Shift + →` | Seek Forward (10s) |
| `Shift + ←` | Seek Backward (10s) |

### Navigation

| Shortcut | Action |
|----------|--------|
| `Ctrl + ↑` | Move Up in List |
| `Ctrl + ↓` | Move Down in List |
| `Ctrl + Enter` | Play Selected Track |
| `Ctrl + J` | Move Down (Vim-style) |
| `Ctrl + K` | Move Up (Vim-style) |

### Windows

| Shortcut | Action |
|----------|--------|
| `Ctrl + F` | Toggle Library Window |
| `Ctrl + L` | Toggle Library Window |
| `Ctrl + P` | Toggle Playlist Window |
| `Ctrl + E` | Toggle Equalizer Window |
| `Ctrl + V` | Toggle Visualizer Window |

### Global Media Keys

| Key | Action |
|-----|--------|
| `MediaPlayPause` | Play/Pause |
| `MediaNextTrack` | Next Track |
| `MediaPrevTrack` | Previous Track |
| `MediaStop` | Stop Playback |
| `VolumeUp` | Increase Volume |
| `VolumeDown` | Decrease Volume |
| `VolumeMute` | Toggle Mute |

---

## Library Management

### Viewing Your Music

1. **Library Window** (`Ctrl+L`)
   - View all tracks in your library
   - Sort by: Title, Artist, Album, Duration, Rating
   - Search: Type to filter tracks instantly
   - Album view: Group tracks by album with artwork

2. **Library Statistics**
   - Total tracks, duration, artists, albums
   - Average rating across library
   - Top rated tracks
   - Most played tracks
   - Recently added tracks
   - Genre distribution chart

### Organization

- **Rating**: Click stars to rate tracks (0-5 stars)
- **Play Count**: Automatically tracked
- **Last Played**: Updated when track finishes
- **Date Added**: Track when files were imported

### Advanced Features

- **Find Duplicates**: Identifies duplicate tracks by artist and title
- **Check Missing Files**: Scans for files that no longer exist
- **History Window**: View your listening history

---

## Playlists

### Creating Playlists

1. Click "Create Playlist" in the Playlist window
2. Give it a name
3. Add tracks by:
   - Right-clicking tracks → "Add to Playlist"
   - Dragging tracks to playlist

### Managing Playlists

- **Reorder**: Drag tracks using the grip handle
- **Remove**: Right-click → "Remove from Playlist"
- **Rename**: Right-click playlist → "Rename"
- **Delete**: Right-click playlist → "Delete"

### Import/Export

- **Export to M3U**: Right-click playlist → "Export"
- **Import M3U**: Click "Import Playlist" button
- Supports absolute and relative paths

---

## Smart Playlists

Smart Playlists automatically populate based on rules you define.

### Built-in Smart Playlists

1. **Recently Added**: Tracks added in last 7 days
2. **Most Played**: Your top 50 most played tracks
3. **Recently Played**: Tracks played in last 30 days
4. **Never Played**: Tracks you haven't listened to

### Custom Smart Playlists

Create your own with advanced rules:

**Available Operators**:
- `equals`, `not_equals`
- `contains`, `not_contains`
- `starts_with`, `ends_with`
- `greater_than`, `less_than`
- `greater_equal`, `less_equal`
- `between`, `in_last`
- `is_null`, `not_null`

**Available Fields**:
- `artist`, `album`, `title`, `genre`
- `rating`, `play_count`, `duration`
- `date_added`, `last_played`

**Examples**:
- High-rated rock tracks: `genre equals "Rock" AND rating >= 4`
- Recent favorites: `date_added in_last "30:days" AND rating >= 4`
- Long tracks: `duration > 300`

---

## Audio Features

### Equalizer

- **10-band EQ**: Precise frequency control
- **9 Presets**: Flat, Rock, Jazz, Classical, Pop, Electronic, Bass Boost, Treble Boost, Vocal
- **Custom Settings**: Save your own EQ settings
- **Reset**: Restore flat response

### Gapless Playback

- Seamless transitions between tracks
- Automatic preloading (5 seconds before track ends)
- Perfect for albums and DJ mixes

### Crossfade

- Smooth fade between tracks
- Adjustable fade duration
- Prevents abrupt transitions

### Audio Device Selection

- Choose output device
- Automatic device detection
- Switch without restarting

---

## Tag Editing

Edit track metadata directly in VPlayer:

1. Right-click track → "Edit Tags"
2. Edit fields:
   - Title, Artist, Album
   - Track Number, Year
   - Genre, Comment
   - Album Artist
3. Changes saved immediately to file

**Supported Tag Formats**: ID3v2 (MP3), Vorbis Comments (FLAC, OGG)

---

## Troubleshooting

### Playback Issues

**No sound?**
- Check volume (both VPlayer and system)
- Verify audio device selection
- Check if file is corrupted (try another player)

**Crackling/stuttering?**
- Close resource-heavy applications
- Check system CPU usage
- Try a different audio device

### Library Issues

**Missing tracks?**
- Run "Check Missing Files" in Options
- Re-scan folder if files moved
- Check file permissions

**Duplicates?**
- Use "Find Duplicates" window
- Review and remove duplicates
- Based on artist + title matching

### Performance

**Slow library loading?**
- Database optimized automatically
- Run "Optimize Database" in Options
- Consider smaller library folders

**High CPU usage?**
- Disable visualizer if not needed
- Close unnecessary windows
- Check for background scanning

### Album Art

**Album art not showing?**
- Ensure art is embedded in file
- Supported formats: JPEG, PNG
- Right-click → "Refresh Album Art"

### Import/Export

**M3U import failed?**
- Check file paths are correct
- Use absolute paths for reliability
- Ensure tracks exist in accessible locations

---

## Tips & Tricks

### Mini Player Mode

- Minimize player to compact view
- Always-on-top functionality
- Perfect for multitasking
- Shows current track and basic controls

### Context Menus

Right-click anywhere for quick actions:
- **Tracks**: Play, queue, add to playlist, edit tags
- **Playlists**: Rename, delete, export
- **Folders**: Add to library, rescan

### Search

- Instant search in Library window
- Searches: title, artist, album
- Case-insensitive
- Real-time filtering

### Queue Management

- Add tracks to queue without changing playlist
- Reorder queue by dragging
- Clear queue anytime
- Queue persists between sessions

---

## Advanced Topics

### Database Location

- Default: `%APPDATA%/com.vplayer.dev/vplayer.db`
- SQLite format
- Automatic backups recommended
- Contains: tracks, playlists, play history

### File Watching

- Uses native OS file system notifications
- Minimal performance impact
- Automatic debouncing for batch operations
- Can be disabled per folder

### Performance Optimization

- Database indexes for common queries
- Efficient track loading with lazy rendering
- Background scanning doesn't block UI
- Automatic memory management

---

## Getting Help

### Resources

- **GitHub**: Report issues and feature requests
- **Documentation**: Latest features and updates
- **Keyboard Shortcuts**: Press `?` in app (future feature)

### Common Questions

**Q: Can I use VPlayer with streaming services?**
A: No, VPlayer is designed for local music files only.

**Q: Does VPlayer modify my music files?**
A: Only when you edit tags. Album art and database info are separate.

**Q: Can I sync my library across computers?**
A: Not built-in, but you can sync the database file manually.

**Q: How do I backup my library?**
A: Backup the database file and note your folder locations.

---

## Version Information

**Current Version**: 0.1.0  
**Last Updated**: November 2025  
**Platform**: Windows, macOS, Linux (via Tauri)

---

Thank you for using VPlayer! Enjoy your music! 🎵
