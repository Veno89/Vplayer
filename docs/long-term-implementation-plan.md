# Long-Term Implementation Plan (Post v0.9.23)

Date: 2026-03-01
Source: docs/architecture-audit.md (Section 17)

## Scope
This plan covers the remaining long-term items not yet implemented:
1. Typed error propagation end-to-end (`AppError` over raw `String` where practical)
2. Large-library IPC strategy for track loading (`get_all_tracks` pagination/chunking)
3. DSP pipeline optimization (effect-stage block processing)
4. Backend integration test harness (command-level coverage)
5. Album ReplayGain mode implementation

Note: Database decomposition is already completed and released in v0.9.23.

## Guiding Constraints
- Preserve user-visible behavior by default.
- Keep backward compatibility at API boundaries during migration.
- Ship in small slices with feature flags or compatibility paths where needed.
- Add tests before removing old code paths.

## Delivery Order
1. Typed error propagation
2. Integration test harness
3. Track list pagination/chunked loading
4. Album ReplayGain mode
5. DSP block-processing refactor

Rationale:
- Error typing and test harness reduce risk for all later work.
- Pagination affects high-traffic code paths and should land before heavier DSP refactors.
- Album ReplayGain adds user-visible value with manageable blast radius.
- DSP block refactor is the highest regression risk and should be last, with better test coverage already in place.

## Milestone M1: Typed Error Propagation (1 sprint)

### Goals
- Standardize backend command errors on structured `AppError` internally.
- Minimize `map_err(|e| e.to_string())` boilerplate.
- Keep frontend compatibility by retaining existing message formatting in `TauriAPI._formatError`.

### Tasks
- Introduce conversion helpers for command handlers:
  - `type CmdResult<T> = Result<T, AppError>`
  - helper traits/functions for common `Result<T, E>` conversion.
- Migrate commands module-by-module:
  - Start with low-risk modules (`cache`, `smart_playlist`, `playlist`), then `library`, `audio`.
- Normalize error categories in `error.rs` for common failure types:
  - Validation, NotFound, Io, Db, Audio, Decode, Timeout.
- Keep command signatures stable where needed by adding compatibility wrappers if a direct migration is disruptive.

### Acceptance Criteria
- At least 80% of commands use `Result<T, AppError>` internally.
- No behavior regressions in existing frontend tests.
- All migrated commands return consistent message shape through existing frontend error formatter.

## Milestone M2: Integration Test Harness (1 sprint, overlaps M1)

### Goals
- Add command-level and DB integration safety net.
- Enable confidence for pagination and DSP refactors.

### Tasks
- Create `src-tauri/tests/` integration suite:
  - setup helper to create temp/in-memory DB and app state stubs.
  - command-focused tests for critical flows:
    - library load/filter paths
    - playlist create/add/remove/reorder
    - smart playlist execution
    - migration boot path
- Add CI-friendly test command profile (non-GUI backend tests only).
- Add fixtures for representative track metadata and edge cases.

### Acceptance Criteria
- `src-tauri/tests` exists with documented test entrypoint.
- Critical command flows covered by passing integration tests.
- New PRs can run these tests reproducibly in CI.

## Milestone M3: Large Library Track Loading Strategy (1 sprint)

### Goals
- Remove dependence on monolithic `get_all_tracks` payload for very large libraries.
- Keep UI responsive for 50k+ track scenarios.

### Tasks
- Backend:
  - Add paginated command, e.g. `get_tracks_page(offset, limit, sort, filter)`.
  - Add total count command or include total in paged response.
- Frontend:
  - Add data-access abstraction in `TauriAPI` and library hook:
    - initial page load
    - incremental fetch while scrolling/searching.
  - Keep existing `get_all_tracks` as fallback during transition.
- Add simple cache policy for fetched pages in memory.

### Acceptance Criteria
- Library window renders first content quickly without loading entire DB into memory.
- Existing filter/search/sort behavior remains correct.
- Fallback path can be disabled after validation window.

## Milestone M4: Album ReplayGain Mode (1 sprint)

### Goals
- Implement functional `album` ReplayGain mode end-to-end.
- Keep current `track` mode behavior unchanged.

### Tasks
- Backend:
  - Extend ReplayGain storage model to include album-level gain metadata.
  - Add/extend analysis flow to compute album gain from grouped tracks.
- Frontend:
  - Update `useReplayGain` to apply album gain when mode is `album`.
  - Ensure mode switching clears stale gain state correctly.
- Add tests:
  - track mode unaffected
  - album mode applies shared gain consistently per album.

### Acceptance Criteria
- `album` mode is no longer placeholder behavior.
- Gain transitions do not produce unexpected volume spikes/drops.
- Mode semantics are documented in README.

## Milestone M5: DSP Effect-Stage Block Processing (1-2 sprints)

### Goals
- Improve CPU efficiency while preserving audio output behavior.
- Refactor from sample-by-sample effect chain to block-oriented stage processing.

### Tasks
- Introduce block buffer API in effects processor:
  - process block through EQ stage, then Bass, Echo, Reverb, SoftClipper.
- Preserve existing lock and fallback safety behavior in `EffectsSource`.
- Add numerical validation tests:
  - bounded output
  - NaN handling
  - equivalence tolerance versus old path on fixture input.
- Add performance benchmark harness for representative buffer sizes.

### Acceptance Criteria
- No regressions in existing audio correctness tests.
- CPU usage reduced in representative playback scenarios.
- Audio artifacts are not introduced in manual validation.

## Rollout Strategy
- Use branch-per-milestone (`m1-typed-errors`, `m2-integration-tests`, etc.).
- Keep each milestone releasable independently.
- For high-risk work (M3, M5), use temporary compatibility flags and remove after one stable release cycle.

## Tracking Board Template
For each milestone, track:
- Scope complete: yes/no
- Tests added: list
- Risks discovered: list
- Release note entry drafted: yes/no
- Audit doc checkbox updates: yes/no

## Immediate Next Step
Start M1 and M2 in parallel:
- M1: migrate `commands/cache.rs` and `commands/smart_playlist.rs` to typed command results.
- M2: scaffold `src-tauri/tests/` with DB setup helper and first integration test for smart playlist execution.
