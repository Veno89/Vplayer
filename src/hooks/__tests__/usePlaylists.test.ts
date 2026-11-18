import { act, renderHook, waitFor } from '@testing-library/react';
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

  it('uses one native bulk mutation and one refresh for removal and undo', async () => {
    useStore.setState({ lastPlaylistId: 'p' });
    vi.spyOn(TauriAPI, 'getAllPlaylists').mockResolvedValue([['p', 'Playlist', 0]] as any);
    const load = vi.spyOn(TauriAPI, 'getPlaylistTracks').mockResolvedValue([]);
    const receipt = { playlistId: 'p', before: ['a', 'b'], after: [], removed: 2 };
    const remove = vi.spyOn(TauriAPI, 'removePlaylistTracks').mockResolvedValue(receipt);
    const undo = vi.spyOn(TauriAPI, 'undoPlaylistRemoval').mockResolvedValue(undefined);
    const { result } = renderHook(() => usePlaylists());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    load.mockClear();
    await act(async () => { expect(await result.current.removeTracksFromPlaylist('p', ['a', 'b'])).toEqual(receipt); });
    expect(remove).toHaveBeenCalledExactlyOnceWith('p', ['a', 'b'], false);
    expect(load).toHaveBeenCalledExactlyOnceWith('p');
    load.mockClear();
    await act(async () => { await result.current.undoRemoval(receipt); });
    expect(undo).toHaveBeenCalledExactlyOnceWith(receipt);
    expect(load).toHaveBeenCalledExactlyOnceWith('p');
  });

  it('keeps the undo receipt when refresh fails and waits for a successful retry before exposing the source', async () => {
    useStore.setState({ lastPlaylistId: 'p' });
    vi.spyOn(TauriAPI, 'getAllPlaylists').mockResolvedValue([['p', 'Playlist', 0]] as any);
    const load = vi.spyOn(TauriAPI, 'getPlaylistTracks').mockResolvedValue([]);
    const receipt = { playlistId: 'p', before: ['a'], after: [], removed: 1 };
    vi.spyOn(TauriAPI, 'removePlaylistTracks').mockResolvedValue(receipt);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => usePlaylists());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    load.mockRejectedValueOnce(new Error('Temporary database read failure'));
    await act(async () => { expect(await result.current.removeTracksFromPlaylist('p', ['a'])).toEqual(receipt); });
    expect(result.current.isReady).toBe(false);
    expect(result.current.loadError).toContain('Temporary database read failure');
    await act(async () => { await result.current.refreshPlaylistTracks(); });
    expect(result.current.isReady).toBe(true);
    expect(result.current.loadError).toBeNull();
  });

  it('keeps the playlist API stable across unrelated parent renders', async () => {
    vi.spyOn(TauriAPI, 'getAllPlaylists').mockResolvedValue([]);
    const { result, rerender } = renderHook(() => usePlaylists());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    const api = result.current;
    rerender();
    expect(result.current).toBe(api);
  });

  it('saves ratings in place after persistence without reloading or disturbing playback', async () => {
    const tracks = [
      { id: 'a', name: 'a.mp3', path: 'C:/Music/a.mp3', rating: 1, duration: 120 },
      { id: 'b', name: 'b.mp3', path: 'C:/Music/b.mp3', rating: 2, duration: 120 },
    ];
    useStore.setState({ lastPlaylistId: 'p', activePlaybackTracks: tracks,
      currentTrackId: 'a', currentTrack: 0, playing: true, progress: 37 });
    vi.spyOn(TauriAPI, 'getAllPlaylists').mockResolvedValue([['p', 'Playlist', 0]] as any);
    const load = vi.spyOn(TauriAPI, 'getPlaylistTracks').mockResolvedValue(tracks);
    let finish!: () => void;
    const save = vi.spyOn(TauriAPI, 'updateTrackRating').mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const { result } = renderHook(() => usePlaylists());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    load.mockClear();
    let pending!: Promise<void>;
    act(() => { pending = result.current.updateTrackRating('a', 5); });
    await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith('a', 5));
    expect(result.current.playlistTracks[0].rating).toBe(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isReady).toBe(true);
    await act(async () => { finish(); await pending; });
    expect(result.current.playlistTracks[0].rating).toBe(5);
    expect(result.current.playlistTracks[1]).toBe(tracks[1]);
    expect(load).not.toHaveBeenCalled();
    expect(useStore.getState()).toMatchObject({ currentTrackId: 'a', currentTrack: 0, playing: true, progress: 37 });
    expect(useStore.getState().activePlaybackTracks[0].rating).toBe(5);
  });

  it('serializes rapid ratings and keeps failed saves out of the displayed data', async () => {
    const tracks = [{ id: 'a', name: 'a.mp3', path: 'C:/Music/a.mp3', rating: 1, duration: 120 }];
    useStore.setState({ lastPlaylistId: 'p' });
    vi.spyOn(TauriAPI, 'getAllPlaylists').mockResolvedValue([['p', 'Playlist', 0]] as any);
    vi.spyOn(TauriAPI, 'getPlaylistTracks').mockResolvedValue(tracks);
    let finish!: () => void;
    const save = vi.spyOn(TauriAPI, 'updateTrackRating')
      .mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }))
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => usePlaylists());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    let pending!: Promise<PromiseSettledResult<void>[]>;
    act(() => { pending = Promise.allSettled([
      result.current.updateTrackRating('a', 3),
      result.current.updateTrackRating('a', 4),
      result.current.updateTrackRating('a', 5),
    ]); });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await act(async () => { finish(); await pending; });
    expect(save.mock.calls).toEqual([['a', 3], ['a', 4], ['a', 5]]);
    expect((await pending).map(item => item.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(result.current.playlistTracks[0].rating).toBe(5);
    save.mockRejectedValueOnce(new Error('Database unavailable'));
    await act(async () => { await expect(result.current.updateTrackRating('a', 2)).rejects.toThrow('Database unavailable'); });
    expect(result.current.playlistTracks[0].rating).toBe(5);
  });

  it('preserves saved ratings when an older playlist refresh finishes later', async () => {
    const tracks = [{ id: 'a', name: 'a.mp3', path: 'C:/Music/a.mp3', rating: 1, duration: 120 }];
    useStore.setState({ lastPlaylistId: 'p' });
    vi.spyOn(TauriAPI, 'getAllPlaylists').mockResolvedValue([['p', 'Playlist', 0]] as any);
    const load = vi.spyOn(TauriAPI, 'getPlaylistTracks').mockResolvedValue(tracks);
    vi.spyOn(TauriAPI, 'updateTrackRating').mockResolvedValue(undefined);
    const { result } = renderHook(() => usePlaylists());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    let finish!: (value: typeof tracks) => void;
    load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refreshPlaylistTracks(); });
    await act(async () => { await result.current.updateTrackRating('a', 5); });
    await act(async () => { finish(tracks); await refresh; });
    expect(result.current.playlistTracks[0].rating).toBe(5);
    expect(result.current.isReady).toBe(true);
  });
});
