# VPlayer Developer Guide

## Development Setup

### Prerequisites

- **Node.js** 18+ and npm
- **Rust** 1.70+ and Cargo
- **Tauri CLI** v2.x
- **Git**

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/Veno89/Vplayer.git
   cd Vplayer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run development server**
   ```bash
   npm run tauri dev
   ```

---

## Project Structure

```
Vplayer/
├── src/                          # React frontend
│   ├── components/               # Reusable UI components
│   │   ├── AlbumArt.jsx         # Album artwork display
│   │   ├── ContextMenu.jsx      # Right-click context menus
│   │   ├── EmptyState.jsx       # Empty state messages
│   │   ├── ErrorBoundary.jsx    # Error handling wrapper
│   │   ├── LoadingSkeleton.jsx  # Loading placeholders
│   │   ├── Row.jsx              # Track list row
│   │   ├── StarRating.jsx       # Rating component
│   │   ├── Toast.jsx            # Notification toasts
│   │   └── Window.jsx           # Draggable window wrapper
│   ├── context/                 # React context providers
│   │   ├── AudioContextProvider.jsx
│   │   ├── PlayerContext.jsx
│   │   ├── QueueContext.jsx
│   │   └── UIContext.jsx
│   ├── hooks/                   # Custom React hooks
│   │   ├── useAudio.js         # Audio playback
│   │   ├── useCrossfade.js     # Crossfade effect
│   │   ├── useEqualizer.js     # EQ management
│   │   ├── useKeyboardShortcuts.js
│   │   ├── useLibrary.js       # Library data
│   │   ├── usePlaybackControls.js
│   │   ├── usePlaylists.js
│   │   └── useVolumeControl.js
│   ├── windows/                # Application windows
│   │   ├── AlbumViewWindow.jsx
│   │   ├── DuplicatesWindow.jsx
│   │   ├── EqualizerWindow.jsx
│   │   ├── HistoryWindow.jsx
│   │   ├── LibraryStatsWindow.jsx
│   │   ├── LibraryWindow.jsx
│   │   ├── MiniPlayerWindow.jsx
│   │   ├── OnboardingWindow.jsx
│   │   ├── OptionsWindow.jsx
│   │   ├── PlayerWindow.jsx
│   │   ├── PlaylistWindow.jsx
│   │   ├── QueueWindow.jsx
│   │   ├── SmartPlaylistsWindow.jsx
│   │   ├── TagEditorWindow.jsx
│   │   ├── ThemeEditorWindow.jsx
│   │   └── VisualizerWindow.jsx
│   ├── utils/                  # Utility functions
│   │   ├── constants.js
│   │   └── formatters.js
│   ├── App.jsx                 # Main app component
│   ├── VPlayer.jsx            # Player container
│   └── main.jsx               # Entry point
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── audio.rs          # Audio playback engine
│   │   ├── database.rs       # SQLite operations
│   │   ├── error.rs          # Error types
│   │   ├── main.rs           # Tauri commands
│   │   ├── playlist_io.rs    # M3U import/export
│   │   ├── scanner.rs        # File scanning & metadata
│   │   ├── smart_playlists.rs # Smart playlist SQL
│   │   └── watcher.rs        # File system watching
│   ├── Cargo.toml            # Rust dependencies
│   └── tauri.conf.json       # Tauri configuration
├── docs/                     # Documentation
│   ├── COMPREHENSIVE_ANALYSIS.md
│   ├── DEVELOPER_GUIDE.md
│   └── USER_MANUAL.md
└── package.json              # npm configuration
```

---

## Architecture

### Frontend (React)

**State Management**:
- Context providers for global state
- Custom hooks for business logic
- Local state for UI components

**Key Patterns**:
- Window system with draggable, resizable components
- Context menus for quick actions
- Toast notifications for user feedback
- Loading skeletons and empty states

### Backend (Rust/Tauri)

**Audio Engine** (`audio.rs`):
- `rodio` for audio playback
- Gapless playback with preloading
- Crossfade support
- Volume control and seeking

**Database** (`database.rs`):
- SQLite for local storage
- Indexed for performance
- Tracks, playlists, smart playlists
- Play counts and ratings

**File Scanning** (`scanner.rs`):
- `lofty` for metadata extraction
- `walkdir` for recursive scanning
- Album art extraction (JPEG/PNG)
- Incremental scanning support

**File Watching** (`watcher.rs`):
- `notify` for filesystem events
- Automatic library updates
- Debouncing for batch operations

---

## API Reference

### Tauri Commands

**Playback**:
```rust
load_track(path: String) -> Result<(), String>
play_audio() -> Result<(), String>
pause_audio() -> Result<(), String>
stop_audio() -> Result<(), String>
set_volume(volume: f32) -> Result<(), String>
seek_to(position_secs: f64) -> Result<(), String>
get_position() -> Result<f64, String>
is_playing() -> Result<bool, String>
```

**Library**:
```rust
scan_folder(folder_path: String) -> Result<Vec<Track>, String>
scan_folder_incremental(folder_path: String) -> Result<Vec<Track>, String>
get_all_tracks() -> Result<Vec<Track>, String>
remove_folder(folder_id: String) -> Result<(), String>
remove_track(track_id: String) -> Result<(), String>
```

