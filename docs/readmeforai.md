# VPlayer — AI Implementation Guide

> **Purpose:** This document is the primary context file for any AI agent working on the VPlayer codebase. Read this before making changes.

---

## 1. Role & Mindset

You are a senior desktop application engineer and systems architect with deep experience in Rust, Tauri, audio pipelines, and React-based UIs. You are methodical, defensive in your coding style, and prioritize correctness and long-term maintainability.

**You think in systems, not features.**

### Core Principles

| Principle | Meaning |
|-----------|---------|
| **No Isolated Features** | Every feature must be fully wired: UI → IPC → backend → persistence → playback. |
| **Native First** | Rust owns performance-critical logic. JS/React never compensates for backend flaws. |
| **SOLID / DRY / KISS** | Follow established architectural patterns. See `docs/Architecture Analysis.md` for current status. |
| **Precision Over Speed** | Correct abstractions beat rushed functionality. |
| **No God Objects** | No single module controls playback, state, UI, and persistence. |

---

## 2. Project Overview

**VPlayer** is a native Windows music player with modern UX and rock-solid audio performance.

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
| Icons | lucide-react | 0.278 |

### Key Capabilities

- Large music library support (SQLite-indexed)
- Gapless playback via Rust audio pipeline
- Metadata editing (lofty tag read/write)
- Crossfade, EQ, ReplayGain, A-B repeat
- MusicBrainz / CoverArtArchive integration
- Customizable themes, adjustable window layout
- Auto-updater (tauri-plugin-updater)

---

## 3. Tech Stack Details

### TypeScript Configuration

- `allowJs: true`, `checkJs: false` — **gradual migration** in progress
- Components and windows are `.jsx`; hooks, services, store, and types are `.ts` / `.tsx`
- Core files already converted: `PlayerProvider.tsx`, `AppContainer.tsx`, `Window.tsx`
- `strict: true` is enabled; `noUnusedLocals` / `noUnusedParameters` are off during migration
- Path alias `@/*` → `src/*` is configured but not yet widely used

### State Ownership

| Domain | Owner | Details |
|--------|-------|---------|
| Playback, decoding, timing | **Rust** | Audio commands via Tauri IPC (`invoke`) |
| UI state, settings, themes | **Zustand** | Sliced store with `persist` middleware → `localStorage` key `vplayer-storage` |
| Library data, playlists, history | **SQLite** | Rust-side `rusqlite`; JS reads via IPC |
| Toast notifications | **Zustand** | Global singleton (`useToast` store) |
| Updater state | **Zustand** | Global singleton (`useUpdater` store) |

### Zustand Store Architecture

The store is composed of 4 slices (all in `src/store/slices/`):

| Slice | File | Responsibility |
|-------|------|----------------|
| `playerSlice` | `playerSlice.ts` | Playback state, queue, current track, shuffle/repeat |
| `uiSlice` | `uiSlice.ts` | Window positions/visibility, themes, color schemes, layouts |
| `settingsSlice` | `settingsSlice.ts` | User preferences (DRY pattern with `SETTINGS_DEFAULTS` + auto-generated setters) |
| `musicBrainzSlice` | `musicBrainzSlice.ts` | MusicBrainz integration state |

Access with: `useStore(s => s.someProperty)` — always use **granular selectors** to avoid unnecessary re-renders.

### PlayerContext (React Context)

`PlayerProvider.tsx` is a thin orchestrator that composes hooks and provides actions to the component tree:

- **Does NOT hold scalar state** — windows read `useStore(s => s.playing)` directly
- **Provides:** audio-engine state, player actions (next/prev/seek/togglePlay), library data, crossfade API
- Side-effects are extracted into `usePlaybackEffects.ts` and `useStartupRestore.ts`
- Typed via `PlayerContextValue` interface (exported from `PlayerProvider.tsx`)

### IPC Bridge

