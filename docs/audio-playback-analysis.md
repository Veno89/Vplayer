# Audio Playback Architecture Analysis

**Date**: February 2026 | **Version**: 0.9.21

---

## System Overview

VPlayer's audio system is built on an event-driven Rust backend (rodio/CPAL) with a React 19 frontend connected via Tauri IPC. Key architectural patterns:

- **Rust AudioPlayer** coordinates focused sub-modules: `playback_state`, `preload`, `volume_manager`, `device`, `effects`, `visualizer`
- **React hooks** (`useAudio`, `usePlayer`, `useTrackLoading`, `useCrossfade`, `useEqualizer`, `useReplayGain`, `usePlaybackEffects`) provide playback control
- **Zustand store** is the single source of truth for playback state
- **Event bridge**: Rust broadcast thread emits `playback-tick`, `track-ended`, `device-lost` events consumed by React listeners
- **PlayerProvider** orchestrates all hooks and owns the `onEnded` / `onDeviceLost` callbacks

---

## 1. Robustness / Bug Prevention

### Preload invalidation is implicit, not enforced

The preloaded sink is bound to the current audio mixer. If the output device changes, the preloaded sink becomes stale and must be discarded. Today this relies on every code path remembering to call `clear_preload()` — easy to miss. A safer pattern would be a **device generation counter**: each `DeviceState` gets a monotonically increasing generation, and `swap_to_preloaded()` rejects if the preload's generation doesn't match.

### Crossfade can leave volume stuck low

If a track ends abruptly (e.g. shorter than expected, decode error, user skips) while a crossfade is in progress, the fade-out multiplier may be <1.0 and never restored. The `track-ended` listener in `useAudio` should cancel any active crossfade and reset volume to 1.0.

### Seek fallback is too optimistic

The seek path has a complex fallback: seek fails → reload file → seek again → restore volume/playing state. If the reload *also* fails (corrupt file, permissions), the original position and state are lost. Caching pre-seek state and validating restore success would make this safer.

### Mutex poisoning recovery masks bugs

`lock_or_recover()` silently replaces poisoned Mutex contents with a default. This is fine for `PlaybackState` (pure data), but if it ever wraps mutable effects state, silent recovery could produce glitchy audio. Consider switching to `parking_lot::Mutex` which never poisons — simpler and faster.

---

## 2. Architecture / Code Quality

### PlayerProvider is a God Object

`PlayerProvider.tsx` orchestrates 5+ hooks (`useAudio`, `usePlayer`, `useTrackLoading`, `useCrossfade`, `useLibrary`) and owns the `onEnded` / `onDeviceLost` callbacks that wire everything together. This makes it the single point of failure and the hardest file to reason about. Consider splitting into:

- `AudioEngine` — manages `useAudio` + device events
- `PlaybackController` — manages `usePlayer` + `useTrackLoading` + queue logic
- `EffectsController` — manages crossfade + EQ + ReplayGain

These could be composed via a simple pub/sub or by each registering with a shared `PlaybackBus`.

### Stale closure escape hatch is fragile

`usePlayer` uses `storeGetter()` to read fresh Zustand state inside `useCallback` to avoid stale closures. This works but is non-obvious and easy to regress — anyone adding a new dependency might forget. Two better patterns:

- Use Zustand's `useStore.getState()` directly (it's always fresh, no hook needed)
- Add an ESLint rule or code comment convention that flags direct state reads in callbacks

### Duplicate timeout/retry logic

`useAudio` has its own `withTimeout` and `retryWithBackoff` implementations. `TauriAPI` also does timeout wrapping. These should be consolidated into a shared `src/utils/resilience.ts` module.

### Effects chain ordering is hardcoded

The Rust `EffectsProcessor` always runs: EQ → Bass Boost → Echo → Reverb → Soft Clipper. If users want reverb before echo, or to disable the soft clipper for mastering-style output, there's no way. A configurable chain (array of effect IDs) would be more flexible and not much more complex.

---

## 3. Testing

### No integration tests for the React playback hooks

