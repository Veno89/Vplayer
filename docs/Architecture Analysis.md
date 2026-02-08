# VPlayer Codebase Deep Analysis

> **Date:** February 8, 2026  
> **Scope:** Full frontend + backend architecture review focusing on SOLID, DRY, KISS principles

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2.x (Rust backend) |
| Frontend | React 18 + Zustand 5 + Tailwind 3 |
| Build | Vite 7, PostCSS |
| Language | ~85% JavaScript, ~15% TypeScript (gradual migration started) |
| Virtualization | react-window |
| Audio backend | rodio + symphonia (Rust) |
| Database | rusqlite (SQLite, bundled) |
| Testing | Vitest + Testing Library (minimal coverage) |

---

## Ranked Improvement Suggestions (Most → Least Critical)

### 1. CRITICAL: God Component in VPlayer.jsx (SRP Violation)

`VPlayer.jsx` is a ~350-line orchestrator that:

- Instantiates **15+ hooks** (audio, player, library, equalizer, crossfade, drag-drop, shortcuts, updater, toast, auto-resize, window configs...)
- Manages **~10 local `useState` calls** + **5 `useRef` workarounds** to prevent stale closures
- Wires **~80 props** through to `useWindowConfigs`, which itself produces JSX for 15 windows
- Contains side-effects for play/pause, track restoration, play count increment, background image conversion, A-B repeat, volume, progress saving...

This is the single biggest architectural debt. It violates SRP, OCP, and makes the entire app fragile — any change to any feature risks breaking unrelated features because everything flows through this one component.

**Recommendation:** Extract a `PlayerController` (or context-provider) that encapsulates audio + player + crossfade + track-loading as a single coherent unit. Use React Context or Zustand selectors to let windows access what they need without prop-drilling through VPlayer.

---

### 2. CRITICAL: Bypassed Service Layer — Inconsistent `invoke()` Usage (DRY Violation)

A well-designed `TauriAPI.ts` singleton exists with logging, error formatting, and type safety. But **50+ direct `invoke()` calls** scatter across the codebase:

| Location | Direct `invoke` calls |
|----------|----------------------|
| `useAudio.js` | ~20 calls (entire audio API) |
| `usePlaylists.js` | 8 calls |
| `VPlayer.jsx` | 1 call |
| `Row.jsx` | 1 call |
| Window files (History, Library, Lyrics, Stats, Options tabs) | ~15 calls |
| Library hooks | 3 calls |

The `TauriAPI` service exists but is mostly unused. The audio hook doesn't use it at all. This means error handling, logging, and user-friendly error messages are inconsistent depending on which code path is hit.

**Recommendation:** Mandate all Tauri communication through `TauriAPI`. Add the missing audio methods to it, and lint/ban direct `invoke()` imports outside of `TauriAPI.ts`.

---

### 3. HIGH: Massive Prop Drilling & useWindowConfigs Anti-Pattern

`useWindowConfigs.jsx` accepts **~70 destructured parameters** and passes them into 15 window components inside a single `useMemo`. This means:

- Every parameter change re-evaluates the memo (the dependency array is **50+ items**)
- All 15 windows are coupled to the same hook
- Adding a new feature to any window requires touching VPlayer.jsx, useWindowConfigs, and the window itself

This is the "prop plumbing" anti-pattern at extreme scale.

**Recommendation:** Each window should be self-contained and read its own state from Zustand or a context. Windows shouldn't receive 15 props — they should `useStore(s => s.playing)` directly. This would eliminate useWindowConfigs entirely.

---

### 4. HIGH: Mixed TypeScript/JavaScript with No Migration Path

The project has `strict: true` in tsconfig but `checkJs: false` — so 85% of the code gets zero type checking. The few `.ts` files (`usePlayer.ts`, `TauriAPI.ts`, `playerSlice.ts`, `types/index.ts`) are typed, but all hooks, components, utilities, and tests remain `.js/.jsx`.

The type definitions in `types/index.ts` are good but have no enforcement on consuming code. `StoreState` is incomplete (only `queue` + 2 methods) while the actual store has 100+ properties.

