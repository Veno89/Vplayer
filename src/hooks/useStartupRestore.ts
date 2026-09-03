import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { Track } from '../types';

interface TrackLoadingState {
  hasRestoredTrack: boolean;
  setHasRestoredTrack: (v: boolean) => void;
}

/**
 * Handles restoring the last-played track when the app starts.
 * Extracted from PlayerProvider — pure side-effect hook.
 */
export function useStartupRestore(
  tracks: Track[],
  trackLoading: TrackLoadingState,
  sourceReady = true,
): void {
  const restorePlaybackTrack = useStore(s => s.restorePlaybackTrack);
  const setPlaying = useStore(s => s.setPlaying);
  const resumeLastTrack = useStore(s => s.resumeLastTrack);
  const autoPlayOnStartup = useStore(s => s.autoPlayOnStartup);

  useEffect(() => {
    if (trackLoading.hasRestoredTrack || !sourceReady) return;

    if (resumeLastTrack) {
      const savedTrackId = useStore.getState().lastTrackId;
      if (savedTrackId && tracks.length > 0) {
        // Startup restoration is deliberately scoped to the selected playlist.
        // Never reuse a stale active source (for example, the library from an
        // older session) merely because it contains the saved track ID.
        if (restorePlaybackTrack(tracks, savedTrackId)) {
          if (autoPlayOnStartup) {
            setTimeout(() => setPlaying(true), 500);
          }
        }
      }
    }

    trackLoading.setHasRestoredTrack(true);
  }, [tracks, trackLoading, sourceReady, restorePlaybackTrack, resumeLastTrack, autoPlayOnStartup, setPlaying]);
}