The Rust side has unit tests for `PlaybackState` and volume calculations, but none of the React hooks (`usePlayer`, `useAudio`, `useTrackLoading`) have tests. These are the most bug-prone code in the app. Priority tests:

| Test | What it validates |
|------|------------------|
| `useTrackLoading` race condition | Fast skip: load track A, immediately load track B → only B plays |
| `usePlayer.handleNextTrack` | Shuffle + repeat-all + queue interactions produce correct sequence |
| Crossfade cancellation | Track ends during crossfade → volume resets to 1.0 |
| Gapless preload timing | Preload fires at 5s remaining, not before, not after |
| Device reconnection | Simulated device-lost → device restored → play resumes correctly |

These can be tested with a mock `TauriAPI` (replace `invoke` with a spy) and `@testing-library/react` for hook rendering.

### No Rust integration tests for the full audio pipeline

Unit tests exist for individual modules, but nothing tests `AudioPlayer.load() → play() → seek() → preload() → swap()` as a sequence. A test using a short WAV file with a mock output sink (`rodio::Sink::try_new` with a null output) would catch state machine bugs.

### No fuzz testing for effects

The effects chain processes untrusted audio samples. Edge cases like NaN, Infinity, extreme sample rates, or zero-length sources could cause panics or infinite loops. A small property-based test (`proptest` crate) feeding random f32 samples through `EffectsSource` would be valuable.

---

## 4. Performance

### Visualizer pushes every sample through a Mutex lock

`VisualizerBuffer::push()` is called per-sample inside the audio render callback. Even with `try_lock`, this is hot-path contention. A lock-free ring buffer (`ringbuf` crate) would eliminate contention entirely.

### EQ recalculates filter coefficients on every gain change

When any EQ band changes, all 10 bands recalculate coefficients. Since coefficient calculation involves trig functions, batch updates (change all 10 bands, recalculate once) would be more efficient for preset switching.

### Broadcast thread polls even when idle

The adaptive sleep (100ms playing, 1s idle) is good, but when the app is minimized and nothing is playing, it could sleep for 5–10s or use a `Condvar` to wake only on state change.

---

## 5. Features / UX Gaps

### No audio normalization preview

ReplayGain is applied silently. A small gain indicator (e.g. "-3.2 dB" next to the volume slider) would help users understand why some tracks are quieter.

### No crossfade + gapless interplay

Currently crossfade and gapless are mutually exclusive (gapless only fires when crossfade is disabled). A hybrid mode — use gapless preloading *for* the crossfade target — would give smoother crossfades without loading delay at the transition point.

### Balance control is stored but unused

`VolumeManager` stores a stereo balance value and `TauriAPI.setBalance()` / `getBalance()` exist, but no UI exposes it. Either wire up a balance slider in the EQ panel or remove the dead code path.

### No playback statistics / history

Play count is incremented but there's no listening history, skip rate, or "most played" view. The store already tracks enough to power this with minimal new state.

### No keyboard-accessible seek

Arrow keys for ±5s seek and Shift+Arrow for ±30s would be a natural addition alongside the existing shortcuts.

---

## Priority Ranking

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Cancel crossfade on track-ended | Small | Prevents stuck-low-volume bug |
| **P0** | Preload device generation counter | Small | Prevents silent playback failures |
| **P1** | Hook integration tests (mock TauriAPI) | Medium | Catches regressions in most-changed code |
| **P1** | Consolidate timeout/retry into shared util | Small | Reduces duplication, easier to maintain |
| **P1** | Lock-free visualizer buffer | Small | Removes hot-path contention |
| **P2** | Split PlayerProvider into focused controllers | Medium | Reduces coupling, easier to test |
| **P2** | Rust pipeline integration tests | Medium | Catches state machine bugs |
| **P2** | Balance slider UI | Small | Completes an existing feature |
| **P3** | Configurable effects chain order | Medium | Power-user feature |
| **P3** | Hybrid crossfade + gapless | Medium | Smoother crossfade UX |
| **P3** | Fuzz testing for effects | Small | Safety net for edge cases |