**Recommendation:** Enable `checkJs: true` incrementally per directory. Rename files starting with the store slices and hooks. Complete the `StoreState` type to cover the full Zustand store shape. This is high ROI because hooks like `useTrackLoading` and `usePlaylists` have real stale-closure and shape-mismatch bugs that types would catch.

---

### 5. HIGH: Stale Closure Epidemic — Ref Workarounds Everywhere

The codebase has **11+ `useRef` instances** solely to work around stale closures:

| File | Refs for stale closure prevention |
|------|----------------------------------|
| `VPlayer.jsx` | `activePlaybackTracksRef`, `playerHookRef`, `repeatModeRef`, `currentTrackRef`, `tracksRef` |
| `useAudio.js` | `onEndedRef`, `onTimeUpdateRef`, `currentTrackRef` |
| `usePlayer.ts` | `tracksRef`, `shuffleRef`, `repeatModeRef`, `currentTrackRef` |

This is a symptom of the architecture: callbacks passed through many layers go stale because the component tree re-renders don't propagate refs correctly. The `onEnded` callback in `useAudio` is the most dangerous — it's called from a `setInterval` that captures old state.

**Recommendation:** Move playback state to Zustand and read it via `useStore.getState()` inside callbacks. This eliminates the need for ref mirroring entirely. The `storeGetter` pattern in `usePlayer.ts` already does this correctly — extend it to `useAudio` and VPlayer.

---

### 6. HIGH: Duplicated State Management — Store vs. localStorage vs. Hooks

State is managed in three parallel systems with no clear ownership:

| State | Zustand Store | localStorage | Hook local state |
|-------|:---:|:---:|:---:|
| Volume | `playerSlice` | `vplayer_volume` in useAudio | `useState` in useAudio |
| EQ bands | — | `vplayer_eq_bands` | `useState` in useEqualizer |
| Crossfade | — | `crossfade_enabled/duration` | `useState` in useCrossfade |
| Last track | — | `vplayer_last_track` | — |
| Last position | — | `vplayer_last_position` | — |
| Last playlist | — | `vplayer_last_playlist` | — |
| Keyboard shortcuts | — | `keyboard-shortcuts` | `useState` in useShortcuts |
| Playlists | — | — | `useState` in usePlaylists |
| Player prefs | `settingsSlice` persists | `STORAGE_KEYS.PREFERENCES` | — |

The `STORAGE_KEYS` constants exist but aren't used consistently — `'vplayer_last_playlist'` is hardcoded as a string in two files. Volume has THREE sources: the store persists it, `useAudio` reads from localStorage on mount, and VPlayer passes it from the store.

**Recommendation:** Consolidate all persistent state into Zustand with `persist` middleware (already used). Remove all direct `localStorage` reads/writes. The store is the single source of truth.

---

### 7. MEDIUM: Duplicated Components (DRY Violation)

- **Two track row components:** `TrackRow` inside `TrackList.jsx` (~140 lines) and `Row.jsx` (~85 lines) — both render a track with rating, but with different feature sets
- **Two track list implementations:** `TrackList` (virtualized) and `SimpleTrackList` in the same file with duplicated keyboard handling
- `AdvancedTab.jsx` and `LibraryStatsWindow.jsx` both call `get_cache_size`, `get_database_size`, `clear_album_art_cache`, `vacuum_database` — identical cache management duplicated

**Recommendation:** Unify `TrackRow` and `Row` into a single composable track row component. Move cache/maintenance operations into a shared hook or service.

---

### 8. MEDIUM: Inadequate Test Coverage

| What's tested | What's NOT tested |
|--------------|-------------------|
| usePlayer navigation logic | useAudio (entire audio engine) |
| DiscographyMatcher | useLibrary, useTrackLoading |
| ErrorHandler | usePlaylists, usePlaylistActions |
| 2 component render tests | useDragDrop, useAutoResize, useCrossfade |
| | All 15 window components |
| | Zustand store slices |
| | TauriAPI service |

