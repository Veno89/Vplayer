# VPlayer Documentation

[![Download Latest](https://img.shields.io/github/v/release/Veno89/Vplayer?label=Download&style=for-the-badge)](https://github.com/Veno89/Vplayer/releases/latest)
[![GitHub Release Date](https://img.shields.io/github/release-date/Veno89/Vplayer?style=flat-square)](https://github.com/Veno89/Vplayer/releases)

**Desktop Music Player** built with Tauri 2 (Rust) + React 18 • Fast, lightweight, customizable

---

## Quick Start

### For Users
1. Download and install VPlayer from the [Releases](https://github.com/Veno89/Vplayer/releases/latest) page
2. Add music folders via the Library window or drag & drop folders onto the app
3. Play music: Double-click tracks or press `Space`

### For Developers
```bash
git clone https://github.com/Veno89/Vplayer.git
cd Vplayer
npm install
npm run tauri:dev
```

**Prerequisites**: Node.js 18+, Rust (2021 edition), Tauri CLI v2.x

---

## Architecture

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Native backend & IPC | Rust + Tauri | Tauri 2.9, Rust 2021 edition |
| Audio engine | Rodio + Symphonia | rodio 0.21, symphonia 0.5 |
| Metadata / tags | Lofty | 0.18 |
| Database | SQLite (rusqlite) | 0.30 (bundled) |
| UI framework | React | 18.2 |
| State management | Zustand (sliced, persisted) | 5.x |
| Styling | Tailwind CSS | 3.x |
| Build tooling | Vite | 7.x |
| Testing | Vitest + React Testing Library | vitest 4.x |

### System Design
```
React Frontend  ←─ Tauri IPC ─→  Rust Backend
      ↓                                ↓
 Zustand Store                    Audio Engine (rodio)
 Custom Hooks                     SQLite Database
 TauriAPI Service (IPC bridge)    File Scanner / Watcher
 Window Registry                  DSP Effects Pipeline
 PlayerProvider (context)         ReplayGain Analysis
```

### Project Structure
```
src/
├── components/          # Reusable UI (Window, TrackList, AlbumArt, Toast, Modal, etc.)
├── hooks/               # Business logic hooks (useAudio, usePlayer, useLibrary, etc.)
│   └── library/         # Library sub-hooks (useLibraryData, useLibraryFilters, useLibraryScanner)
├── windows/             # Self-sufficient window components (15 windows)
├── store/               # Zustand state management
│   └── slices/          # Store slices (playerSlice, uiSlice, settingsSlice, musicBrainzSlice)
├── services/            # External service wrappers (TauriAPI, ErrorHandler, MusicBrainzAPI)
├── context/             # React context (PlayerProvider.tsx)
├── types/               # Shared TypeScript interfaces
├── utils/               # Helpers (formatters, constants, colorSchemes, logger)
└── windowRegistry.jsx   # Declarative window ID → component mapping

src-tauri/src/
├── main.rs              # App setup, command registration, global shortcuts, tray
├── database.rs          # SQLite schema, migrations, queries, caching
├── scanner.rs           # Filesystem scanning & metadata extraction (lofty)
├── error.rs             # Typed error system (AppError enum)
├── effects.rs           # DSP: 10-band EQ, reverb, echo, bass boost
├── lyrics.rs            # Lyrics parsing
├── playlist_io.rs       # Playlist import/export (M3U, PLS)
├── smart_playlists.rs   # Smart playlist rule engine
├── replaygain.rs        # EBU R128 loudness analysis
├── validation.rs        # Input validation & sanitization
├── visualizer.rs        # Audio visualization data
├── watcher.rs           # Filesystem change monitoring
├── audio/               # Audio engine module
│   ├── mod.rs           # AudioPlayer struct, playback state machine
│   ├── device.rs        # Audio device selection & management
│   ├── effects.rs       # DSP effects source wrapper
│   └── visualizer.rs    # FFT / visualization buffer
└── commands/            # Tauri IPC command handlers (80+ commands)
    ├── audio.rs         # Play, pause, seek, volume, device, preload
    ├── library.rs       # Scan, search, tracks, folders, album art, tags
    ├── playlist.rs      # Playlist CRUD, import/export
    ├── smart_playlist.rs
    ├── effects.rs       # EQ & effects commands
    ├── replaygain.rs    # ReplayGain commands
    ├── visualizer.rs    # Visualization data commands
    ├── lyrics.rs        # Lyrics commands
    ├── watcher.rs       # Filesystem watcher commands
    └── cache.rs         # Cache management & DB maintenance
```

---

## Key Features

### Audio Playback
- **Formats**: MP3, FLAC, OGG, WAV, AAC, Opus, M4A (via Symphonia)
- **Gapless Playback**: Seamless track transitions with preloading
- **Crossfade**: Smooth volume fades between tracks (configurable duration)
- **ReplayGain**: Volume normalization using EBU R128 standard
- **10-band EQ**: 9 presets + custom settings, real-time processing
- **A-B Repeat**: Loop a section of a track
- **Stereo Balance**: Left/right balance control
- **Audio Effects**: Reverb, echo, bass boost (Rust DSP pipeline)

### Library Management
- **Auto-scanning**: Add folders, auto-imports new files
- **Incremental Scanning**: Only processes new or modified files
- **File Watching**: Automatic library updates on filesystem changes
- **Metadata**: Artist, album, title, duration, rating
- **Album Art**: Embedded art extraction and caching
- **Rating System**: 5-star ratings with play count tracking
- **Duplicate Detection**: Find duplicate tracks in library
- **Missing File Detection**: Identify and relocate missing tracks

### Playlists
- **Manual Playlists**: Create, rename, reorder, import/export (M3U, PLS)
- **Smart Playlists**: Auto-populate by rules (rating, play count, date added, etc.)
- **Queue System**: Add next, add to end, shuffle queue, queue history

### Integrations
- **MusicBrainz**: Artist resolution and discography matching
- **CoverArtArchive**: Album art fetching
- **Tag Editor**: Edit track metadata (title, artist, album) and write back to file

### UI & Customization
- **Multi-Window Layout**: 15 draggable/resizable windows, 8 layout presets
- **Theme Editor**: Full color customization with custom theme save/load
- **Background Image**: Custom wallpaper with blur and opacity controls
- **Visualizer**: Real-time FFT spectrum analyzer (bars, wave, circular modes)
- **Mini Player**: Compact player mode
- **Lyrics Display**: Synced lyrics viewer
- **Library Stats**: Statistics dashboard
- **Keyboard Shortcuts**: Fully customizable, plus OS media key support
- **System Tray**: Minimize to tray with click-to-show
- **Drag & Drop**: Drop audio folders directly onto window to add to library
- **Auto-Updater**: In-app update notifications and installation

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
- `?` - Show keyboard shortcuts

All shortcuts are customizable via the Shortcuts window.

### Creating Playlists
1. Click "Create Playlist" in the Playlist window
2. Right-click tracks → "Add to Playlist"
3. Drag to reorder tracks within a playlist

### Smart Playlists
Create rules-based playlists:
- **Fields**: artist, album, title, rating, play_count, date_added, duration
- **Operators**: equals, contains, greater_than, in_last, etc.
- **Combine** multiple rules with AND/OR logic

---

## Development Guide

### Key Conventions

1. **All IPC goes through `TauriAPI.ts`** — never call `invoke()` directly from components.
2. **Granular Zustand selectors** — always `useStore(s => s.field)`, never `useStore()`.
3. **Hooks and services are TypeScript** (`.ts` / `.tsx`). Components and windows are `.jsx` (gradual migration).
4. **Windows are self-sufficient** — each reads its own state from `useStore` / `usePlayerContext`. No prop drilling.
5. **`useToast()` and `useUpdater()`** are Zustand singletons — safe to call from anywhere.

### Adding a Tauri Command

1. Add the handler function in the appropriate `src-tauri/src/commands/*.rs` file
2. Register the command in `src-tauri/src/main.rs` → `invoke_handler`
3. Add the TypeScript wrapper in `src/services/TauriAPI.ts`
4. Call from hooks/components via `TauriAPI.myCommand()`

### Adding a Window

1. Create `src/windows/MyWindow.jsx` — the component is self-sufficient (reads its own state):
```jsx
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';

export function MyWindow() {
  const currentColors = useCurrentColors();
  const someState = useStore(s => s.someState);

  return (
    <div className="flex flex-col h-full">
      {/* Content — no props needed */}
    </div>
  );
}
```

2. Register in `src/windowRegistry.jsx`:
```jsx
import { MyWindow } from './windows/MyWindow';
import { MyIcon } from 'lucide-react';

// Add to WINDOW_REGISTRY array:
{ id: 'myWindow', title: 'My Window', icon: MyIcon, Component: MyWindow },
```

3. The `WindowManager` automatically renders it when toggled via `useStore(s => s.toggleWindow)('myWindow')`.

### Adding a Setting

Settings use a DRY pattern — no manual wiring needed:

1. Add the default value to `SETTINGS_DEFAULTS` in `src/store/slices/settingsSlice.ts`
2. Add the type to `SettingsSliceState` in `src/store/types.ts`
3. A setter (`setMyNewSetting`) is auto-generated automatically
4. Persistence is automatic (all `SETTINGS_DEFAULTS` keys are persisted)

### State Management

The Zustand store is composed of 4 slices (all in `src/store/slices/`):

| Slice | Responsibility |
|-------|----------------|
| `playerSlice` | Playback state, queue, current track, shuffle/repeat, A-B repeat |
| `uiSlice` | Window positions/visibility, themes, color schemes, layouts |
| `settingsSlice` | User preferences (DRY pattern: defaults + auto-generated setters) |
| `musicBrainzSlice` | MusicBrainz integration state, discography cache |

```typescript
// Always use granular selectors:
const volume = useStore(s => s.volume);
const playing = useStore(s => s.playing);

// For player actions that need the audio engine, use context:
const { handleNextTrack, audio } = usePlayerContext();
```

### Testing

```bash
npm test                # Run vitest (watch mode)
npx vitest run          # Single run (CI-style)
cd src-tauri && cargo test  # Rust tests
```

Test files live next to the code they test or in `__tests__/` subdirectories. The test environment is `jsdom` with Tauri API mocks in `src/test/setupTests.js`. As of v0.9.15: **159 tests across 10 files**.

### Building

```bash
npm run tauri:build     # Production build
```

**Output**: `src-tauri/target/release/bundle/` (MSI/NSIS installer on Windows)

---

## Performance

### Frontend
- **Virtualized lists**: `react-window` for smooth scrolling with large libraries (10k+ tracks)
- **Debounced search**: Configurable delay on search input to reduce DB queries
- **Memoization**: `useMemo` for expensive filter parameter construction
- **Selective renders**: Zustand granular selectors prevent unnecessary re-renders

### Backend
- **Database indexes**: On artist, album, rating, play_count, last_played, date_added
- **Query caching**: 5-minute TTL cache for `get_all_tracks`
- **Incremental scanning**: Only processes new or modified files (mtime comparison)
- **Event debouncing**: Batch file system changes via `notify` crate
- **Schema migrations**: Versioned, idempotent migrations (v1–v5)

---

## Security

### Input Validation
- **Path validation**: `validation.rs` prevents directory traversal (`../../../`)
- **Sanitization**: Playlist names, user input
- **Bounds checking**: Rating (0–5), volume (0–1), EQ gains (−12 to +12 dB)

### Database
- **Parameterized queries**: Prevent SQL injection throughout
```rust
conn.execute("INSERT INTO tracks (path) VALUES (?1)", params![path])?;
```

### File Access
- **User-initiated only**: Tauri dialog for folder selection
- **Tauri v2 capabilities**: Filesystem, dialog, shell permissions configured in `src-tauri/capabilities/`
- **No arbitrary access**: Restricted to user-chosen folders

---

## Troubleshooting

### No Sound
- Check volume in both VPlayer and system
- Verify audio device in Options → Audio tab
- VPlayer auto-recovers after long pauses or device changes

### Missing Tracks
- Run "Check Missing Files" in Options → Library tab
- Re-scan folder if files were moved
- Check file permissions

### Slow Performance
- Use "Vacuum Database" in Options → Advanced tab
- Disable visualizer if not needed
- Large libraries benefit from the incremental scan (only processes changes)

### Import Failed
- Check M3U/PLS file paths are correct
- Use absolute paths for reliability
- Ensure referenced tracks exist and are accessible

---

## Code Style

### Rust
- Use `cargo fmt` for formatting
- Handle errors with `Result<T, AppError>` (custom error type in `error.rs`)
- Document public APIs with `///` comments

### TypeScript / React
- Functional components with hooks
- Hooks and services are `.ts`; components are `.jsx` (gradual migration to `.tsx`)
- Extract business logic to custom hooks — keep components focused on rendering
- Use granular Zustand selectors, never destructure the entire store

### Commit Messages
Follow conventional commits:
- `feat: Add feature description`
- `fix: Fix bug description`
- `docs: Update documentation`
- `refactor: Code restructuring`

---

## Resources

- [Tauri v2 Documentation](https://v2.tauri.app/)
- [React Documentation](https://react.dev/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Rodio Audio Library](https://github.com/RustAudio/rodio)
- [Zustand](https://github.com/pmndrs/zustand)

---

## License & Support

See LICENSE file for details.

**Issues**: https://github.com/Veno89/Vplayer/issues  
**Discussions**: https://github.com/Veno89/Vplayer/discussions

---

**Version**: 0.9.15 | **Updated**: February 2026
