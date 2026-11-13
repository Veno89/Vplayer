import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePlayer } from '../usePlayer';
import { useStore } from '../../store/useStore';
import { selectUpcomingTrack } from '../../store/selectors';
import type { AudioService, CrossfadeOptions } from '../../types';

afterEach(cleanup);
it('does not start a second shuffle cycle when repeat is off', () => {
  const tracks = ['a', 'b'].map(id => ({ id, name: id, path: `/${id}.mp3`, duration: 100 }));
  useStore.setState({ ...useStore.getInitialState(), activePlaybackTracks: tracks, currentTrack: 1, currentTrackId: 'b', duration: 100, shuffle: true, shuffleSignature: 'a|b', shuffleOrder: [], gaplessPlayback: false });
  const state = useStore.getState();
  const { result } = renderHook(() => usePlayer({ audio: {} as AudioService, player: state, tracks, toast: { showError: vi.fn(), showInfo: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn() }, storeGetter: () => useStore.getState() }));
  act(() => result.current.handleNextTrack());
  expect(useStore.getState().currentTrackId).toBe('b');
  expect(useStore.getState().shuffleOrder).toEqual([]);
});
it('consumes the same shuffle entry previewed at a crossfade transition', () => {
  const tracks = ['a', 'b', 'c'].map(id => ({ id, name: id, path: `/${id}.mp3`, duration: 100 }));
  useStore.setState({ ...useStore.getInitialState(), activePlaybackTracks: tracks, currentTrack: 0, currentTrackId: 'a', duration: 100, progress: 95, playing: true, shuffle: true, shuffleSignature: 'a|b|c', shuffleOrder: [1, 2], gaplessPlayback: false });
  const start = vi.fn();
  const audio = { changeVolume: vi.fn().mockResolvedValue(undefined) } as unknown as AudioService;
  const getter = () => useStore.getState();
  renderHook(() => {
    const current = useStore(s => s.currentTrack);
    const state = useStore.getState();
    return usePlayer({ audio, player: { ...state, currentTrack: current }, tracks, toast: { showError: vi.fn(), showInfo: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn() }, storeGetter: getter, crossfade: { enabled: true, duration: 1000, shouldCrossfade: position => position > 85, startCrossfade: start, cancelCrossfade: vi.fn() } });
  });
  expect(selectUpcomingTrack(useStore.getState())?.id).toBe('b');
  act(() => (start.mock.calls[0][0] as CrossfadeOptions).onMidpoint());
  expect(useStore.getState().currentTrackId).toBe('b');
  expect(useStore.getState().shuffleOrder).toEqual([2]);
  expect(selectUpcomingTrack(useStore.getState())?.id).toBe('c');
});