All Rust ↔ JS communication goes through `src/services/TauriAPI.ts`, which wraps Tauri `invoke()` calls. The Rust side exposes **80+ commands** organized in `src-tauri/src/commands/`. Never call `invoke()` directly from components — always go through `TauriAPI`.

---

## 4. Project Structure

```
VPlayer/
├── index.html                          # Vite entry point
├── package.json                        # v0.9.8
├── vite.config.js                      # Vite 7 config
├── vitest.config.js                    # Test config (jsdom environment)
├── tsconfig.json                       # TS config (strict, allowJs)
├── tailwind.config.cjs                 # Tailwind 3 config
├── postcss.config.cjs
│
├── docs/
│   ├── README.md                       # User-facing readme
│   ├── readmeforai.md                  # THIS FILE — AI agent context
│   ├── Architecture Analysis.md        # Detailed code audit & improvement tracker
│   └── Known Bugs & Roadmap.md
│
├── src/                                # ── React Frontend ──
│   ├── main.jsx                        # React root mount
│   ├── App.jsx                         # Top-level <PlayerProvider> + <AppContainer>
│   ├── VPlayer.jsx                     # Main UI shell (updater, shortcuts, window mgr)
│   ├── index.css                       # Global styles + Tailwind directives
│   ├── windowRegistry.jsx              # Window ID → component mapping
│   │
│   ├── components/                     # Reusable UI components
│   │   ├── AppContainer.tsx            # Root layout (theme, toast, drag-drop, bg image)
│   │   ├── Window.tsx                  # Draggable/resizable window shell (typed props)
│   │   ├── WindowManager.jsx           # Renders all visible windows from registry
│   │   ├── Toast.jsx                   # ToastContainer + individual Toast rendering
│   │   ├── ErrorBoundary.jsx           # React error boundary wrapper
│   │   ├── ContextMenu.jsx             # Right-click context menu
│   │   ├── TrackList.jsx               # Virtualized track list + SimpleTrackList
│   │   ├── AlbumArt.jsx                # Album artwork display
│   │   ├── StarRating.jsx              # 5-star rating component
│   │   ├── Modal.jsx                   # Generic modal wrapper
│   │   ├── AdvancedSearch.jsx          # Library advanced filter UI
│   │   ├── AutoSizer.jsx              # Container size measurement
│   │   ├── LibraryContent.jsx          # Library list view content
│   │   ├── PlaylistContent.jsx         # Playlist list view content
│   │   ├── TrackInfoDialog.jsx         # Track metadata info popup
│   │   ├── UpdateComponents.jsx        # UpdateBanner component
│   │   └── playlist/                   # Playlist sub-components
│   │       ├── index.js                # Barrel export
│   │       ├── PlaylistColumnHeaders.jsx
│   │       ├── PlaylistDialogs.jsx
│   │       ├── PlaylistHeader.jsx
│   │       ├── PlaylistSearchBar.jsx
│   │       └── PlaylistSelector.jsx
│   │
│   ├── context/
│   │   └── PlayerProvider.tsx          # Typed React context (PlayerContextValue)
│   │
│   ├── hooks/                          # Custom React hooks (all TypeScript)
│   │   ├── useAudio.ts                 # Rust audio engine bridge (play/pause/seek/volume)
│   │   ├── usePlayer.ts                # Player actions (next/prev/seek/volume)
│   │   ├── useTrackLoading.ts          # Track loading pipeline + error recovery
│   │   ├── usePlaybackEffects.ts       # Audio↔store sync, play/pause translation, A-B repeat
│   │   ├── useStartupRestore.ts        # Resume last track on app launch
│   │   ├── useCrossfade.ts             # Crossfade engine
│   │   ├── useEqualizer.ts             # EQ controls
│   │   ├── useReplayGain.ts            # ReplayGain normalization
│   │   ├── useLibrary.ts               # Composed library hook (data + filters + scanner)
│   │   ├── useToast.ts                 # Global toast store (Zustand singleton)
│   │   ├── useUpdater.ts               # Global updater store (Zustand singleton)
│   │   ├── useShortcuts.ts             # Keyboard shortcuts
│   │   ├── useAutoResize.ts            # Auto-resize main window to fit content
│   │   ├── useDragDrop.ts              # File/folder drag-drop handling
│   │   ├── useWindowInteraction.ts     # useDraggable + useResizable hooks for Window
│   │   ├── useStoreHooks.ts            # Derived store hooks (useCurrentColors)
│   │   ├── useDebounce.ts              # Debounce utility hook
│   │   ├── useDiscography.ts           # MusicBrainz discography fetching
│   │   ├── useMaintenanceActions.ts    # DB maintenance actions
│   │   ├── usePlaylistActions.ts       # Playlist CRUD actions
│   │   ├── usePlaylists.ts             # Playlist data management
│   │   ├── library/                    # Library sub-hooks
│   │   │   ├── useLibraryData.ts       # Track/folder data loading
│   │   │   ├── useLibraryFilters.ts    # Search, sort, advanced filters
│   │   │   └── useLibraryScanner.ts    # Library scan orchestration
│   │   └── __tests__/
│   │       └── usePlayer.test.js
│   │
│   ├── services/                       # External service wrappers
│   │   ├── TauriAPI.ts                 # Central IPC bridge (ALL Rust invoke calls)
│   │   ├── ErrorHandler.ts             # Structured error handling
│   │   ├── MusicBrainzAPI.ts           # MusicBrainz REST API client
│   │   ├── CoverArtArchive.ts          # Cover art fetching
│   │   ├── DiscographyMatcher.ts       # Album/track matching logic
│   │   └── __tests__/
│   │
│   ├── store/                          # Zustand global state
│   │   ├── useStore.ts                 # Store creation (persist + slice composition)
│   │   ├── types.ts                    # All store type definitions
│   │   ├── slices/
│   │   │   ├── index.ts               # Barrel export
│   │   │   ├── playerSlice.ts
│   │   │   ├── uiSlice.ts
│   │   │   ├── settingsSlice.ts       # DRY: SETTINGS_DEFAULTS + auto-setters
│   │   │   └── musicBrainzSlice.ts
│   │   └── __tests__/
│   │
│   ├── types/
│   │   └── index.ts                    # Shared TS interfaces (Track, AudioService, Toast, etc.)
│   │
│   ├── utils/
│   │   ├── constants.ts               # App-wide constants (AUDIO, EQ_PRESETS, EVENTS, ERRORS)
│   │   ├── formatters.ts             # Time/size/string formatting utilities
│   │   ├── colorSchemes.ts           # Built-in color scheme definitions
│   │   ├── logger.ts                  # Structured logger (dev/prod)
│   │   └── nativeDialog.ts           # Native file/folder dialog wrappers
│   │
│   ├── windows/                       # Individual window implementations
│   │   ├── PlayerWindow.jsx           # Main playback controls
│   │   ├── LibraryWindow.jsx          # Music library browser
│   │   ├── PlaylistWindow.jsx         # Playlist management
│   │   ├── QueueWindow.jsx            # Play queue
│   │   ├── EqualizerWindow.jsx        # Equalizer UI
│   │   ├── VisualizerWindow.jsx       # Audio visualizations
│   │   ├── LyricsWindow.jsx           # Lyrics display
│   │   ├── MiniPlayerWindow.jsx       # Compact player mode
│   │   ├── AlbumViewWindow.jsx        # Album detail view
│   │   ├── DiscographyWindow.jsx      # Artist discography (MusicBrainz)
│   │   ├── HistoryWindow.jsx          # Play history
│   │   ├── LibraryStatsWindow.jsx     # Library statistics
│   │   ├── TagEditorWindow.jsx        # Metadata tag editor
│   │   ├── ThemeEditorWindow.jsx      # Theme customization
│   │   ├── ShortcutsWindow.jsx        # Keyboard shortcuts reference
│   │   ├── SmartPlaylistsWindow.jsx   # Rule-based playlists
│   │   ├── OnboardingWindow.jsx       # First-run wizard
│   │   ├── OptionsWindowEnhanced.jsx  # Settings (tabbed)
│   │   └── options/                   # Settings tab sub-components
│   │       ├── AdvancedTab.jsx
│   │       ├── AppearanceTab.jsx
│   │       ├── AudioTab.jsx
│   │       ├── BehaviorTab.jsx
│   │       ├── LibraryTab.jsx
│   │       ├── PerformanceTab.jsx
│   │       ├── PlaybackTab.jsx
│   │       ├── SettingsComponents.jsx
│   │       └── WindowsTab.jsx
│   │
│   └── __tests__/
│       └── VPlayer.test.jsx
│
└── src-tauri/                         # ── Rust Backend ──
    ├── Cargo.toml                     # Rust dependencies
    ├── tauri.conf.json                # Tauri app config (window, bundle, updater)
    ├── build.rs
    ├── capabilities/                  # Tauri v2 permission capabilities
    ├── icons/                         # App icons
    └── src/
        ├── main.rs                    # Tauri app setup, command registration, global shortcuts
        ├── database.rs                # SQLite schema, migrations, queries
        ├── scanner.rs                 # Filesystem music scanner
        ├── error.rs                   # Error types
        ├── effects.rs                 # Audio effects (top-level)
        ├── lyrics.rs                  # Lyrics parsing/fetching
        ├── playlist_io.rs            # Playlist import/export (M3U, PLS, etc.)
        ├── replaygain.rs             # ReplayGain analysis
        ├── smart_playlists.rs        # Smart playlist rule engine
        ├── validation.rs             # Input validation
        ├── visualizer.rs             # Audio visualization data
        ├── watcher.rs                # Filesystem watcher for library changes
        ├── audio/                    # Audio engine
        │   ├── mod.rs                # AudioPlayer struct, playback state machine
        │   ├── device.rs             # Audio device selection
        │   ├── effects.rs            # DSP effects chain
        │   └── visualizer.rs         # FFT / visualization feed
        └── commands/                 # Tauri IPC command handlers
            ├── mod.rs                # Command module registration
            ├── audio.rs              # Play, pause, seek, volume, etc.
            ├── library.rs            # Add/remove folders, scan, search
            ├── playlist.rs           # Playlist CRUD
            ├── smart_playlist.rs     # Smart playlist evaluation
            ├── lyrics.rs             # Lyrics commands
            ├── effects.rs            # EQ, effects commands
            ├── replaygain.rs         # ReplayGain commands
            ├── visualizer.rs         # Visualization data commands
            ├── watcher.rs            # Filesystem watcher commands
            └── cache.rs              # Cache management
```

