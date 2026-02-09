import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * useAudio test suite — event-driven version (#1 + #4)
 *
 * Tests the core audio hook that bridges React to the Rust audio engine.
 * After refactoring, useAudio:
 *  - Reads isPlaying, progress, duration, volume from the Zustand store
 *  - Writes progress/duration via `playback-tick` event listener
 *  - Triggers onEnded via `track-ended` event listener
 *  - No longer polls; no local state for isPlaying/progress/duration/volume
 *
 * TauriAPI is mocked at the @tauri-apps/api/core level (via setupTests.js).
 * listen is mocked at @tauri-apps/api/event level.
 */

// ── Mock store ─────────────────────────────────────────────────────────────
const storeMock: Record<string, any> = {};

vi.mock('../../store/useStore', () => ({
  useStore: Object.assign(
    (selector: (s: any) => any) => selector(storeMock),
    { getState: () => storeMock },
  ),
}));

// Mock AUDIO_RETRY_CONFIG to use tiny delays so retry tests don't time out
vi.mock('../../utils/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    AUDIO_RETRY_CONFIG: {
      MAX_RETRIES: 3,
      INITIAL_DELAY_MS: 1,
      MAX_DELAY_MS: 5,
      BACKOFF_MULTIPLIER: 2,
    },
  };
});

import { useAudio } from '../useAudio';

// ── Captured event listeners ───────────────────────────────────────────────
type ListenerMap = Record<string, ((event: any) => void)[]>;
let listeners: ListenerMap = {};

/** Helper: fire a fake Tauri event to all registered listeners for an event name */
function fireEvent(eventName: string, payload: any) {
  const cbs = listeners[eventName] || [];
  for (const cb of cbs) {
    cb({ event: eventName, id: 0, payload });
  }
}

// Helper mock track
const mockTrack = (overrides = {}) => ({
  id: 'track-1',
  path: '/music/song.mp3',
  name: 'song.mp3',
  title: 'Test Song',
  artist: 'Test Artist',
  duration: 200,
  ...overrides,
});

/** Small real delay to let React effects / micro-tasks flush */
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** Set up a sane default invoke mock */
function setDefaultMock(overrides: Record<string, any> = {}) {
  const defaults: Record<string, any> = {
    is_playing: false,
    get_position: 0,
    get_duration: 200,
    is_finished: false,
    load_track: undefined,
    play_audio: undefined,
    pause_audio: undefined,
    stop_audio: undefined,
    set_volume: undefined,
    seek_to: undefined,
    is_audio_device_available: true,
    has_audio_device_changed: false,
    get_inactive_duration: 0,
    recover_audio: true,
    ...overrides,
  };

  vi.mocked(invoke).mockImplementation((cmd: string) =>
    Promise.resolve(defaults[cmd] ?? null),
  );
}

