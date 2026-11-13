import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngineProvider } from './AudioEngineContext';
import { useStore } from '../store/useStore';

const audio = vi.hoisted(() => ({ onEnded: () => {}, seek: vi.fn().mockResolvedValue(undefined), play: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../hooks/useAudio', () => ({ useAudio: (params: { onEnded: () => void }) => { audio.onEnded = params.onEnded; return { isLoading: false, audioBackendError: null, seek: audio.seek, play: audio.play }; } }));
const tracks = ['a', 'b'].map(id => ({ id, name: id, path: `/${id}.mp3`, duration: 100 }));
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ ...useStore.getInitialState(), activePlaybackTracks: tracks, currentTrack: 1, currentTrackId: 'b', playing: true });
});
afterEach(cleanup);
function setup() {
  const next = vi.fn();
  render(<AudioEngineProvider crossfadeRef={{ current: null }} playerHookRef={{ current: { handleNextTrack: next } }}>{null}</AudioEngineProvider>);
  return next;
}
describe('Automatic track navigation', () => {
  it('continues the pending queue even at the end of a playlist with repeat off', () => {
    useStore.getState().addToQueue(tracks[0]);
    const next = setup();
    act(() => audio.onEnded());
    expect(next).toHaveBeenCalledOnce();
  });
  it('uses remaining shuffle entries and stops only when the order is exhausted', () => {
    useStore.setState({ shuffle: true, shuffleOrder: [0] });
    const next = setup();
    act(() => audio.onEnded());
    expect(next).toHaveBeenCalledOnce();
    act(() => useStore.setState({ shuffleOrder: [] }));
    act(() => audio.onEnded());
    expect(next).toHaveBeenCalledOnce();
    expect(useStore.getState().playing).toBe(false);
  });
  it('restarts a single-track source in repeat all after seeking completes', async () => {
    useStore.setState({ activePlaybackTracks: [tracks[0]], currentTrack: 0, currentTrackId: 'a', repeatMode: 'all' });
    const next = setup();
    await act(async () => audio.onEnded());
    expect(audio.seek).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });
});
