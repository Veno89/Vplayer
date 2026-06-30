# VPlayer Runtime Hardening Audit

## Architecture Overview

VPlayer uses a standard Tauri architecture:
*   **Frontend**: React, Zustand for state (persisted to localStorage), Vite. Uses `TauriAPI.ts` as a bridge to invoke backend commands.
*   **Backend**: Rust (`tauri 2.x`), `rusqlite` for database, `rodio` for audio playback, `lofty` for metadata extraction.
*   **Database**: SQLite with WAL mode enabled. A single `Mutex<Connection>` protects DB access.
*   **Audio**: `rodio` is wrapped in an `AudioPlayer` struct with a dedicated broadcast thread that polls playback state every 100ms and emits events (`playback-tick`, `track-ended`, `device-lost`, `device-recovered`) to the frontend.
*   **Library Scanning**: Uses `walkdir` to traverse folders and `lofty` to extract tags. The scan task runs in a `spawn_blocking` pool.

## Most Likely Causes of Stale Freezes (Runtime Risks)

Based on a review of the codebase, here are the most likely causes of the app freezing or hanging indefinitely after being left open for several days:

### 1. Unbounded / Un-timed Tauri Commands (High Risk)
**Evidence**: In `src/services/TauriAPI.ts`, only the audio playback commands (play, pause, stop, seek, changeVolume) use a `withTimeout` wrapper. All other commands—such as `scan_folder`, `get_filtered_tracks`, `get_album_art`, and playlist modifications—await `invoke` indefinitely.
**Why it causes freezes**: If the Rust backend blocks indefinitely on a DB lock, a deadlocked mutex, or a blocked file read (e.g. `lofty` encountering a malformed file), the frontend Promise will never resolve. This leaves the UI in a permanent "loading" or unresponsive state that can only be fixed by restarting the app.
**Fix**: Introduce a configurable timeout for ALL backend commands in `TauriAPI.ts`.

### 2. SQLite Connection Head-of-Line Blocking (High Risk)
**Evidence**: `src-tauri/src/database.rs` uses a single `Mutex<Connection>` (`pub conn: Mutex<Connection>`). The `scan_folder` command performs a huge transaction (inserting potentially thousands of tracks) at the end of the scan.
**Why it causes freezes**: While the `scan_folder` transaction holds the Mutex, *every other database call in the app is blocked*. Furthermore, `PRAGMA busy_timeout` is missing in `database_schema.rs`. While the Rust Mutex serializes access inside the app, if any external process (or another internal bug) holds an OS lock on the DB, `rusqlite` will instantly fail with "database is locked".
**Fix**: Add `PRAGMA busy_timeout=5000` to `database_schema.rs`. Ensure large transactions are chunked or that they yield the lock.

### 3. Uncancellable Library Scans (Medium Risk)
**Evidence**: `src-tauri/src/commands/library_scan.rs` calls `Scanner::scan_directory(..., None)`. The `cancel_flag` is explicitly set to `None`.
**Why it causes freezes**: A user triggering a scan on a massive directory (or a network drive that drops offline) cannot cancel the scan. The `spawn_blocking` thread will run indefinitely, potentially consuming memory or blocking on I/O.
**Fix**: Wire up a cancellation token for `scan_folder` and `scan_folder_incremental` so the frontend can abort stuck scans.

### 4. Audio Device Sleep/Wake Issues (Medium Risk)
**Evidence**: `audio/mod.rs` contains a proactive `device_lost` check and recovery loop, which is excellent. However, `get_inactive_duration` uses `Instant::now()`, which on some OSes behaves unpredictably across system sleep/hibernate cycles.
**Why it causes freezes**: If `Instant` math goes haywire after a sleep cycle, the app might falsely trigger immediate timeouts or fail to recognize that a long pause occurred.
**Fix**: Ensure recovery mechanisms handle sleep gracefully. Add a "Soft Restart" or "Diagnose" button in the frontend to explicitly re-init the audio engine if it gets stuck.

### 5. Memory Growth via Album Art (Low/Medium Risk)
**Evidence**: `get_album_art` fetches base64 strings directly into the frontend. `CoverArtArchive.ts` caches cover art in `localStorage` up to 500 items, but memory leaks could occur if large album arts are kept in React state unbounded.
**Fix**: Verify component lifecycle for album art. Prefer object URLs with `URL.revokeObjectURL` or ensure base64 strings are garbage collected when components unmount. (To be handled gracefully by browser GC, but worth monitoring).

## Implementation Order

1. **Diagnostics (Phase 3)**: Add a lightweight diagnostic command (`get_runtime_diagnostics`) to Rust, returning uptime, active locks (if trackable), and audio health. Expose this in the UI (e.g. an "App Health" overlay or console).
2. **Command Timeouts (Phase 4)**: Update `TauriAPI.ts` to wrap ALL `invoke` calls with `withTimeout`. Implement a smart timeout strategy (e.g., short timeouts for UI queries, long timeouts for scans, but never infinite).
3. **Database Hardening (Phase 6)**: Add `PRAGMA busy_timeout=5000` to `database_schema.rs`.
4. **Scan Cancellation (Phase 7)**: Introduce an `AtomicBool` cancel flag in the backend state, and a new `cancel_scan` command. Pass this flag into `Scanner::scan_directory`.
5. **Sleep/Wake & Recovery (Phase 10 & 11)**: Add global error boundaries in React, and a manual "Recover Audio System" / "Reset State" developer tool for when the app enters an unrecoverable state.