---

## 5. Non-Negotiable Rules

1. **Strict project structure:** Follow the directory layout above. New hooks go in `src/hooks/`, new windows in `src/windows/`, new commands in `src-tauri/src/commands/`.
2. **Clear Rust ↔ UI boundary:** UI never touches audio internals directly. All IPC goes through `TauriAPI.ts`.
3. **No blocking the UI:** All heavy operations run async or off the main thread.
4. **Data-driven library:** Tracks, albums, artists are loaded from the database — not inferred ad hoc.
5. **No "Move On" rule:** A feature is not complete unless it is usable end-to-end.
6. **Granular store selectors:** Always `useStore(s => s.field)`, never `useStore()` which subscribes to everything.
7. **Singleton hooks for global concerns:** `useToast()` and `useUpdater()` are Zustand singletons — safe to call from anywhere; all callers share the same state.
8. **No `window.*` globals:** Do not attach state to `window`. Use Zustand stores or React context.

---

## 6. Common Patterns & Conventions

### Adding a New Window

1. Create `src/windows/MyWindow.jsx` (or `.tsx`)
2. Register it in `src/windowRegistry.jsx` with an ID, title, icon, default position/size
3. The `WindowManager` will automatically render it when toggled via `useStore(s => s.toggleWindow)('myWindow')`

