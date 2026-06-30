# Performance Optimization Audit

## Context and Architecture
VPlayer relies on a Tauri + Rust backend and a React + Zustand frontend. The core interactions rely heavily on asynchronous IPC commands between React and Rust, passing large JSON payloads for track metadata and using SQLite for storage. 

While the application has been stabilized for long-running sessions, certain synchronous flows, excessive React state updates, and untamed backend I/O tasks are creating noticeable friction and latency in daily usage.

## Major Bottlenecks

### 1. Album Art Backend Flooding (Confirmed)
- **Evidence:** `AlbumArt.tsx` initiates `TauriAPI.extractAndCacheAlbumArt` immediately upon mounting. Because `TrackList` relies on `react-window` virtualization, rapidly scrolling through thousands of tracks mounts and unmounts hundreds of `AlbumArt` components per second.
- **Problem:** Even if a component unmounts instantly because it scrolled off-screen, the IPC call is already in flight. The Rust backend then sequentially processes hundreds of `extract_and_cache_album_art` requests, extracting image data from files and writing to SQLite `track_album_art`.
- **User Impact:** Massive CPU/Disk spike during fast scrolling, UI stutter, and backend command delays for *other* actions (like "Play" or "Search") while the thread pool chews through a backlog of discarded album art requests.
- **Recommended Fix:** Implement a debounce/cancellation layer. `AlbumArt.tsx` should wait 150-250ms before initiating the IPC call. If it unmounts before the timer fires, the request is never sent.
- **Files Involved:** `src/components/AlbumArt.tsx`
- **Risk Level:** Low

### 2. Redundant Folder Reloads on Search (Confirmed)
- **Evidence:** In `useLibraryData.ts`, the `useEffect` that initializes the library calls *both* `loadTracks()` and `loadAllFolders()`. However, `loadTracks` is a dependency of this effect (because it changes whenever `filterParams` change).
- **Problem:** Every time the user types a character in the search box (updating `activeParams`), React re-runs this effect, triggering an unnecessary DB query and state update for `libraryFolders`.
- **User Impact:** Unnecessary UI re-renders and database reads during rapid searching, creating perceived search lag.
- **Recommended Fix:** Decouple `loadAllFolders` into a separate `useEffect` that runs only on mount (or when a folder is actually added/removed).
- **Files Involved:** `src/hooks/library/useLibraryData.ts`
- **Risk Level:** Low

### 3. Track Loading Race Conditions and Eager React State (Confirmed)
- **Evidence:** `useLibraryData.ts` implements pagination (`getTracksPage`) but immediately pushes the *entire* accumulated result set of up to thousands of tracks into a single React array `setTracks([...allTracks])`.
- **Problem:** While this provides the illusion of pagination, it still incurs the heavy memory overhead and deep React tree reconciliation of pushing massive JSON arrays into state.
- **User Impact:** Noticeable freeze/lag when searching or clearing a search across a 10,000+ track library.
- **Recommended Fix:** The current implementation has a clever hack (`if (!firstPageRendered) { setTracks([...allTracks]); }`) that prioritizes the first 1,000 results. However, we can optimize the dependency array to ensure the UI paints the first chunk instantly without blocking on the rest of the array accumulation.
- **Files Involved:** `src/hooks/library/useLibraryData.ts`
- **Risk Level:** Medium

### 4. Audio Playback Timeout Risk (Speculative/Likely)
- **Evidence:** `useAudio.ts` wraps `TauriAPI.loadTrack` in a `withTimeout(..., BACKEND_TIMEOUT_MS)`.
- **Problem:** If the backend is flooded (e.g., from album art extraction during scrolling), the critical path for audio playback can time out before the backend even processes it.
- **User Impact:** Clicking a track while the app is "busy" results in a failed playback attempt or a long delay.
- **Recommended Fix:** Ensure audio playback commands are prioritized, or at least ensure the backend isn't starved by Album Art requests (fixed via Bottleneck #1). We can also apply immediate optimistic UI feedback indicating the track was clicked.
- **Files Involved:** `src/hooks/useAudio.ts`, `src/hooks/useTrackLoading.ts`
- **Risk Level:** Low

### 5. Inefficient Zustand Persistence (Likely)
- **Evidence:** `useStore.ts` and `playerSlice.ts` manage `activePlaybackTracks` (which can contain thousands of full track objects).
- **Problem:** While `playerPersistState` correctly avoids persisting `activePlaybackTracks` to localStorage, Zustand still performs shallow equality checks across this massive array whenever unrelated state (like `progress` or `volume`) changes ~60 times a second.
- **User Impact:** Micro-stutters during playback.
- **Recommended Fix:** Move high-frequency update state (`progress`, `volume`) to a separate lightweight store, OR ensure components select state using very narrow, equality-checked selectors.
- **Files Involved:** `src/store/useStore.ts`, `src/store/slices/playerSlice.ts`
- **Risk Level:** Medium

## Implementation Order
1. **Fix Album Art Flooding:** Add a debounce timer to `AlbumArt.tsx`. (Highest impact on scrolling and overall responsiveness).
2. **Decouple Folder Reloads:** Fix the `useEffect` in `useLibraryData.ts`. (Immediate search speedup).
3. **Optimistic Audio UI / Timeout checks:** Ensure `useAudio.ts` and track clicking feels instant.
4. **Zustand Selector Audits:** Verify `LibraryWindow` and `PlayerWindow` use narrow selectors to prevent massive re-renders.
