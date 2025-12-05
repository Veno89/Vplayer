# VPlayer Documentation

**Desktop Music Player** built with Tauri 2 (Rust) + React 18

---

## Quick Start

### For Users
1. Download and install VPlayer
2. Add music folders: `Ctrl+F` or click folder icon
3. Play music: Double-click tracks or press `Space`

### For Developers
```bash
git clone https://github.com/Veno89/Vplayer.git
cd Vplayer
npm install
npm run tauri dev
```

**Prerequisites**: Node.js 18+, Rust 1.70+, Tauri CLI v2.x

---

## Architecture

### Tech Stack
- **Frontend**: React 18, Zustand (state), Tailwind CSS, Vite
- **Backend**: Rust, Tauri 2, rodio (audio), lofty (metadata), rusqlite (database)

### System Design
```
React Frontend ←→ Tauri IPC ←→ Rust Backend
    ↓                              ↓
Zustand Store                 Audio Engine
Components                    Database
Custom Hooks                  File Scanner
                             File Watcher
```

### Project Structure
```
src/
├── components/          # Reusable UI (AlbumArt, ContextMenu, TrackList, Window, Modal)
├── hooks/              # Business logic (useAudio, useLibrary, usePlayer, useEqualizer)
├── windows/            # App windows (PlayerWindow, LibraryWindow, EqualizerWindow, etc.)
├── store/              # Zustand state management
├── services/           # API services (TauriAPI, ErrorHandler)
├── context/            # React context providers
└── utils/              # Helpers (formatters, constants)

src-tauri/src/
├── main.rs             # Tauri commands & IPC
├── audio.rs            # Audio playback (rodio)
├── database.rs         # SQLite operations
├── scanner.rs          # File scanning & metadata
├── watcher.rs          # File system monitoring
├── effects.rs          # Audio effects processing
├── lyrics.rs           # Lyrics fetching
├── playlist_io.rs      # Playlist import/export
├── smart_playlists.rs  # Smart playlist rules
└── error.rs            # Error handling
```

---

## Key Features

### Audio Playback
- **Formats**: MP3, FLAC, OGG, WAV, AAC
- **Gapless Playback**: Seamless track transitions
- **Crossfade**: Smooth fades between tracks (1-10s configurable)
- **ReplayGain**: Volume normalization using EBU R128 standard
- **Playback Speed**: Adjust tempo from 0.5x to 2.0x
- **10-band EQ**: 9 presets + custom settings
- **Volume Control**: Per-app volume with system integration

### Library Management
- **Auto-scanning**: Add folders, auto-imports new files
- **File Watching**: Automatic library updates
- **Metadata**: Artist, album, title, genre, year, track #
- **Album Art**: Embedded JPEG/PNG support
- **Rating System**: 5-star ratings with play counts

### Playlists
- **Manual Playlists**: Create, reorder, import/export M3U
- **Smart Playlists**: Auto-populate by rules (rating, genre, date added)
- **Queue System**: Temporary queue management

### Advanced Features
- **Theme Editor**: Customize colors and appearance
- **Visualizer**: Real-time FFT spectrum analyzer with bars, wave, and circular modes
- **History**: Track listening history
- **Duplicate Detection**: Find duplicate tracks in library
- **Mini Player**: Compact always-on-top mode
- **Lyrics**: Fetch and display song lyrics
- **Drag & Drop**: Drop audio folders directly onto window to add to library

---

## User Guide

### Keyboard Shortcuts

**Playback**:
- `Space` - Play/Pause
- `→` / `←` - Next/Previous track
- `↑` / `↓` - Volume up/down
- `Shift + →` / `←` - Seek forward/backward 10s
- `J` / `L` - Seek backward/forward 5s
- `S` - Toggle shuffle
- `R` - Cycle repeat mode (off → all → one)
- `M` - Mute/unmute
- `Escape` - Stop playback

**Navigation**:
- `Ctrl+L` - Library window
- `Ctrl+P` - Player window
- `Ctrl+Q` - Queue window
- `Ctrl+E` - Equalizer window
- `Ctrl+O` - Options window
- `Ctrl+F` - Focus search
- `?` - Show keyboard shortcuts (customizable)

**List Navigation**:
- `Ctrl+↑` / `↓` or `Ctrl+J` / `K` - Move selection
- `Ctrl+Enter` - Play selected track

### Creating Playlists
1. Click "Create Playlist" in Playlist window
2. Right-click tracks → "Add to Playlist"
3. Drag to reorder tracks

### Smart Playlists
Create rules-based playlists:
- **Fields**: artist, album, title, genre, rating, play_count, date_added
- **Operators**: equals, contains, greater_than, in_last, etc.
- **Examples**: `genre equals "Rock" AND rating >= 4`

---

## Development Guide

### API Reference

**Playback Commands**:
```rust
load_track(path: String) -> Result<(), String>
play_audio() / pause_audio() / stop_audio()
set_volume(volume: f32)
seek_to(position_secs: f64)
get_position() -> Result<f64, String>
```

**Library Commands**:
```rust
scan_folder(folder_path: String) -> Result<Vec<Track>, String>
get_all_tracks() -> Result<Vec<Track>, String>
remove_track(track_id: String)
```

**Playlist Commands**:
```rust
create_playlist(name: String) -> Result<String, String>
add_track_to_playlist(playlist_id, track_id, position)
export_playlist(playlist_id, output_path) // M3U export
import_playlist(playlist_name, input_path) // M3U import
```

