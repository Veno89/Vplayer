# Fix: Wrong Track Display After Auto-Advance

## Deep Dive Analysis

### The Symptom
After a song finishes playing and the player auto-advances to the next track, the
player window and playlist window both display the **wrong song** as currently playing.

### Architecture Overview (Current)

The playback identity chain from track-end to UI display:

```
Rust: track-ended event
  → useAudio.ts: onEndedRef.current()
    → AudioEngineContext: playerHookRef.current.handleNextTrack()
      → usePlayer.ts: getNextTrackIndex() → setCurrentTrack(nextIdx)
        → playerSlice: set({ currentTrack: nextIdx, progress: 0 })
          → useTrackLoading: loads activePlaybackTracks[currentTrack]
          → PlayerWindow: displays playbackTracks[currentTrack]
          → PlaylistWindow: highlights displayTracks[currentTrack]
```

**The fundamental problem**: `currentTrack` is a **raw numeric index** into
`activePlaybackTracks`. There is no authoritative track ID stored alongside it.
Every display component does a blind `array[index]` lookup. If the index and the
array ever desync — even briefly — the wrong track displays everywhere.

---

## Root Causes Found (5 issues)

### Issue 1 — No ID-based source of truth (CRITICAL)

`setCurrentTrack(idx)` stores only a numeric index:

```ts
// playerSlice.ts
setCurrentTrack: (track) => {
    set({ currentTrack: track, progress: 0 });
},
```

No track ID is stored atomically. All display paths do blind index lookups:
- `PlayerWindow`: `tracks[currentTrack]` 
- `PlaylistWindow`: highlights row `currentTrack`
- `getCurrentTrackData()`: `activePlaybackTracks[currentTrack]`

If the index becomes stale for *any* reason, every surface shows the wrong track
with zero self-healing capability.

### Issue 2 — Gapless preload + shuffle: destructive double-shift (CONFIRMED BUG)

`getNextTrackIndex()` destructively `shift()`s from `shuffleOrderRef.current`.
It is called **multiple times** per track transition:

| Call site | When | Effect |
|-----------|------|--------|
| Preload effect (usePlayer L233) | ~5s before track end | `shift()` → index A |
| Crossfade monitor (usePlayer L176) | Near track end (if enabled) | `shift()` → index B |
| `handleNextTrack` (usePlayer L269) | At track end | `shift()` → index C |

Each call consumes a **different** shuffle index. The preloaded track (A) differs
from the track selected by handleNextTrack (B or C). Then `useTrackLoading` blindly
swaps to the preloaded track → **audio plays track A, UI shows track C**.

Even without shuffle, this creates a latent risk if the preload and handleNextTrack
read from different array snapshots.

### Issue 3 — Preload swap doesn't verify track identity (CONFIRMED BUG)

In `useTrackLoading.ts`, the gapless swap path:

```ts
const track = currentTracks[currentTrack]; // UI expects this track
const hasPreloaded = await TauriAPI.hasPreloaded();
if (hasPreloaded) {
    await TauriAPI.swapToPreloaded(); // Swaps to WHATEVER was preloaded
    usedPreload = true;
}
```

No check that the preloaded content matches `track`. The Rust side's
`swap_to_preloaded()` returns whatever `PreloadManager` holds, regardless of
what the frontend now expects to play.

### Issue 4 — displayTracks vs activePlaybackTracks one-render lag

`PlaylistWindow.displayTracks` is a locally computed `useMemo`. It is synced to
`store.activePlaybackTracks` via a `useEffect` (the sync effect). But effects run
**after** the render. During the render where `displayTracks` recomputes:

- `displayTracks[currentTrack]` → shows NEW array's track at that index
- `activePlaybackTracks[currentTrack]` → still has OLD array's track

The playlist highlight and the player window can show different tracks for one
render frame. The sync effect fixes it next render, but the flash is visible.

### Issue 5 — `setCurrentTrack` doesn't update `lastTrackId`

When `handleNextTrack` calls `setCurrentTrack(nextIdx)`, `lastTrackId` stays
pointing to the **previous** track. It's only updated when `useTrackLoading`
finishes loading (async, 10-200ms later). If `setActivePlaybackTracks` runs in
this window and falls back to `lastTrackId` for remapping, it uses the wrong ID.

---

## Fix Plan

### Phase 1: Add `currentTrackId` as authoritative source of truth

**Goal**: Make the track *identity* (not position) the primary playback pointer.

1. **Add `currentTrackId: string | null` to `PlayerSliceState`**
   - Initial value: `null`
   - Persisted alongside `lastTrackId` (or replace it)

2. **Modify `setCurrentTrack(idx)` to atomically store the ID**
   ```ts
   setCurrentTrack: (trackIndex) => set((state) => {
       const tracks = state.activePlaybackTracks;
       const trackId = trackIndex !== null && tracks[trackIndex]
           ? tracks[trackIndex].id
           : null;
       return { currentTrack: trackIndex, currentTrackId: trackId, progress: 0 };
   }),
   ```