### Adding a New Rust Command

1. Add the handler function in the appropriate `src-tauri/src/commands/*.rs` file
2. Register the command in `src-tauri/src/main.rs` `invoke_handler`
3. Add the TypeScript wrapper in `src/services/TauriAPI.ts`
4. Call it from hooks/components via `TauriAPI.myCommand()`

### Adding a New Setting

Settings use a DRY pattern in `settingsSlice.ts`:

1. Add the default value to `SETTINGS_DEFAULTS` in `settingsSlice.ts`
2. Add the type to `SettingsSliceState` in `store/types.ts`
3. A setter (`setMyNewSetting`) is auto-generated — no manual wiring needed
4. Persistence is automatic (all `SETTINGS_DEFAULTS` keys are persisted)

### Toast Notifications

```ts
// From any hook or component:
const toast = useToast();
toast.showSuccess('Library scan complete');
toast.showError('Failed to load track');
toast.showWarning('Large file detected');
toast.showInfo('Crossfade enabled');
```

---

## 7. Testing

| Command | Purpose |
|---------|---------|
| `npm test` | Run vitest in watch mode |
| `npx vitest run` | Single test run (CI-style) |
| `npm run tauri:dev` | Launch full Tauri dev build |
| `npm run tauri:build` | Production build |

Test files live next to the code they test (e.g., `LibraryContent.test.jsx`) or in `__tests__/` subdirectories. The test environment is `jsdom` with Tauri API mocks in `src/test/setupTests.js`.

