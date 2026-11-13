import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrackLoading } from '../useTrackLoading';
import { useStore } from '../../store/useStore';
import type { AudioService } from '../../types';

vi.mock('../useReplayGain', () => ({ useReplayGain: () => ({ applyReplayGain: vi.fn().mockResolvedValue(undefined) }) }));
const tracks = ['a', 'b'].map(id => ({ id, name: id, path: `/${id}.mp3`, duration: 100 }));
const toast = { showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn(), showSuccess: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); useStore.setState({ ...useStore.getInitialState(), activePlaybackTracks: tracks, currentTrack: 0, currentTrackId: 'a', playing: true }); });
afterEach(cleanup);
function setup(loadTrack = vi.fn().mockResolvedValue(undefined)) {
  const audio = { loadTrack, play: vi.fn().mockResolvedValue(undefined), seek: vi.fn().mockResolvedValue(undefined) };
  const hook = renderHook(() => {
    const source = useStore(s => s.activePlaybackTracks);
    const currentTrack = useStore(s => s.currentTrack);
    const playing = useStore(s => s.playing);
    return useTrackLoading({ audio: audio as unknown as AudioService, tracks: source, currentTrack, playing, progress: 0, setLoadingTrackIndex: useStore.getState().setLoadingTrackIndex, toast, removeTrack: vi.fn(), setCurrentTrack: useStore.getState().setCurrentTrack, handleNextTrack: vi.fn() });
  });
  return { audio, ...hook };
}
describe('Track load identity and retry', () => {
  it('loads a new source at the same numeric index', async () => {
    const { audio, result } = setup();
    await waitFor(() => expect(result.current.loadedTrackId).toBe('a'));
    act(() => {
      useStore.getState().setActivePlaybackTracks([tracks[1]]);
      useStore.getState().setCurrentTrack(0);
    });
    await waitFor(() => expect(result.current.loadedTrackId).toBe('b'));
    expect(audio.loadTrack.mock.calls.map(([track]) => track.id)).toEqual(['a', 'b']);
  });
  it('does not reload or lose looping on a source reorder of the same track', async () => {
    const { audio, result } = setup();
    await waitFor(() => expect(result.current.loadedTrackId).toBe('a'));
    act(() => useStore.getState().setActivePlaybackTracks([tracks[1], tracks[0]]));
    expect(audio.loadTrack).toHaveBeenCalledTimes(1);
    expect(useStore.getState().currentTrack).toBe(1);
  });
  it('ignores an old completion when the user skips and pauses during loading', async () => {
    const resolves: Array<() => void> = [];
    const { audio, result } = setup(vi.fn(() => new Promise<void>(resolve => resolves.push(resolve))));
    act(() => { useStore.getState().setCurrentTrack(1); useStore.getState().setPlaying(false); });
    await act(async () => { resolves[0](); resolves[1](); });
    expect(result.current.loadedTrackId).toBe('b');
    expect(audio.play).not.toHaveBeenCalled();
  });
  it('retries the same failed file after reconnecting without changing row', async () => {
    useStore.setState({ playing: false });
    const load = vi.fn().mockRejectedValueOnce(new Error('File not found')).mockResolvedValue(undefined);
    const { result } = setup(load);
    await waitFor(() => expect(result.current.trackLoadError).toContain('Reconnect the music drive'));
    act(() => result.current.retryCurrentTrack());
    await waitFor(() => expect(result.current.loadedTrackId).toBe('a'));
    expect(result.current.trackLoadError).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    expect(useStore.getState().playing).toBe(true);
  });
});
