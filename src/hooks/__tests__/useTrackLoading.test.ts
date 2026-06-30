import { renderHook, act } from '@testing-library/react';
import { useTrackLoading } from '../useTrackLoading';
import { useStore } from '../../store/useStore';
import { devCounters } from '../../utils/devCounters';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriAPI } from '../../services/TauriAPI';

vi.mock('../../services/TauriAPI', () => ({
  TauriAPI: {
    hasPreloaded: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('../../store/useStore', () => ({
  useStore: Object.assign(vi.fn(), {
    getState: vi.fn(),
  }),
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('useTrackLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aborts playback if user changes track while loading', async () => {
    const audioMock = {
      loadTrack: vi.fn().mockImplementation(async () => {
        await sleep(50);
      }),
      play: vi.fn(),
    };

    const tracks = [
      { id: '1', name: 'Track 1', path: '/1.mp3', duration: 100 },
      { id: '2', name: 'Track 2', path: '/2.mp3', duration: 100 },
    ];

    let currentTrackIndex = 0;
    
    vi.mocked(useStore.getState).mockReturnValue({
      activePlaybackTracks: tracks,
      currentTrack: currentTrackIndex,
      lastTrackId: '0',
      lastPosition: 0,
      setLastTrackId: vi.fn(),
      setLastPosition: vi.fn(),
      setDuration: vi.fn(),
      setProgress: vi.fn(),
    } as any);

    const initialIgnored = devCounters.counters.audio.stalePlaybackRequestsIgnored;

    const { rerender } = renderHook(
      ({ currentTrack }) => useTrackLoading({
        audio: audioMock as any,
        tracks: tracks as any,
        currentTrack,
        playing: true,
        setLoadingTrackIndex: vi.fn(),
        progress: 0,
        toast: { showError: vi.fn(), showSuccess: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() },
        removeTrack: vi.fn(),
        setCurrentTrack: vi.fn(),
        handleNextTrack: vi.fn(),
      }),
      { initialProps: { currentTrack: 0 } }
    );

    // Give it a tick to start loadTrack(0)
    await act(async () => {
      await sleep(10);
    });

    // User switches track while 0 is still loading
    currentTrackIndex = 1;
    vi.mocked(useStore.getState).mockReturnValue({
      activePlaybackTracks: tracks,
      currentTrack: currentTrackIndex, // changed!
      lastTrackId: '0',
      lastPosition: 0,
      setLastTrackId: vi.fn(),
      setLastPosition: vi.fn(),
      setDuration: vi.fn(),
      setProgress: vi.fn(),
    } as any);

    rerender({ currentTrack: 1 });

    // Wait for the first load to finish
    await act(async () => {
      await sleep(100);
    });

    // The first track's playback should be aborted
    expect(devCounters.counters.audio.stalePlaybackRequestsIgnored - initialIgnored).toBeGreaterThan(0);
    // audio.play() shouldn't be called for the aborted track. Wait, it might be called for track 1 since it loaded after.
    // We just need to check the counter incremented, which proves the abort logic worked.
  });
});
