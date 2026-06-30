# Performance Optimization Test Plan

## Objective
Verify that the implemented performance optimizations drastically improve the perceived responsiveness of VPlayer, particularly when navigating and searching large libraries, and when rapidly scrolling or switching tracks.

## Environment Setup
To adequately test these optimizations, you must perform tests against a **large library** (e.g., 5,000+ tracks). Using a 10-track folder will not expose virtualization or backend starvation bottlenecks.

## Manual Test Scenarios

### Scenario 1: Search Responsiveness
**Goal:** Verify search filtering does not lag the UI or redundantly reload folders.
1. Load a large library (>5,000 tracks).
2. Rapidly type a multi-character search term (e.g., "The Dark Side").
3. **Expected Result:** The UI should remain fluid while typing. The results should appear within a reasonable debounce window (~250-300ms) without causing the window to freeze.

### Scenario 2: Rapid Scrolling and Album Art Deferral
**Goal:** Verify that fast scrolling does not flood the backend with IPC requests for album art.
1. Scroll rapidly from the top to the bottom of the virtualized library list.
2. Wait 2 seconds.
3. Attempt to play the track at the bottom.
4. **Expected Result:** Playback should begin immediately. The backend should NOT be stuck processing 5,000 discarded album art requests. You should see placeholders briefly, and album art should only load for the tracks where you paused scrolling.

### Scenario 3: Song Switching Latency
**Goal:** Verify track clicks feel instant and cannot time out.
1. Double-click a track to start playback.
2. Rapidly click 10 different tracks in succession as fast as possible.
3. **Expected Result:** The UI should update its playback state instantly. The audio system should cleanly transition to the final clicked track without throwing backend timeout errors.

### Scenario 4: Empty Search Cleanup
**Goal:** Verify that clearing search restores the full library instantly without deep-tree reconciliation hangs.
1. Enter a specific search query that returns only 1 track.
2. Select all text in the search box and delete it in one keystroke.
3. **Expected Result:** The full track list should populate smoothly. The first page (visible rows) should render immediately without the UI locking up for several seconds.

## Performance Validation Checklist

- [ ] Typing in search box feels instant (debounced properly).
- [ ] Clearing search box restores library instantly.
- [ ] Scrolling a 10k track library at maximum speed does not freeze the app.
- [ ] Clicking a track updates the UI play state immediately (optimistic UI).
- [ ] Audio playback starts within 300ms of clicking, even after rapid scrolling.
- [ ] Expanding/collapsing folders does not trigger full-library re-fetches.
- [ ] CPU usage remains near 0% when idling during playback.

---

# Performance Optimization Test Plan Addendum

Update the current performance test plan with measurable validation steps. The goal is not only to confirm that VPlayer feels faster, but also to prove that the specific optimizations are working.

## Required Diagnostics During Testing

Add or expose temporary dev-mode counters for the following:

### Album Art Counters

* `albumArt.requestsScheduled`
* `albumArt.requestsCancelledBeforeStart`
* `albumArt.requestsStarted`
* `albumArt.requestsDeduplicated`
* `albumArt.requestsQueued`
* `albumArt.requestsCompleted`
* `albumArt.requestsFailed`
* `albumArt.maxConcurrentRequests`

During fast scrolling, `requestsStarted` should remain close to the number of rows the user actually pauses on, not the number of rows that were briefly mounted.

### Search/Library Counters

* `library.loadTracksCount`
* `library.loadAllFoldersCount`
* `library.lastSearchDurationMs`
* `library.lastTrackQueryDurationMs`
* `library.staleSearchResultsIgnored`

During search typing, `loadAllFoldersCount` must not increase after initial mount unless folders are actually added, removed, or refreshed manually.

### Playback Counters

* `audio.lastTrackClickToUiUpdateMs`
* `audio.lastTrackClickToBackendInvokeMs`
* `audio.lastTrackClickToPlaybackStartMs`, if measurable
* `audio.stalePlaybackRequestsIgnored`
* `audio.playbackTimeoutCount`

UI feedback should be immediate even if actual audio startup varies by file/device.

---

## Additional Manual Test Scenarios

### Scenario 5: Prove Album Art Flooding Is Fixed

**Goal:** Confirm that fast scrolling no longer creates a massive backend album-art backlog.

1. Open a library with 5,000–10,000+ tracks.
2. Reset album art diagnostics counters.
3. Scroll from top to bottom as fast as possible.
4. Do not pause for more than a fraction of a second on any section.
5. Check album art diagnostics.

**Expected Result:**