**Playlists**:
```rust
create_playlist(name: String) -> Result<String, String>
get_all_playlists() -> Result<Vec<Playlist>, String>
delete_playlist(playlist_id: String) -> Result<(), String>
add_track_to_playlist(playlist_id: String, track_id: String, position: i32) -> Result<(), String>
get_playlist_tracks(playlist_id: String) -> Result<Vec<Track>, String>
export_playlist(playlist_id: String, output_path: String) -> Result<(), String>
import_playlist(playlist_name: String, input_path: String) -> Result<Vec<String>, String>
```

**Smart Playlists**:
```rust
create_smart_playlist(playlist: SmartPlaylist) -> Result<(), String>
get_all_smart_playlists() -> Result<Vec<SmartPlaylist>, String>
execute_smart_playlist(id: String) -> Result<Vec<Track>, String>
```

**Metadata**:
```rust
get_album_art(track_id: String) -> Result<Option<String>, String>
update_track_tags(path: String, tags: TrackTags) -> Result<(), String>
set_track_rating(track_id: String, rating: i32) -> Result<(), String>
```

**Performance**:
```rust
get_performance_stats() -> Result<serde_json::Value, String>
vacuum_database() -> Result<(), String>
```

---

## Development Guidelines

### Code Style

**Rust**:
- Follow Rust standard formatting (`cargo fmt`)
- Use meaningful variable names
- Add documentation comments for public APIs
- Handle errors with `Result<T, E>`

**JavaScript/React**:
- Use functional components with hooks
- Keep components small and focused
- Extract business logic to custom hooks
- Use prop destructuring

### Performance

**Frontend**:
- Use `React.memo` for expensive components
- Debounce search and filter operations
- Lazy load large lists (consider `react-window`)
- Minimize re-renders with proper dependencies

**Backend**:
- Use database indexes for frequent queries
- Batch database operations when possible
- Cache expensive computations
- Profile with large libraries (10k+ tracks)

### Testing

**Frontend**:
```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # Coverage report
```

**Backend**:
```bash
cd src-tauri
cargo test                 # Run all tests
cargo test -- --nocapture  # Show output
```

---

## Building for Production

### Development Build
```bash
npm run tauri build
```

### Release Build
```bash
npm run tauri build -- --release
```

**Output locations**:
- **Windows**: `src-tauri/target/release/vplayer.exe`
- **macOS**: `src-tauri/target/release/bundle/macos/VPlayer.app`
- **Linux**: `src-tauri/target/release/vplayer`

---

## Common Tasks

### Adding a New Tauri Command

1. **Define command in `main.rs`**:
```rust
#[tauri::command]
fn my_command(param: String) -> Result<String, String> {
    // Implementation
    Ok("Success".to_string())
}
```

2. **Register in handler**:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    my_command,
])
```

3. **Call from frontend**:
```javascript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('my_command', { param: 'value' });
```

### Adding a New Window

1. **Create window component** in `src/windows/`:
```jsx
export function MyWindow({ currentColors, onClose }) {
  return (
    <Window title="My Window" onClose={onClose}>
      {/* Content */}
    </Window>
  );
}
```

2. **Add to `VPlayer.jsx`**:
```jsx
const windowConfigs = {
  myWindow: {
    component: MyWindow,
    defaultPos: { x: 100, y: 100 },
    defaultSize: { w: 400, h: 300 },
  },
  // ...
};
```

3. **Add keyboard shortcut** in `useKeyboardShortcuts.js`:
```javascript
if (e.code === 'KeyM' && e.ctrlKey) {
  ui.toggleWindow('myWindow');
}
```

### Adding Database Migrations

1. **Add migration in `Database::new()`**:
```rust
let _ = conn.execute(
    "ALTER TABLE tracks ADD COLUMN new_field TEXT",
    [],
);
```

2. **Update Track struct** if needed
3. **Update queries** to include new field

---

## Debugging

### Frontend Debugging

**Browser DevTools**:
- Open with `F12` or `Ctrl+Shift+I`
- React DevTools available
- Console logs visible

**Common Issues**:
- Component not rendering: Check props and state
- Hook dependencies: Verify useEffect/useMemo deps
- Context not available: Ensure provider wraps component

### Backend Debugging

**Logging**:
```rust
use log::{info, warn, error, debug};

info!("Normal operation");
warn!("Warning message");
error!("Error occurred: {}", e);
debug!("Debug info");
```

**Cargo output**:
```bash
RUST_LOG=debug npm run tauri dev
```

**Common Issues**:
- Compilation errors: Check Rust syntax and types
- Command not found: Verify registration in handler
- Database locked: Ensure proper mutex usage

---

## Contributing

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit PR with description

### Commit Messages

Follow conventional commits:
- `feat: Add new feature`
- `fix: Fix bug description`
- `docs: Update documentation`
- `refactor: Code restructuring`
- `test: Add tests`

---

## Troubleshooting

### Build Errors

**Rust compilation fails**:
```bash
cd src-tauri
cargo clean
cargo build
```

**Frontend build fails**:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Runtime Errors

**Database locked**:
- Check for unclosed connections
- Verify mutex usage
- Restart application

**Audio playback issues**:
- Check file format support
- Verify audio device availability
- Check system audio settings

---

## Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [React Documentation](https://react.dev/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [rodio Audio Library](https://github.com/RustAudio/rodio)
- [lofty Metadata Library](https://github.com/Serial-ATA/lofty-rs)

---

## License

See LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: https://github.com/Veno89/Vplayer/issues
- Discussions: https://github.com/Veno89/Vplayer/discussions
