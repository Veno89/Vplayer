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