---

## 8. Quality Bar

Before declaring any feature "done":

- [ ] Rust code compiles cleanly (`cargo check` / `cargo build`)
- [ ] UI renders without errors (no console errors)
- [ ] Feature works end-to-end (UI → IPC → backend → persistence → back to UI)
- [ ] State is synchronized correctly (Zustand store ↔ audio engine ↔ database)
- [ ] No blocking operations on UI thread
- [ ] No TODOs, stubs, or unused code left behind
- [ ] Errors are handled, not ignored (use `ErrorHandler` service or toast)
- [ ] Tests pass (`npx vitest run` — 76 tests across 7 files as of last audit)

---

## 9. Known Gotchas

- **Mixed JS/TS codebase:** Hooks and services are `.ts`, most components are still `.jsx`. Don't add new `.js` files — use `.ts` or `.tsx`.
- **`checkJs: false`:** The `.jsx` files get **zero** type checking. When touching a `.jsx` file heavily, consider converting it to `.tsx`.
- **Audio is Rust-only:** There is no `<audio>` HTML element. All playback goes through Rust IPC via `useAudio.ts` → `TauriAPI.ts` → Rust `AudioPlayer`.
- **PlayerContext vs. useStore:** Use `usePlayerContext()` for actions that need the audio engine. Use `useStore(s => s.x)` for scalar state reads. Never destructure the entire context or store.
- **Settings slice convention:** Individual setters (`setVolume`, `setShuffle`, etc.) are auto-generated. You can also use `updateSetting('key', value)` generically.
- **Window layout is persisted:** The Zustand `persist` middleware saves window positions/sizes. Changes to default window configs in `uiSlice.ts` only affect fresh installs.
- **Tauri v2 capabilities:** Permissions for filesystem, dialog, shell, etc. are configured in `src-tauri/capabilities/`. New plugin permissions must be added there.
- **Test mocks:** Tauri `invoke` is mocked in `src/test/setupTests.js`. When adding new IPC commands, add corresponding mocks or tests will fail.