3. **Modify `getCurrentTrackData()` to verify + self-heal**
   ```ts
   getCurrentTrackData: () => {
       const state = get();
       if (!state.currentTrackId) return null;
       // Fast path: index matches ID
       const atIndex = state.activePlaybackTracks[state.currentTrack ?? -1];
       if (atIndex?.id === state.currentTrackId) return atIndex;
       // Self-heal: find by ID, fix stale index
       const idx = state.activePlaybackTracks.findIndex(
           t => t.id === state.currentTrackId
       );
       if (idx !== -1) {
           set({ currentTrack: idx });
           return state.activePlaybackTracks[idx];
       }
       return null;
   },
   ```

4. **Modify `setActivePlaybackTracks(tracks)` to use `currentTrackId`**
   ```ts
   setActivePlaybackTracks: (tracks) => set((state) => {
       const trackId = state.currentTrackId;
       if (!trackId) return { activePlaybackTracks: tracks };
       const remapped = tracks.findIndex(t => t.id === trackId);
       return {
           activePlaybackTracks: tracks,
           currentTrack: remapped !== -1 ? remapped : null,
           // currentTrackId stays the same — the ID doesn't change
       };
   }),
   ```

### Phase 2: Fix UI components to use ID-based lookup

1. **PlayerWindow** — use `getCurrentTrackData()` (from store) instead of
   `tracks[currentTrack]`

2. **PlaylistWindow** — derive `displayCurrentTrack` from `currentTrackId`:
   ```ts
   const currentTrackId = useStore(s => s.currentTrackId);
   const displayCurrentTrack = useMemo(() => {
       if (!currentTrackId) return null;
       return displayTracks.findIndex(t => t.id === currentTrackId);
   }, [currentTrackId, displayTracks]);
   ```
   This eliminates the need for index-to-index mapping between arrays.

3. **MiniPlayerWindow** — same pattern: look up by ID, not index.

4. **Remove the sync effect** in PlaylistWindow that tries to reconcile
   `displayTracks` ↔ `activePlaybackTracks` indices. With ID-based display,
   the sync effect only needs to call `setActivePlaybackTracks(displayTracks)`
   when the display array changes — the index remap is handled by the store.

### Phase 3: Fix preload + shuffle interaction

1. **Split `getNextTrackIndex` into peek/consume**
   - `peekNextTrackIndex()` — returns the next index WITHOUT shifting shuffle
   - `consumeNextTrackIndex()` — shifts shuffle (only called by handleNextTrack)
   - Preload and crossfade monitoring use `peek`; only `handleNextTrack` `consume`s

2. **Add track path verification to preload swap**
   ```ts
   // In useTrackLoading:
   const preloadedPath = await TauriAPI.getPreloadedPath(); // New Rust command
   if (preloadedPath === track.path) {
       await TauriAPI.swapToPreloaded();
       usedPreload = true;
   } else {
       await TauriAPI.clearPreload();
       await audio.loadTrack(track);
   }
   ```
   - Add `get_preloaded_path` command to Rust (reads from PreloadManager)

### Phase 4: Harden with invariant checks

1. **Dev-mode assertion**: after every `setCurrentTrack`, verify
   `activePlaybackTracks[currentTrack].id === currentTrackId` within 1 tick
2. **Console warning**: if `getCurrentTrackData` self-heals (index != ID), log
   the discrepancy for debugging
3. **Metrics**: count self-heal occurrences to gauge how often desync still occurs

---

## File Change Map

| File | Changes |
|------|---------|
| `src/store/types.ts` | Add `currentTrackId` to `PlayerSliceState` + `PlayerSlice` |
| `src/store/slices/playerSlice.ts` | Phase 1 store changes (setCurrentTrack, getCurrentTrackData, setActivePlaybackTracks) |
| `src/windows/PlayerWindow.tsx` | Use `getCurrentTrackData()` instead of `tracks[currentTrack]` |
| `src/windows/PlaylistWindow.tsx` | ID-based `displayCurrentTrack`, simplify sync effect |
| `src/windows/MiniPlayerWindow.tsx` | Use `getCurrentTrackData()` |
| `src/hooks/usePlayer.ts` | Split getNextTrackIndex into peek/consume; fix preload effect |
| `src/hooks/useTrackLoading.ts` | Verify preloaded path before swap |
| `src-tauri/src/audio/preload.rs` | Add `get_path()` method |
| `src-tauri/src/audio/mod.rs` | Add `get_preloaded_path()` public method |
| `src-tauri/src/commands/audio.rs` | Add `get_preloaded_path` command |
| `src-tauri/src/main.rs` | Register `get_preloaded_path` command |
| `src/services/TauriAPI.ts` | Add `getPreloadedPath()` IPC wrapper |

## Execution Order

1. **Phase 1** first — adds `currentTrackId` and fixes the store. This alone
   fixes the most common desync scenario.
2. **Phase 2** second — makes all UI surfaces use `currentTrackId`. This
   eliminates the display mismatch permanently.
3. **Phase 3** third — fixes the preload/shuffle interaction. Prevents the
   audio-vs-UI mismatch in gapless + shuffle mode.
4. **Phase 4** last — adds assertions for ongoing protection.

Phase 1+2 should fix the reported symptom. Phase 3 fixes a latent audio mismatch
that only manifests with gapless + shuffle.
