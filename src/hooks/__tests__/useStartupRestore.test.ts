import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../store/useStore';
import { useStartupRestore } from '../useStartupRestore';

vi.mock('../../store/useStore', () => ({
  useStore: Object.assign(vi.fn(), {
    getState: vi.fn(),
  }),
}));

describe('useStartupRestore', () => {
  const restorePlaybackTrack = vi.fn(() => true);
  const setPlaying = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockImplementation((selector: any) => selector({
      restorePlaybackTrack,
      setPlaying,
      resumeLastTrack: true,
      autoPlayOnStartup: false,
    }));
    vi.mocked(useStore.getState).mockReturnValue({
      lastTrackId: 'track-2',
      activePlaybackTracks: [],
    } as any);
  });

  it('restores the playback source and track identity atomically', () => {
    const tracks = [
      { id: 'track-1', name: 'One', path: 'C:/Music/one.mp3', duration: 120 },
      { id: 'track-2', name: 'Two', path: 'C:/Music/two.mp3', duration: 180 },
    ];
    const setHasRestoredTrack = vi.fn();

    renderHook(() => useStartupRestore(tracks, {
      hasRestoredTrack: false,
      setHasRestoredTrack,
    }));

    expect(restorePlaybackTrack).toHaveBeenCalledWith(tracks, 'track-2');
    expect(setHasRestoredTrack).toHaveBeenCalledWith(true);
  });

  it('restores from the selected playlist instead of a stale active source', () => {
    const staleActiveTracks = [
      { id: 'track-2', name: 'Two', path: 'C:/Music/two.mp3', duration: 180 },
      { id: 'track-1', name: 'One', path: 'C:/Music/one.mp3', duration: 120 },
    ];
    const selectedPlaylistTracks = [...staleActiveTracks].reverse();
    vi.mocked(useStore.getState).mockReturnValue({
      lastTrackId: 'track-2',
      activePlaybackTracks: staleActiveTracks,
    } as any);

    renderHook(() => useStartupRestore(selectedPlaylistTracks, {
      hasRestoredTrack: false,
      setHasRestoredTrack: vi.fn(),
    }));

    expect(restorePlaybackTrack).toHaveBeenCalledWith(selectedPlaylistTracks, 'track-2');
  });

  it('does not restore until the selected playlist is ready', () => {
    const setHasRestoredTrack = vi.fn();

    renderHook(() => useStartupRestore([], {
      hasRestoredTrack: false,
      setHasRestoredTrack,
    }, false));

    expect(restorePlaybackTrack).not.toHaveBeenCalled();
    expect(setHasRestoredTrack).not.toHaveBeenCalled();
  });

  it('finishes without autoplay when the selected playlist is empty', () => {
    const setHasRestoredTrack = vi.fn();

    renderHook(() => useStartupRestore([], {
      hasRestoredTrack: false,
      setHasRestoredTrack,
    }, true));

    expect(restorePlaybackTrack).not.toHaveBeenCalled();
    expect(setPlaying).not.toHaveBeenCalled();
    expect(setHasRestoredTrack).toHaveBeenCalledWith(true);
  });
});
