import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';

/**
 * usePlaybackEffects test suite
 *
 * Tests the side-effect hook that synchronizes the audio engine with the
 * Zustand store (play/pause translation, A-B repeat, position save, play count).
 *
 * After #1 + #4, duration/progress sync is handled by Rust events in useAudio.
 * This hook no longer syncs audio.duration or audio.progress → store.
 *
 * Strategy: we mock `useStore` to return controllable values and spy on
 * store setters / TauriAPI calls.
 */

// ── Mock store values & setters ────────────────────────────────────────────
const storeMock: Record<string, any> = {};

vi.mock('../../store/useStore', () => ({
  useStore: Object.assign(
    // Selector function: (s => s.field) pattern
    (selector: (s: any) => any) => selector(storeMock),
    // Static .getState()
    { getState: () => storeMock },
  ),
}));

// Must import AFTER vi.mock so the module resolution picks up the mock
import { usePlaybackEffects } from '../usePlaybackEffects';

describe('usePlaybackEffects', () => {
  let audioMock: any;
  let toastMock: any;
  let tracks: any[];

  beforeEach(() => {
    vi.clearAllMocks();

    audioMock = {
      isPlaying: false,
      isLoading: false,
      progress: 0,
      duration: 200,
      volume: 0.8,
      audioBackendError: null,
      loadTrack: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      changeVolume: vi.fn().mockResolvedValue(undefined),
      seek: vi.fn().mockResolvedValue(undefined),
    };

    toastMock = {
      showError: vi.fn(),
      showWarning: vi.fn(),
      showSuccess: vi.fn(),
      showInfo: vi.fn(),
    };

    tracks = [
      { id: 'track-1', path: '/music/a.mp3', name: 'a.mp3', duration: 200 },
      { id: 'track-2', path: '/music/b.mp3', name: 'b.mp3', duration: 180 },
    ];

    // Default store state
    Object.assign(storeMock, {
      playing: false,
      setPlaying: vi.fn(),
      setProgress: vi.fn(),
      setDuration: vi.fn(),
      currentTrack: null,
      abRepeat: null,
      volume: 0.8,
      setLastPosition: vi.fn(),
    });

    // Default invoke mock
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'increment_play_count') return Promise.resolve(undefined);
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial volume
  // -------------------------------------------------------------------------
  it('should set initial volume on mount', () => {
    renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    expect(audioMock.changeVolume).toHaveBeenCalledWith(0.8);
  });

  // -------------------------------------------------------------------------
  // Duration & progress sync — REMOVED (#1 + #4)
  // Duration and progress are now written to the store by Rust events
  // in useAudio, not by usePlaybackEffects.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Position save (reads from store progress, not audio.progress)
  // -------------------------------------------------------------------------
  it('should save last position every 5 seconds', () => {
    storeMock.progress = 10; // 10 % 5 === 0, so it should trigger

    renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    expect(storeMock.setLastPosition).toHaveBeenCalledWith(10);
  });

  // -------------------------------------------------------------------------
  // A-B Repeat (reads from store progress, not audio.progress)
  // -------------------------------------------------------------------------
  it('should seek to point A when progress passes point B', () => {
    storeMock.abRepeat = { enabled: true, pointA: 10, pointB: 30 };
    storeMock.progress = 31; // past point B

    renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    expect(audioMock.seek).toHaveBeenCalledWith(10);
  });

  it('should not seek when A-B repeat is disabled', () => {
    storeMock.abRepeat = { enabled: false, pointA: 10, pointB: 30 };
    storeMock.progress = 31;

    renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    expect(audioMock.seek).not.toHaveBeenCalled();
  });

  it('should not seek when within A-B range', () => {
    storeMock.abRepeat = { enabled: true, pointA: 10, pointB: 30 };
    storeMock.progress = 20;

    renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    expect(audioMock.seek).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Play / Pause translation
  // -------------------------------------------------------------------------
  it('should call audio.play() when store playing transitions false → true', () => {
    // First render with playing = false
    storeMock.playing = false;
    const { rerender } = renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    // Transition: false → true
    storeMock.playing = true;
    rerender();

    expect(audioMock.play).toHaveBeenCalled();
  });

  it('should call audio.pause() when store playing transitions true → false', () => {
    // Start playing
    storeMock.playing = false;
    const { rerender } = renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    // Transition: false → true
    storeMock.playing = true;
    rerender();

    // Transition: true → false
    storeMock.playing = false;
    rerender();

    expect(audioMock.pause).toHaveBeenCalled();
  });

  it('should not call play/pause when playing state does not change', () => {
    storeMock.playing = false;
    const { rerender } = renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    // Same state again
    rerender();

    expect(audioMock.play).not.toHaveBeenCalled();
    expect(audioMock.pause).not.toHaveBeenCalled();
  });

  it('should show error toast and reset playing if play() rejects', async () => {
    audioMock.play.mockRejectedValueOnce(new Error('Audio device lost'));
    storeMock.playing = false;

    const { rerender } = renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    storeMock.playing = true;
    rerender();

    // Wait for the async .catch
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(toastMock.showError).toHaveBeenCalledWith('Failed to play track');
    expect(storeMock.setPlaying).toHaveBeenCalledWith(false);
  });

  // -------------------------------------------------------------------------
  // Play count increment
  // -------------------------------------------------------------------------
  it('should increment play count when track starts playing', async () => {
    storeMock.playing = true;
    storeMock.currentTrack = 0;

    renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    // Give the effect time to run
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(invoke).toHaveBeenCalledWith('increment_play_count', { trackId: 'track-1' });
  });

  it('should not increment play count when not playing', async () => {
    storeMock.playing = false;
    storeMock.currentTrack = 0;

    renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(invoke).not.toHaveBeenCalledWith('increment_play_count', expect.anything());
  });

  it('should not increment play count when currentTrack is null', async () => {
    storeMock.playing = true;
    storeMock.currentTrack = null;

    renderHook(() =>
      usePlaybackEffects({ audio: audioMock, toast: toastMock, tracks }),
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(invoke).not.toHaveBeenCalledWith('increment_play_count', expect.anything());
  });
});