The test setup in `setupTests.js` is incomplete — no mock for `@tauri-apps/api/window`, `TauriAPI`, or most `invoke` commands. Component tests have **prop mismatches** with actual components (e.g., passing `handleRescanAll` to `LibraryContent` which doesn't accept it).

**Recommendation:** Priority testing targets: (1) Zustand store slices (pure logic, easy to test), (2) `useAudio` with mocked `invoke`, (3) `useTrackLoading` end-to-end flow. Add a proper `TauriAPI` mock to setupTests.

---

### 9. MEDIUM: Security — CSP Disabled, Asset Scope Wide Open

In `tauri.conf.json`:

```json
"security": {
    "csp": null,
    "assetProtocol": { "enable": true, "scope": ["**"] }
}
```

CSP is `null` (disabled) and the asset protocol scope is `**` (every file on the system). This means the app can read any file on the user's machine via the asset protocol, and there's no XSS protection from CSP.

**Recommendation:** Set a proper CSP (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`). Restrict `assetProtocol.scope` to the actual music library folders.

---

### 10. MEDIUM: Module-Level Mutable Globals (React Incompatibility)

`useAutoResize.js` and `useToast.js` use module-level mutable variables (`isDraggingOrResizing`, `dragEndTimer`, `toastId`). These survive across React StrictMode double-renders, fast refresh, and potential concurrent mode — causing subtle bugs.

**Recommendation:** Replace with `useRef` inside the hook, or move to Zustand if shared state is needed.

---

### 11. MEDIUM: Zustand Store is One Mega-Blob

All slices merge into a single flat store with `persist`. The `partialize` function manually lists every field to persist — ~40 individual properties. There's no type safety on the merged store shape (types exist only for `PlayerSlice`). Adding/removing a persisted field requires editing _two_ places (the slice and `*PersistState`).

**Recommendation:** Consider splitting into separate stores (`usePlayerStore`, `useUIStore`, `useSettingsStore`) each with their own `persist`. This improves performance (selectors are more granular), type safety, and maintainability.

---

### 12. MEDIUM: `@testing-library/react-hooks` in Production Dependencies

`package.json` lists `@testing-library/react-hooks` under `dependencies` instead of `devDependencies`. This ships test utilities in the production bundle.

**Recommendation:** Move to `devDependencies`.

---

### 13. LOW: Browser `alert()`/`confirm()` in Desktop App

`usePlaylistActions.js` uses `window.confirm()` for delete confirmations. This renders an ugly browser dialog in a Tauri desktop app instead of a native dialog or custom modal.

**Recommendation:** Use `@tauri-apps/plugin-dialog` (already a dependency) or a custom React modal.

---

### 14. LOW: Database Migrations via Silent Failures

`database.rs` runs `ALTER TABLE ... ADD COLUMN` and silently discards errors with `let _ =`. This means you can never tell if a migration succeeded or if a column already existed.

**Recommendation:** Implement a proper migration system with a `schema_version` table, or at least check `PRAGMA table_info` before altering.

---

### 15. LOW: Excessive `console.log` in Production Paths

Audio polling, crossfade, drag-drop, track loading all emit verbose console output. For example, `useAudio` logs on every play, pause, seek, recovery attempt. `useDragDrop` logs on every dragover event (can fire hundreds of times per second).

**Recommendation:** Use a log-level system. Strip debug logs in production builds or gate them behind `import.meta.env.DEV`.

---

### 16. LOW: `useEffect` Dependency Suppressions

Several hooks use `// eslint-disable-next-line react-hooks/exhaustive-deps` to suppress stale dependency warnings, notably in `useTrackLoading.js` and `useAudio.js`. These are symptoms of the stale closure issue (finding #5) rather than legitimate exceptions.

---

## Cross-Cutting Findings Detail

### Direct `invoke` bypassing TauriAPI service

| File | Occurrences |
|------|------------|
| `useAudio.js` | ~20 (entire audio API) |
| `usePlaylists.js` | 8 (all playlist CRUD) |
| `HistoryWindow.jsx` | 2 |
| `DiscographyWindow.jsx` | 1 |
| `LyricsWindow.jsx` | 1 |
| `LibraryWindow.jsx` | 3 |
| `LibraryStatsWindow.jsx` | 5 |
| `AdvancedTab.jsx` | 4 |
| `AudioTab.jsx` | 1 |
| `useLibraryScanner.js` | 2 |
| `useLibraryData.js` | 1 |
| `Row.jsx` | 1 |
| `VPlayer.jsx` | 1 |

**Total: 50+ direct `invoke` calls** that should route through `TauriAPI` for consistency, error handling, and testability.

### Direct `localStorage` usage (bypassing store and constants)

| File | Usage |
|------|-------|
| `usePlaylists.js` | `getItem('vplayer_last_playlist')` |
| `usePlaylistActions.js` | `getItem/removeItem('vplayer_last_playlist')` |
| `useAudio.js` | `getItem(STORAGE_KEYS.PLAYER_STATE)`, `setItem('vplayer_volume')` |
| `useEqualizer.js` | `getItem/setItem(STORAGE_KEYS.EQ_BANDS)` |
| `useCrossfade.js` | `getItem/setItem` for crossfade settings |
| `useShortcuts.js` | `getItem('keyboard-shortcuts')` |
| `useTrackLoading.js` | `getItem/setItem('vplayer_last_track/position')` |
| `VPlayer.jsx` | `getItem/setItem` for last track/position |

The key `'vplayer_last_playlist'` isn't even defined in `STORAGE_KEYS` in constants.js.

### Stale Closure / useRef Workarounds

| File | Pattern |
|------|---------|
| `VPlayer.jsx` | 5 refs mirroring state for `onEnded` callback |
| `useAudio.js` | `onEndedRef`, `onTimeUpdateRef` to avoid recreating polling interval |
| `usePlayer.ts` | `tracksRef`, `shuffleRef`, `repeatModeRef`, `currentTrackRef` |
| `useReplayGain.js` | `lastAppliedTrackRef` |
| `useLibraryScanner.js` | `autoScanDoneRef`; stale `refreshFolders` in `[]` deps effect |
| `useAutoResize.js` | `lastResizeRef`, `debounceTimer`, module-level globals |

### Excessive Prop Drilling

- `useWindowConfigs` — **~70 parameters**
- `usePlaylistActions` — **15 parameters**
- `TrackList / TrackRow` — **25+ props** via `itemData` object
- `TrackRow`'s `data` object carries 20+ fields

### Large Functions/Components (100+ lines)

| File | Entity | Lines |
|------|--------|-------|
| `VPlayer.jsx` | `VPlayerInner` | ~350 |
| `TrackList.jsx` | `TrackList` | ~170 |
| `TrackList.jsx` | `TrackRow` | ~140 |
| `useWindowConfigs.jsx` | `useWindowConfigs` | ~300 |
| `usePlaylistActions.js` | `usePlaylistActions` | ~175 |
| `useLibraryScanner.js` | `useLibraryScanner` | ~165 |
| `useDragDrop.js` | `useDragDrop` | ~170 |
| `useAudio.js` | `useAudio` | ~300 |

---

## Principle Violations Summary

| Principle | Violation | Severity |
|-----------|-----------|----------|
| **SRP** | VPlayer.jsx orchestrates everything; useWindowConfigs builds all 15 windows | Critical |
| **OCP** | Adding any feature requires modifying VPlayer + useWindowConfigs + the window | Critical |
| **DIP** | Hooks depend on concrete `invoke()` calls instead of the `TauriAPI` abstraction | High |
| **DRY** | Duplicate row components, duplicate cache management, duplicate state (store vs localStorage) | High |
| **KISS** | 11 ref-based stale closure workarounds, 70-param hook, triple state management system | High |
| **ISP** | Single mega Zustand store blob exposing 100+ properties to every consumer | Medium |

---

## Key Takeaway

The Rust backend is well-structured — clean module separation, proper error types, and logical command grouping. The debt is concentrated on the frontend. The **single highest-impact refactor** would be making windows self-sufficient (reading from the store directly) which would eliminate `useWindowConfigs`, slash `VPlayer.jsx` by 70%, and kill most of the prop drilling chain.

---

## Remediation Plan

The plan is structured in 5 phases. Each phase builds on the previous one such that the app remains functional after every phase. Phases are ordered by impact-to-effort ratio — the first two phases resolve the critical and high-severity issues while being minimally disruptive.

### Phase 1: Consolidate the Service & State Layers (Fixes #2, #6, #12)

**Goal:** Single source of truth for all backend communication and all persistent state.

**Estimated effort:** 2–3 days

#### Step 1.1 — Route all `invoke()` through TauriAPI

1. Add all missing methods to `TauriAPI.ts`:
   - Audio commands: `playAudio`, `pauseAudio`, `stopAudio`, `getPosition`, `isPlaying`, `isFinished`, `recoverAudio`, `getInactiveDuration`, `hasAudioDeviceChanged`, `isAudioDeviceAvailable`
   - Watcher commands: `startFolderWatch`, `stopFolderWatch`
   - Stats/maintenance: `getPerformanceStats`, `vacuumDatabase`, `clearAlbumArtCache`, `getCacheSize`, `getDatabaseSize`
   - Any other `invoke` calls found in window components
2. Find-and-replace all direct `invoke()` imports in `.js/.jsx` files (50+ occurrences):
   - Replace `import { invoke } from '@tauri-apps/api/core'` with `import { TauriAPI } from '@/services/TauriAPI'`
   - Replace each `invoke('command_name', { params })` with the corresponding `TauriAPI.methodName(params)`
3. Add an ESLint rule (or a comment convention) banning direct `invoke` imports outside `TauriAPI.ts`.
4. Verify by searching the codebase for remaining `invoke(` calls — only `TauriAPI.ts` should have them.

#### Step 1.2 — Consolidate localStorage into Zustand persist

1. Move these to the appropriate Zustand slices (all already use `persist` middleware):
   - `vplayer_last_track` / `vplayer_last_position` → `playerSlice` persisted state
   - `vplayer_last_playlist` → `playerSlice` or new `playlistSlice`
   - `vplayer_eq_bands` → `settingsSlice`
   - `crossfade_enabled` / `crossfade_duration` → `settingsSlice`
   - `keyboard-shortcuts` → `settingsSlice`
   - `vplayer_volume` → already in `playerSlice`, remove the localStorage duplicate
2. Delete all `localStorage.getItem/setItem` calls from hooks (useAudio, useEqualizer, useCrossfade, useShortcuts, useTrackLoading, usePlaylists, usePlaylistActions, VPlayer.jsx).
3. Update hooks to read from the store: `useStore(s => s.lastTrackId)` etc.
4. Add the missing key `LAST_PLAYLIST` to `STORAGE_KEYS` constant (for reference/documentation) even though we no longer access localStorage directly.

#### Step 1.3 — Move test dependency

1. Move `@testing-library/react-hooks` from `dependencies` to `devDependencies` in `package.json`.

---

### Phase 2: Break the God Component (Fixes #1, #3, #5)

**Goal:** VPlayer.jsx goes from ~350 lines / 15 hooks to a thin shell. Windows become self-contained. Stale closure refs are eliminated.

**Estimated effort:** 4–5 days

#### Step 2.1 — Create a PlayerProvider context

1. Create `src/context/PlayerContext.tsx`:
   ```tsx
   // Encapsulates: useAudio + usePlayer + useTrackLoading + useCrossfade
   // Exposes via context: play, pause, next, prev, seek, volume controls,
   //   current track data, progress, duration, loading state, audio errors
   ```
2. The provider reads playback state from Zustand (`useStore`) and calls `TauriAPI` methods — no prop-passing needed.
3. Inside callbacks (onEnded, onTimeUpdate), use `useStore.getState()` instead of refs. This eliminates the 5 stale-closure refs in VPlayer and the 3 in useAudio.
4. Wrap `<App>` with `<PlayerProvider>` in `main.jsx`.

#### Step 2.2 — Make windows self-sufficient

For each of the 15 windows, convert from props-based to store-based:

1. **PlayerWindow:** `const { playing, progress, duration, volume } = useStore(s => ({ ... }))` + `const { handleNextTrack, handleSeek } = usePlayerContext()`
2. **PlaylistWindow:** reads `tracks`, `currentTrack` from store; reads playlist state from `usePlaylists` hook internally
3. **LibraryWindow:** uses `useLibrary()` hook directly (it already composes sub-hooks)
4. **EqualizerWindow:** uses `useEqualizer()` directly
5. **OptionsWindow:** reads settings from `useStore` directly
6. Repeat for all 15 windows.

Each window change is independent — can be done one at a time with the app staying functional.

#### Step 2.3 — Delete useWindowConfigs

1. Once all windows read their own state, `useWindowConfigs.jsx` reduces to just a static registry:
   ```js
   export const WINDOW_REGISTRY = [
     { id: 'player', title: 'Player', icon: Music, component: PlayerWindow },
     { id: 'playlist', title: 'Playlist', icon: List, component: PlaylistWindow },
     // ...
   ];
   ```
2. `WindowManager` renders each window's component directly — no pre-built JSX with 70 props.
3. VPlayer.jsx shrinks to: render `PlayerProvider` + `WindowManager` + `ThemeEditor` + `Onboarding` + `UpdateBanner`. (~50 lines)

#### Step 2.4 — Clean up VPlayer.jsx

1. Move the remaining effects out of VPlayer:
   - Background image conversion → `useUIState` or a dedicated hook
   - Onboarding check → `useOnboarding` hook
   - Auto-resize logic → stays in `useAutoResize` but triggered by WindowManager
2. Remove all `useRef` stale-closure workarounds (now handled by `useStore.getState()` in PlayerProvider).
3. Final VPlayer.jsx should be < 80 lines.

---

### Phase 3: TypeScript Migration & Store Typing (Fixes #4, #11)

**Goal:** Full type safety across the codebase. Store is properly typed and optionally split.

**Estimated effort:** 3–4 days

#### Step 3.1 — Complete Store types

1. Define full interfaces for each slice in `src/store/types.ts`:
   - `UISliceState` + `UISliceActions`
   - `SettingsSliceState` + `SettingsSliceActions`
   - `MusicBrainzSliceState` + `MusicBrainzSliceActions`
   - Already done: `PlayerSliceState` + `PlayerSliceActions`
2. Define the combined `AppStore` type as the intersection.
3. Type the `useStore` export: `export const useStore = create<AppStore>()(persist(...))`
4. Optionally split into separate stores (`usePlayerStore`, `useUIStore`, `useSettingsStore`) each with their own `persist` — this improves selector granularity and makes type inference per-store simpler.

#### Step 3.2 — Rename files to .ts/.tsx

Priority order (highest value first):
1. **Store slices:** `uiSlice.js` → `.ts`, `settingsSlice.js` → `.ts`, `musicBrainzSlice.js` → `.ts`
2. **Hooks:** `useAudio.js` → `.ts`, `useLibrary.js` → `.ts`, `useTrackLoading.js` → `.ts`, `useEqualizer.js` → `.ts`, `useCrossfade.js` → `.ts`, `usePlaylists.js` → `.ts`, `useStoreHooks.js` → `.ts`
3. **Services:** `MusicBrainzAPI.js` → `.ts`, `CoverArtArchive.js` → `.ts`, `DiscographyMatcher.js` → `.ts`
4. **Components:** All `.jsx` → `.tsx`

For each rename:
- Add types to function parameters and return values
- Replace `any` with proper interfaces from `types/index.ts`
- Fix type errors that emerge (these are likely real bugs)

#### Step 3.3 — Enable stricter checking

1. In `tsconfig.json`, set `"checkJs": true` to catch issues in any remaining JS files.
2. Set `"noUnusedLocals": true` and `"noUnusedParameters": true` to clean up dead code.

---

### Phase 4: DRY Cleanup & Testing (Fixes #7, #8, #10, #13, #15, #16)

**Goal:** Eliminate duplicated code, bring test coverage to a useful baseline, fix React-incompatible patterns.

**Estimated effort:** 3–4 days

#### Step 4.1 — Unify track row components

1. Create a single `TrackRow` component in `src/components/TrackRow.tsx` that supports:
   - Optional album art (via prop `showAlbumArt`)
   - Optional rating (via prop `showRating`)
   - Optional context menu (via prop `contextMenuItems`)
   - Drag-and-drop support (via prop `draggable`)
2. Replace the `TrackRow` inside `TrackList.jsx` and the standalone `Row.jsx` with this unified component.
3. Remove `SimpleTrackList` — use `TrackList` with virtualization disabled (or a small threshold).

#### Step 4.2 — Extract shared cache/maintenance hook

1. Create `src/hooks/useMaintenanceActions.ts`:
   ```ts
   export function useMaintenanceActions() {
     return {
       getCacheSize: () => TauriAPI.getCacheSize(),
       getDatabaseSize: () => TauriAPI.getDatabaseSize(),
       clearAlbumArtCache: () => TauriAPI.clearAlbumArtCache(),
       vacuumDatabase: () => TauriAPI.vacuumDatabase(),
       getPerformanceStats: () => TauriAPI.getPerformanceStats(),
     };
   }
   ```
2. Use in both `AdvancedTab.jsx` and `LibraryStatsWindow.jsx` instead of duplicated `invoke` calls.

#### Step 4.3 — Fix module-level globals

1. **useAutoResize:** Move `isDraggingOrResizing` and `dragEndTimer` from module scope into a Zustand atom or `useRef` inside the hook. Export `notifyDragStart`/`notifyDragEnd` as store actions instead of module functions.
2. **useToast:** Move the `toastId` counter into a `useRef` inside the hook.

#### Step 4.4 — Replace browser dialogs with native/custom ones

1. In `usePlaylistActions.js`, replace `window.confirm()` calls with `@tauri-apps/plugin-dialog` `confirm()` or a custom `<ConfirmDialog>` modal component.
2. Replace any `window.alert()` calls similarly.

#### Step 4.5 — Add production log gating

1. Create a `src/utils/logger.ts` module:
   ```ts
   const isDev = import.meta.env.DEV;
   export const log = {
     debug: (...args: any[]) => isDev && console.log(...args),
     warn: (...args: any[]) => console.warn(...args),
     error: (...args: any[]) => console.error(...args),
   };
   ```
2. Replace `console.log` calls in `useAudio`, `useCrossfade`, `useDragDrop`, `useTrackLoading`, `usePlayer` with `log.debug`.
3. Remove the dragover debug log entirely from `useDragDrop`.

#### Step 4.6 — Establish testing baseline

1. **Setup:** Expand `setupTests.js`:
   - Add a proper mock for `TauriAPI` (since all code now goes through it, one mock covers everything)
   - Add mock for `@tauri-apps/api/window` (`getCurrentWindow`, `LogicalSize`)
   - Fix the prop mismatches in existing component tests
2. **Store tests (highest ROI):** Add `playerSlice.test.ts`, `uiSlice.test.ts`, `settingsSlice.test.ts` — these are pure functions, no DOM needed:
   ```ts
   // Example: test queue operations, shuffle, A-B repeat, window toggling, layout application
   ```
3. **Hook tests:** Add tests for `useAudio` (with TauriAPI mock), `useTrackLoading`, `usePlaylists`.
4. **Integration test:** Expand the existing `VPlayer.test.jsx` to test the core flow: mount → load tracks → play → next → pause.

---

### Phase 5: Security & Backend Hardening (Fixes #9, #14)

**Goal:** Production-grade security posture and reliable database migrations.

**Estimated effort:** 1–2 days

#### Step 5.1 — Enable CSP and restrict asset scope

1. In `tauri.conf.json`, set:
   ```json
   "security": {
     "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: https:; connect-src 'self' https://musicbrainz.org https://coverartarchive.org https://github.com",
     "assetProtocol": {
       "enable": true,
       "scope": ["$APPDATA/**", "$HOME/Music/**"]
     }
   }
   ```
2. Test that album art loading, background images, and MusicBrainz API calls still work.
3. Dynamically add library folder paths to the asset scope when users add folders (Tauri 2 supports runtime scope modification).

#### Step 5.2 — Implement proper database migrations

1. Add a `schema_version` table to `database.rs`:
   ```rust
   conn.execute(
       "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
       [],
   )?;
   ```
2. Replace the `let _ = conn.execute("ALTER TABLE ...")` pattern with versioned migrations:
   ```rust
   fn run_migrations(conn: &Connection) -> Result<()> {
       let current_version = get_schema_version(conn)?;
       
       if current_version < 1 {
           conn.execute("ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0", [])?;
           conn.execute("ALTER TABLE tracks ADD COLUMN last_played INTEGER DEFAULT 0", [])?;
           set_schema_version(conn, 1)?;
       }
       if current_version < 2 {
           conn.execute("ALTER TABLE tracks ADD COLUMN rating INTEGER DEFAULT 0", [])?;
           set_schema_version(conn, 2)?;
       }
       // ... etc for each migration
       Ok(())
   }
   ```
3. Log each migration as it runs. If a migration fails, it fails loudly instead of silently.

---

### Summary Timeline

| Phase | Focus | Effort | Fixes | Status |
|-------|-------|--------|-------|--------|
| **Phase 1** | Service & state consolidation | 2–3 days | #2, #6, #12 | ✅ COMPLETE |
| **Phase 2** | Break the God Component | 4–5 days | #1, #3, #5 | ⏳ Next |
| **Phase 3** | TypeScript migration | 3–4 days | #4, #11 | |
| **Phase 4** | DRY cleanup & testing | 3–4 days | #7, #8, #10, #13, #15, #16 | |
| **Phase 5** | Security & backend | 1–2 days | #9, #14 | |
| **Total** | | **13–18 days** | All 16 findings | |

### Phase 1 Completion Notes

**Step 1.1 — Route all invoke() through TauriAPI** ✅
- Added 19 new methods to `TauriAPI.ts`
- Migrated 50+ direct `invoke()` calls across 20+ files
- Only `TauriAPI.ts` now imports `invoke` from `@tauri-apps/api/core`

**Step 1.2 — Consolidate localStorage into Zustand persist** ✅
- Added to `playerSlice.ts`: `lastTrackId`, `lastPosition`, `lastPlaylistId` (with setters and persist config)
- Added to `settingsSlice.js`: `eqBands`, `crossfadeEnabled`, `crossfadeDuration`, `keyboardShortcuts`, `onboardingComplete` (with setters and persist config)
- Migrated 15 files from direct `localStorage` access to Zustand store reads/writes
- Remaining intentional localStorage usage: API caches (`CoverArtArchive.js`, `MusicBrainzAPI.js`), discography cache in `musicBrainzSlice.js`, and reset functionality in `AdvancedTab.jsx`

**Step 1.3 — Move test dependency** ✅
- Moved `@testing-library/react-hooks` from `dependencies` to `devDependencies`

**Bonus fixes during Phase 1:**
- Fixed null-safety issues with `tracks` being null in `useWindowConfigs.jsx`, `PlayerWindow.jsx`, `usePlayer.ts`, `useTrackLoading.js`, `VPlayer.jsx` (pre-existing bugs surfaced by test improvements)
- Fixed `vitest.config.js` to extend Vite config via `mergeConfig`, ensuring the automatic JSX runtime (`@vitejs/plugin-react`) is available in tests — eliminated `React is not defined` errors in `PlaylistSelector.jsx`
- All 54 tests pass with 0 errors, exit code 0

### Dependency Graph

```
Phase 1 (service + state layer)
    └─► Phase 2 (god component breakup — depends on TauriAPI being consolidated)
         ├─► Phase 3 (TS migration — easier after components are self-contained)
         └─► Phase 4 (DRY + tests — easier after architecture is clean)
Phase 5 (security — independent, can be done in parallel with Phase 3/4)
```

Phases 1 and 2 are the critical path. Phase 5 can run in parallel with anything. Phases 3 and 4 can be interleaved or run in parallel if two people are working.
