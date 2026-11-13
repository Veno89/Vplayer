import type { Track } from '../types';
import type { PlayerSliceState } from './types';

type CurrentTrackState = Pick<
  PlayerSliceState,
  'activePlaybackTracks' | 'currentTrack' | 'currentTrackId'
>;

/**
 * Resolve the playing track from its stable ID. The numeric index is only a
 * fast path because it can temporarily become stale while a source is remapped.
 */
export function selectCurrentTrackData(state: CurrentTrackState): Track | null {
  if (!state.currentTrackId) return null;

  const indexedTrack = state.activePlaybackTracks[state.currentTrack ?? -1];
  if (indexedTrack?.id === state.currentTrackId) return indexedTrack;

  return state.activePlaybackTracks.find(track => track.id === state.currentTrackId) ?? null;
}

/** Read the prepared navigation order without consuming queue or shuffle state. */
export function selectUpcomingTrack(state: PlayerSliceState & { stopAfterCurrent: boolean }): Track | null {
  if (state.currentTrack === null || state.stopAfterCurrent) return null;
  if (state.repeatMode === 'one') return selectCurrentTrackData(state);
  if (state.queue.length) return state.queue[0];
  if (state.shuffle) return state.activePlaybackTracks[state.shuffleOrder[0]]
    ?? (state.repeatMode === 'all' && state.activePlaybackTracks.length === 1 ? state.activePlaybackTracks[0] : null) ?? null;
  const next = (state.currentTrack ?? -1) + 1;
  return state.activePlaybackTracks[next] ?? (state.repeatMode === 'all' ? state.activePlaybackTracks[0] : null) ?? null;
}
