# Runtime Hardening Soak-Test Plan

This document outlines the manual soak-testing scenarios required to fully validate the stale-session resilience and runtime hardening of VPlayer.

These scenarios must be verified on a physical machine, as they involve OS-level power states and physical hardware changes that cannot be reliably simulated in a CI/CD environment.

## Soak Test Checklist

Please execute the following scenarios and verify that the application recovers without requiring a manual process restart:

- [ ] **Overnight Idle:** Leave the app open and paused overnight (8+ hours). Verify that the UI remains responsive and playback resumes instantly the next morning.
- [ ] **Sleep/Wake (Paused):** Put the computer to sleep while playback is paused. Wake the computer and press play. The audio engine should proactively detect the long sleep (inactivity > 5 mins) and rebuild the audio subsystem seamlessly.
- [ ] **Sleep/Wake (Playing):** Put the computer to sleep while audio is actively playing. Wake the computer. Playback should either resume automatically or pause gracefully without deadlocking the Tauri backend.
- [ ] **Massive Library Scan:** Run a full scan on a directory containing 10,000+ tracks. Verify that the UI (scrolling, clicking tabs) remains responsive and does not freeze for long durations, thanks to the new 500-track database chunking.
- [ ] **Scan Cancellation:** During a large scan, press "Cancel". Verify that the scan halts immediately, UI state resets correctly, and no partial DB locks remain.
- [ ] **Scan Timeout Recovery:** Simulate a scan timeout (e.g., by scanning an extremely slow network drive or artificially lowering the timeout in `TauriAPI.ts`). Verify that the frontend throws a toast error, resets the loading spinner, and issues a background cancellation ID to halt the backend thread.
- [ ] **Rapid Track Switching After Wake:** Immediately after waking the PC from sleep, rapidly skip through 5-10 tracks. Verify that the audio reinitialization logic (`is_reinitializing` flag) prevents multiple WASAPI threads from blocking concurrently.
- [ ] **Hardware Disconnect (Audio):** Unplug the active audio output device (e.g., USB headphones) while playing. Verify that the app pauses or handles the error gracefully. Plug it back in and verify playback can be restored.
- [ ] **Hardware Disconnect (Storage):** Unplug the external drive containing the music library during an active scan. Verify that the scan errors out cleanly without leaving zombie threads or locking the database.

## Success Criteria
The ultimate success criterion for this phase is **zero required restarts**. If VPlayer can survive all 9 scenarios above without a hard freeze or process restart, the runtime hardening audit is considered fully successful.