* `requestsCancelledBeforeStart` should be high.
* `requestsStarted` should be low relative to total rows scrolled past.
* `maxConcurrentRequests` should never exceed the configured limit.
* Playback/search should remain responsive immediately after scrolling.

---

### Scenario 6: Album Art Deduplication

**Goal:** Confirm duplicate visible requests reuse the same in-flight work.

1. Open a view where several rows share the same album/art source.
2. Reset album art diagnostics.
3. Scroll slowly enough for album art to load.
4. Observe deduplication counters.

**Expected Result:**

* Repeated requests for the same art key should increment `requestsDeduplicated`.
* The backend should not extract/cache the same art repeatedly for visible duplicate rows.

---

### Scenario 7: Stale Album Art Result Protection

**Goal:** Confirm old album art results do not update unmounted or recycled rows.

1. Scroll quickly through the virtualized track list.
2. Stop on a new section before previous art requests complete.
3. Watch for incorrect album art appearing on wrong tracks.
4. Check console/logs for state update warnings.

**Expected Result:**

* No React warnings about state updates after unmount.
* No wrong album art flashes onto unrelated rows.
* Completed stale requests are ignored safely.

---

### Scenario 8: Prove Folder Reloads Do Not Happen During Search

**Goal:** Confirm `loadAllFolders()` is decoupled from search/filter changes.

1. Start VPlayer and load the library.
2. Note `library.loadAllFoldersCount`.
3. Type a 10-character search query quickly.
4. Clear the query.
5. Check `library.loadAllFoldersCount`.

**Expected Result:**

* `loadAllFoldersCount` should not increase during search typing or clearing.
* Only track-loading/search counters should change.

---

### Scenario 9: Search Race Condition Test

**Goal:** Confirm stale search results cannot overwrite newer results.

1. Type a search term rapidly, for example: `d`, `da`, `dar`, `dark`.
2. Immediately delete it and type another unrelated term.
3. Repeat several times.
4. Watch the final visible result set.

**Expected Result:**

* The displayed results must always match the latest search input.
* Older delayed search responses must be ignored.
* `staleSearchResultsIgnored` should increase if old queries complete late.

---

### Scenario 10: Playback While Album Art Is Loading

**Goal:** Confirm album art work no longer starves playback commands.

1. Open a large track list with unloaded album art.
2. Scroll slowly enough that visible album art begins loading.
3. While album art is actively loading, click a track.
4. Repeat several times.

**Expected Result:**

* The clicked track should visually respond immediately.
* Playback should not wait for album art extraction.
* No playback timeout should occur.
* Album art loading should continue in the background without blocking audio.

---

### Scenario 11: Search While Album Art Is Loading

**Goal:** Confirm search stays responsive while art requests are queued/running.

1. Open a large list with many unloaded album art entries.
2. Scroll until album art begins loading.
3. Immediately type into the search box.
4. Clear the search and type another query.

**Expected Result:**

* Search input remains responsive.
* Results update within the debounce window.
* Album art loading does not delay search queries noticeably.

---

### Scenario 12: Search and Playback During Scan

**Goal:** Confirm background scanning does not degrade foreground interactions.

1. Start a large folder scan.
2. While scanning, search the library.
3. While scanning, rapidly switch tracks.
4. While scanning, scroll through the library.
5. Cancel the scan.

**Expected Result:**

* Search remains usable.
* Playback remains responsive.
* Scrolling remains smooth.
* Cancelling scan does not leave stale loading state.
* No album art, scan, or DB work starves playback.

---

### Scenario 13: Zustand Rerender Verification

**Goal:** Confirm playback progress/volume updates do not rerender large library views.

1. Enable React Profiler or lightweight render counters in dev mode.
2. Start playback.
3. Let playback progress update for 30 seconds.
4. Observe `LibraryWindow`, `TrackList`, and track row render counts.
5. Change volume repeatedly.
6. Repeat while search results are visible.

**Expected Result:**

* Progress updates should not rerender the entire library list.
* Volume changes should not rerender unrelated panels.
* Ideally only player/progress components update frequently.
* Track rows should not rerender every second unless their own displayed state changes.

---

## Updated Performance Expectations

* Search typing should feel immediate, with results updating after a short debounce.
* Clearing search should render the first visible page quickly.
* Fast scrolling should not create thousands of backend album-art requests.
* Album art requests should be delayed, deduplicated, concurrency-limited, and safely ignored when stale.
* Playback UI feedback should be immediate.
* Actual audio startup should usually be fast for local files, but UI responsiveness matters more than guaranteeing a strict 300ms in every hardware/device state.
* Folder reloads should not occur during search typing.
* Background scan, album art loading, and search should not starve playback.
* High-frequency playback state should not rerender the full library UI.