describe('useAudio', () => {
  let onEnded: () => void;
  let onTimeUpdate: (time: number) => void;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    listeners = {};

    onEnded = vi.fn();
    onTimeUpdate = vi.fn();

    // Default store state
    Object.assign(storeMock, {
      playing: false,
      progress: 0,
      duration: 0,
      volume: 0.7,
      setPlaying: vi.fn(),
      setProgress: vi.fn((p: number) => { storeMock.progress = p; }),
      setDuration: vi.fn((d: number) => { storeMock.duration = d; }),
    });

    setDefaultMock();

    // Capture event listeners registered via TauriAPI.onEvent → listen()
    vi.mocked(listen).mockImplementation((event: string, handler: any) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
      const unlisten = () => {
        listeners[event] = (listeners[event] || []).filter((h) => h !== handler);
      };
      return Promise.resolve(unlisten);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────
  describe('initialization', () => {
    it('should check audio backend availability on mount', async () => {
      renderHook(() => useAudio({ onEnded, onTimeUpdate, initialVolume: 0.8 }));
      await act(async () => { await tick(); });

      expect(invoke).toHaveBeenCalledWith('is_playing', {});
    });

    it('should set audioBackendError when backend check fails', async () => {
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'is_playing') return Promise.reject('Audio device not found');
        return Promise.resolve(null);
      });

      const { result } = renderHook(() =>
        useAudio({ onEnded, onTimeUpdate, initialVolume: 0.8 }),
      );
      await act(async () => { await tick(); });

      expect(result.current.audioBackendError).toContain('Audio system unavailable');
    });

    it('should start with correct defaults from store', () => {
      storeMock.volume = 0.65;
      const { result } = renderHook(() =>
        useAudio({ onEnded, onTimeUpdate, initialVolume: 0.65 }),
      );

      expect(result.current.isPlaying).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.progress).toBe(0);
      expect(result.current.duration).toBe(0);
      expect(result.current.volume).toBe(0.65);
      expect(result.current.audioBackendError).toBeNull();
    });

    it('should register event listeners on mount', async () => {
      renderHook(() => useAudio({ onEnded, onTimeUpdate }));
      await act(async () => { await tick(); });

      expect(listen).toHaveBeenCalledWith('playback-tick', expect.any(Function));
      expect(listen).toHaveBeenCalledWith('track-ended', expect.any(Function));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // loadTrack
  // ─────────────────────────────────────────────────────────────────────────
  describe('loadTrack', () => {
    it('should load a track and set duration in store', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => {
        await result.current.loadTrack(mockTrack());
      });

      expect(invoke).toHaveBeenCalledWith('load_track', { path: '/music/song.mp3' });
      expect(invoke).toHaveBeenCalledWith('get_duration', {});
      expect(storeMock.setDuration).toHaveBeenCalledWith(200);
      expect(storeMock.setProgress).toHaveBeenCalledWith(0);
      expect(result.current.isLoading).toBe(false);
    });

    it('should throw when audio backend is in error state', async () => {
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'is_playing') return Promise.reject('Audio broken');
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));
      await act(async () => { await tick(); });

      let thrownError: Error | undefined;
      try {
        await act(async () => {
          await result.current.loadTrack(mockTrack());
        });
      } catch (e) {
        thrownError = e as Error;
      }
      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toContain('Audio system unavailable');
    });

    it('should retry on failure with exponential backoff', async () => {
      let callCount = 0;
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'load_track') {
          callCount++;
          if (callCount <= 2) return Promise.reject(new Error('Decode error'));
          return Promise.resolve(undefined);
        }
        if (cmd === 'get_duration') return Promise.resolve(200);
        if (cmd === 'is_playing') return Promise.resolve(false);
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => {
        await result.current.loadTrack(mockTrack());
      });

      expect(callCount).toBe(3);
      expect(result.current.isLoading).toBe(false);
      expect(storeMock.setDuration).toHaveBeenCalledWith(200);
    });

    it('should throw after max retries exhausted', async () => {
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'load_track') return Promise.reject(new Error('Decode error'));
        if (cmd === 'is_playing') return Promise.resolve(false);
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      let thrownError: Error | undefined;
      try {
        await act(async () => {
          await result.current.loadTrack(mockTrack());
        });
      } catch (e) {
        thrownError = e as Error;
      }
      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toContain('Failed to load track');
    });

    it('should fall back to track.duration when backend returns 0', async () => {
      setDefaultMock({ get_duration: 0 });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => {
        await result.current.loadTrack(mockTrack({ duration: 180 }));
      });

      expect(storeMock.setDuration).toHaveBeenCalledWith(180);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // play
  // ─────────────────────────────────────────────────────────────────────────
  describe('play', () => {
    it('should call play_audio via IPC', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => {
        await result.current.play();
      });

      expect(invoke).toHaveBeenCalledWith('is_audio_device_available', {});
      expect(invoke).toHaveBeenCalledWith('play_audio', {});
      // isPlaying is driven by the store, not set locally in play()
    });

    it('should not play when no audio device available', async () => {
      setDefaultMock({ is_audio_device_available: false });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => {
        await result.current.play();
      });

      expect(invoke).not.toHaveBeenCalledWith('play_audio', {});
    });

    it('should attempt recovery when play fails', async () => {
      let playCallCount = 0;
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'play_audio') {
          playCallCount++;
          if (playCallCount === 1) return Promise.reject(new Error('Stream failed'));
          return Promise.resolve(undefined);
        }
        const defaults: Record<string, any> = {
          is_playing: false,
          is_audio_device_available: true,
          has_audio_device_changed: false,
          get_inactive_duration: 0,
          recover_audio: true,
        };
        return Promise.resolve(defaults[cmd] ?? null);
      });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => {
        await result.current.play();
      });

      expect(invoke).toHaveBeenCalledWith('recover_audio', {});
      // Second play_audio call after recovery
      expect(playCallCount).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // pause
  // ─────────────────────────────────────────────────────────────────────────
  describe('pause', () => {
    it('should call pause_audio via IPC', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.pause(); });
      expect(invoke).toHaveBeenCalledWith('pause_audio', {});
    });

    it('should silently return when backend is in error state', async () => {
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'is_playing') return Promise.reject('fail');
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));
      await act(async () => { await tick(); });

      // Backend error set — pause should not throw
      await act(async () => { await result.current.pause(); });
      // pause_audio should NOT have been called because backend is in error state
      expect(invoke).not.toHaveBeenCalledWith('pause_audio', {});
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // stop
  // ─────────────────────────────────────────────────────────────────────────
  describe('stop', () => {
    it('should call stop_audio and reset progress in store', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.stop(); });

      expect(invoke).toHaveBeenCalledWith('stop_audio', {});
      expect(storeMock.setProgress).toHaveBeenCalledWith(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // changeVolume
  // ─────────────────────────────────────────────────────────────────────────
  describe('changeVolume', () => {
    it('should call set_volume with clamped value', async () => {
      const { result } = renderHook(() =>
        useAudio({ onEnded, onTimeUpdate, initialVolume: 0.5 }),
      );

      await act(async () => { await result.current.changeVolume(0.9); });
      expect(invoke).toHaveBeenCalledWith('set_volume', { volume: 0.9 });
    });

    it('should clamp volume below 0 to 0', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.changeVolume(-0.5); });
      expect(invoke).toHaveBeenCalledWith('set_volume', { volume: 0 });
    });

    it('should clamp volume above 1 to 1', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.changeVolume(1.5); });
      expect(invoke).toHaveBeenCalledWith('set_volume', { volume: 1 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // seek
  // ─────────────────────────────────────────────────────────────────────────
  describe('seek', () => {
    it('should call seek_to and update progress in store', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.seek(60); });
      expect(invoke).toHaveBeenCalledWith('seek_to', { position: 60 });
      expect(storeMock.setProgress).toHaveBeenCalledWith(60);
    });

    it('should silently return when backend is in error state', async () => {
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'is_playing') return Promise.reject('fail');
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));
      await act(async () => { await tick(); });

      await act(async () => { await result.current.seek(30); });
      expect(invoke).not.toHaveBeenCalledWith('seek_to', expect.anything());
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Event-driven updates (replaces old polling tests)
  // ─────────────────────────────────────────────────────────────────────────
  describe('event listeners', () => {
    it('should update store progress/duration on playback-tick event', async () => {
      renderHook(() => useAudio({ onEnded, onTimeUpdate }));
      await act(async () => { await tick(); });

      // Fire a fake playback-tick event
      act(() => {
        fireEvent('playback-tick', {
          position: 42.5,
          duration: 200,
          isPlaying: true,
          isFinished: false,
        });
      });

      expect(storeMock.setProgress).toHaveBeenCalledWith(42.5);
      expect(storeMock.setDuration).toHaveBeenCalledWith(200);
    });

    it('should call onTimeUpdate callback on playback-tick', async () => {
      renderHook(() => useAudio({ onEnded, onTimeUpdate }));
      await act(async () => { await tick(); });

      act(() => {
        fireEvent('playback-tick', {
          position: 15.3,
          duration: 200,
          isPlaying: true,
          isFinished: false,
        });
      });

      expect(onTimeUpdate).toHaveBeenCalledWith(15.3);
    });

    it('should clamp position to duration', async () => {
      renderHook(() => useAudio({ onEnded, onTimeUpdate }));
      await act(async () => { await tick(); });

      act(() => {
        fireEvent('playback-tick', {
          position: 205,
          duration: 200,
          isPlaying: true,
          isFinished: false,
        });
      });

      expect(storeMock.setProgress).toHaveBeenCalledWith(200);
    });

    it('should call onEnded and reset state on track-ended event', async () => {
      renderHook(() => useAudio({ onEnded, onTimeUpdate }));
      await act(async () => { await tick(); });

      act(() => {
        fireEvent('track-ended', null);
      });

      expect(onEnded).toHaveBeenCalled();
      expect(storeMock.setPlaying).toHaveBeenCalledWith(false);
      expect(storeMock.setProgress).toHaveBeenCalledWith(0);
    });
  });
});
