import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useAudio } from '../useAudio';

/**
 * useAudio test suite
 *
 * Tests the core audio hook that bridges React to the Rust audio engine.
 * Covers: loadTrack, play, pause, seek, volume, error recovery, and polling.
 *
 * TauriAPI is mocked at the @tauri-apps/api/core level (via setupTests.js).
 * We override `invoke` per-test via mockImplementation.
 *
 * NOTE: We do NOT use fake timers because useAudio's internal sleep() and
 * withTimeout() depend on real setTimeout. Polling tests use short real waits.
 */

// Mock AUDIO_RETRY_CONFIG to use tiny delays so retry tests don't time out
vi.mock('../../utils/constants', async (importOriginal) => {
  const actual = await importOriginal() as any;
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
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

/** Set up a sane default invoke mock that handles all commands useAudio needs */
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
    // Explicit cleanup of previous render before setting up fresh mocks
    cleanup();
    vi.clearAllMocks();
    onEnded = vi.fn<() => void>();
    onTimeUpdate = vi.fn<(time: number) => void>();
    setDefaultMock();
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------
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

    it('should start with correct defaults', () => {
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
  });

  // -------------------------------------------------------------------------
  // loadTrack
  // -------------------------------------------------------------------------
  describe('loadTrack', () => {
    it('should load a track and set duration', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => {
        await result.current.loadTrack(mockTrack());
      });

      expect(invoke).toHaveBeenCalledWith('load_track', { path: '/music/song.mp3' });
      expect(invoke).toHaveBeenCalledWith('get_duration', {});
      expect(result.current.duration).toBe(200);
      expect(result.current.progress).toBe(0);
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
      expect(result.current.duration).toBe(200);
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

      expect(result.current.duration).toBe(180);
    });
  });

  // -------------------------------------------------------------------------
  // play
  // -------------------------------------------------------------------------
  describe('play', () => {
    it('should call play_audio and set isPlaying', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => {
        await result.current.play();
      });

      expect(invoke).toHaveBeenCalledWith('is_audio_device_available', {});
      expect(invoke).toHaveBeenCalledWith('play_audio', {});
      expect(result.current.isPlaying).toBe(true);
    });

    it('should not play when no audio device available', async () => {
      setDefaultMock({ is_audio_device_available: false });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => {
        await result.current.play();
      });

      expect(result.current.isPlaying).toBe(false);
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
      expect(result.current.isPlaying).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // pause
  // -------------------------------------------------------------------------
  describe('pause', () => {
    it('should call pause_audio and set isPlaying to false', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.play(); });
      expect(result.current.isPlaying).toBe(true);

      await act(async () => { await result.current.pause(); });
      expect(invoke).toHaveBeenCalledWith('pause_audio', {});
      expect(result.current.isPlaying).toBe(false);
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
    });
  });

  // -------------------------------------------------------------------------
  // stop
  // -------------------------------------------------------------------------
  describe('stop', () => {
    it('should call stop_audio and reset state', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.play(); });
      await act(async () => { await result.current.stop(); });

      expect(invoke).toHaveBeenCalledWith('stop_audio', {});
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.progress).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // changeVolume
  // -------------------------------------------------------------------------
  describe('changeVolume', () => {
    it('should set volume and call set_volume', async () => {
      const { result } = renderHook(() =>
        useAudio({ onEnded, onTimeUpdate, initialVolume: 0.5 }),
      );

      await act(async () => { await result.current.changeVolume(0.9); });
      expect(invoke).toHaveBeenCalledWith('set_volume', { volume: 0.9 });
      expect(result.current.volume).toBe(0.9);
    });

    it('should clamp volume below 0 to 0', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.changeVolume(-0.5); });
      expect(invoke).toHaveBeenCalledWith('set_volume', { volume: 0 });
      expect(result.current.volume).toBe(0);
    });

    it('should clamp volume above 1 to 1', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.changeVolume(1.5); });
      expect(invoke).toHaveBeenCalledWith('set_volume', { volume: 1 });
      expect(result.current.volume).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // seek
  // -------------------------------------------------------------------------
  describe('seek', () => {
    it('should call seek_to and update progress', async () => {
      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.seek(60); });
      expect(invoke).toHaveBeenCalledWith('seek_to', { position: 60 });
      expect(result.current.progress).toBe(60);
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

  // -------------------------------------------------------------------------
  // Polling (progress tracking) — uses real timers with short waits
  // -------------------------------------------------------------------------
  describe('polling', () => {
    it('should poll position when duration > 0 and call onTimeUpdate', async () => {
      let positionCalls = 0;
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'get_position') { positionCalls++; return Promise.resolve(42.5); }
        if (cmd === 'is_finished') return Promise.resolve(false);
        const defaults: Record<string, any> = {
          is_playing: false,
          get_duration: 200,
          is_audio_device_available: true,
          has_audio_device_changed: false,
          get_inactive_duration: 0,
        };
        return Promise.resolve(defaults[cmd] ?? undefined);
      });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      // Load a track (sets duration > 0 → paused poll at 1000ms)
      await act(async () => { await result.current.loadTrack(mockTrack()); });

      // Wait for at least one poll cycle (paused = 1000ms)
      await act(async () => { await tick(1200); });

      expect(positionCalls).toBeGreaterThan(0);
      expect(result.current.progress).toBe(42.5);
      expect(onTimeUpdate).toHaveBeenCalledWith(42.5);
    });

    it('should call onEnded when track finishes while playing', async () => {
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'get_position') return Promise.resolve(199.95);
        if (cmd === 'is_finished') return Promise.resolve(true);
        const defaults: Record<string, any> = {
          is_playing: true,
          get_duration: 200,
          is_audio_device_available: true,
          has_audio_device_changed: false,
          get_inactive_duration: 0,
          load_track: undefined,
          play_audio: undefined,
        };
        return Promise.resolve(defaults[cmd] ?? undefined);
      });

      const { result } = renderHook(() => useAudio({ onEnded, onTimeUpdate }));

      await act(async () => { await result.current.loadTrack(mockTrack()); });
      await act(async () => { await result.current.play(); });

      // Playing = 100ms poll interval
      await act(async () => { await tick(300); });

      expect(onEnded).toHaveBeenCalled();
      expect(result.current.isPlaying).toBe(false);
    });
  });
});
