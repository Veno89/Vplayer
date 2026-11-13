import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import { selectUpcomingTrack } from '../selectors';

const tracks = ['a', 'b', 'c'].map(id => ({ id, name: id, path: `/${id}.mp3`, duration: 100 }));
beforeEach(() => useStore.setState({ ...useStore.getInitialState(), activePlaybackTracks: tracks, currentTrackId: 'a', currentTrack: 0, duration: 100, progress: 20 }));
describe('Player track transitions', () => {
  it('clears timing and loop points only when the selected identity changes', () => {
    const state = useStore.getState();
    state.setPointA(10); state.setPointB(30);
    state.setActivePlaybackTracks([tracks[1], tracks[0], tracks[2]]);
    expect(useStore.getState().abRepeat.enabled).toBe(true);
    expect(useStore.getState().currentTrack).toBe(1);
    useStore.getState().setCurrentTrack(0);
    expect(useStore.getState().currentTrackId).toBe('b');
    expect(useStore.getState().duration).toBe(0);
    expect(useStore.getState().progress).toBe(0);
    expect(useStore.getState().abRepeat).toEqual({ enabled: false, pointA: null, pointB: null });
  });
  it('rejects invalid loop ranges and clears an end invalidated by a new start', () => {
    const state = useStore.getState();
    state.setPointA(20);
    for (const time of [10, 20, 101, NaN, Infinity]) state.setPointB(time);
    expect(useStore.getState().abRepeat.pointB).toBeNull();
    state.setPointB(40);
    state.setPointA(45);
    expect(useStore.getState().abRepeat).toEqual({ enabled: false, pointA: 45, pointB: null });
    state.setPointA(null);
    expect(useStore.getState().abRepeat.enabled).toBe(false);
  });
  it('reads the same queue and prepared shuffle order without consuming them', () => {
    useStore.setState({ shuffle: true, shuffleOrder: [2, 1] });
    expect(selectUpcomingTrack(useStore.getState())?.id).toBe('c');
    expect(useStore.getState().shuffleOrder).toEqual([2, 1]);
    useStore.getState().addToQueue(tracks[1]);
    expect(selectUpcomingTrack(useStore.getState())?.id).toBe('b');
    expect(useStore.getState().queue).toHaveLength(1);
    useStore.setState({ repeatMode: 'one' });
    expect(selectUpcomingTrack(useStore.getState())?.id).toBe('a');
    useStore.setState({ stopAfterCurrent: true });
    expect(selectUpcomingTrack(useStore.getState())).toBeNull();
  });
  it('opens a minimized source without toggling it closed on repeated reveals', () => {
    useStore.getState().revealTrack('a', 'playlist');
    const first = useStore.getState().trackRevealRequest?.revision;
    useStore.getState().revealTrack('a', 'playlist');
    expect(useStore.getState().windows.playlist.visible).toBe(true);
    expect(useStore.getState().windows.playlist.minimized).toBe(false);
    expect(useStore.getState().trackRevealRequest?.revision).toBe((first ?? 0) + 1);
  });
});
