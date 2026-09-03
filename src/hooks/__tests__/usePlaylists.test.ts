import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriAPI } from '../../services/TauriAPI';
import { useStore } from '../../store/useStore';
import { usePlaylists } from '../usePlaylists';

describe('usePlaylists playback readiness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useStore.setState({ ...useStore.getInitialState(), lastPlaylistId: null });
  });

  it('reports an empty source when no playlist is selected', async () => {
    vi.spyOn(TauriAPI, 'getAllPlaylists').mockResolvedValue([]);
    const getPlaylistTracks = vi.spyOn(TauriAPI, 'getPlaylistTracks');

    const { result } = renderHook(() => usePlaylists());

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.currentPlaylist).toBeNull();
    expect(result.current.playlistTracks).toEqual([]);
    expect(getPlaylistTracks).not.toHaveBeenCalled();
  });

  it('restores an empty selected playlist without borrowing library tracks', async () => {
    useStore.setState({ lastPlaylistId: 'playlist-1' });
    vi.spyOn(TauriAPI, 'getAllPlaylists').mockResolvedValue([
      { id: 'playlist-1', name: 'Empty playlist', createdAt: 1 },
    ] as any);
    vi.spyOn(TauriAPI, 'getPlaylistTracks').mockResolvedValue([]);

    const { result } = renderHook(() => usePlaylists());

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.currentPlaylist).toBe('playlist-1');
    expect(result.current.playlistTracks).toEqual([]);
    expect(TauriAPI.getPlaylistTracks).toHaveBeenCalledWith('playlist-1');
  });
});