### Adding a Tauri Command

**Backend** (`main.rs`):
```rust
#[tauri::command]
fn my_command(param: String) -> Result<String, String> {
    Ok("Success".to_string())
}

// Register in handler
.invoke_handler(tauri::generate_handler![my_command])
```

**Frontend**:
```javascript
import { invoke } from '@tauri-apps/api/core';
const result = await invoke('my_command', { param: 'value' });
```

### Adding a Window

**Create component** (`src/windows/MyWindow.jsx`):
```jsx
export function MyWindow({ currentColors, onClose }) {
  return (
    <div className="flex flex-col h-full">
      {/* Content */}
    </div>
  );
}
```

**Register** in `src/hooks/useWindowConfigs.jsx`:
```javascript
{
  id: 'myWindow',
  title: 'My Window',
  icon: MyIcon,
  content: (
    <MyWindow
      currentColors={currentColors}
      onClose={() => toggleWindow('myWindow')}
    />
  ),
}
```

### State Management

**Zustand Store** (`store/useStore.js`):
```javascript
const useStore = create((set, get) => ({
  player: {
    currentTrack: null,
    isPlaying: false,
    volume: 1.0,
    setCurrentTrack: (track) => set(...),
    togglePlayPause: () => set(...),
  },
  library: {
    tracks: [],
    updateTracks: (tracks) => set(...),
  },
  ui: {
    windows: {},
    openWindow: (id) => set(...),
  },
}));
```

**Custom Hooks** for cleaner access:
```javascript
export const usePlayerState = () => useStore(state => state.player);
export const useLibraryState = () => useStore(state => state.library);
```

### Testing

**Frontend**:
```bash
npm test              # Run tests
npm test -- --watch   # Watch mode
npm test -- --coverage
```

**Backend**:
```bash
cd src-tauri
cargo test
cargo test -- --nocapture  # Show output
```

### Building

```bash
npm run tauri build           # Development build
npm run tauri build --release # Production build
```

**Output**:
- Windows: `src-tauri/target/release/vplayer.exe`
- macOS: `src-tauri/target/release/bundle/macos/VPlayer.app`
- Linux: `src-tauri/target/release/vplayer`

---

## Design Patterns

### Custom Hooks Pattern
Extract reusable logic from components:
```javascript
// usePlayer.js
export function usePlayer({ audio, player, tracks }) {
  const handleNextTrack = useCallback(() => {
    // Complex logic
  }, [dependencies]);
  return { handleNextTrack, handlePrevTrack };
}
```

### Service Layer Pattern
Centralize business logic:
```javascript
// ErrorHandler.js
export class ErrorHandler {
  handle(error, context) {
    const message = this.getUserMessage(error);
    this.toast.showError(message);
  }
}
```

### Component Composition
Build complex UIs from simple parts:
```jsx
<Window title="Library" onClose={close}>
  <Window.Header><SearchBar /></Window.Header>
  <Window.Content><TrackList /></Window.Content>
</Window>
```

---

## Performance

### Frontend
- **Debounced search**: 300ms delay on search input
- **Memoization**: `useMemo` for expensive filters
- **Selective renders**: Zustand selectors for granular updates
- **Virtualization** (planned): `react-window` for 10k+ tracks

### Backend
- **Database indexes**: On path, artist, album, title
- **Parallel scanning**: `rayon` for concurrent file processing
- **Event debouncing**: Batch file system changes
- **Connection pooling**: Reuse SQLite connections

---

## Security

### Input Validation
- **Path validation**: Prevent directory traversal (`../../../`)
- **Sanitization**: Playlist names, user input
- **Bounds checking**: Rating (0-5), volume (0-1)

### Database
- **Parameterized queries**: Prevent SQL injection
```rust
conn.execute("INSERT INTO tracks (path) VALUES (?)", params![path])?;
```

### File Access
- **User-initiated only**: Tauri dialog for folder selection
- **No arbitrary access**: Restricted to user-chosen folders

---

## Troubleshooting

### No Sound
- Check volume in both VPlayer and system
- Verify audio device in Options
- Test file in another player

### Missing Tracks
- Run "Check Missing Files" in Options
- Re-scan folder if files moved
- Check file permissions

### Slow Performance
- Use "Optimize Database" in Options
- Disable visualizer if not needed
- Consider smaller library folders

### Import Failed
- Check M3U file paths are correct
- Use absolute paths for reliability
- Ensure tracks exist in accessible locations

---

## Code Style

### Rust
- Use `cargo fmt` for formatting
- Handle errors with `Result<T, E>`
- Document public APIs with `///` comments

### JavaScript/React
- Functional components with hooks
- Keep components small (<200 lines)
- Extract logic to custom hooks
- Use prop destructuring

### Commit Messages
Follow conventional commits:
- `feat: Add feature description`
- `fix: Fix bug description`
- `docs: Update documentation`
- `refactor: Code restructuring`

---

## Resources

- [Tauri Documentation](https://tauri.app/)
- [React Documentation](https://react.dev/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [rodio Audio Library](https://github.com/RustAudio/rodio)

---

## License & Support

See LICENSE file for details.

**Issues**: https://github.com/Veno89/Vplayer/issues  
**Discussions**: https://github.com/Veno89/Vplayer/discussions

---

**Version**: 0.5.4 | **Updated**: December 2025
