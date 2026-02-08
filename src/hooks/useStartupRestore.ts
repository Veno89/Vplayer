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
): void {
  const setCurrentTrack = useStore(s => s.setCurrentTrack);
  const setPlaying = useStore(s => s.setPlaying);
  const resumeLastTrack = useStore(s => s.resumeLastTrack);
  const autoPlayOnStartup = useStore(s => s.autoPlayOnStartup);

  useEffect(() => {
    if (trackLoading.hasRestoredTrack || !tracks?.length) return;

    if (resumeLastTrack) {
      const savedTrackId = useStore.getState().lastTrackId;
      if (savedTrackId) {
        const trackIndex = tracks.findIndex(t => t.id === savedTrackId);
        if (trackIndex !== -1) {
          setCurrentTrack(trackIndex);
          if (autoPlayOnStartup) {
            setTimeout(() => setPlaying(true), 500);
          }
        }
      }
    }

    trackLoading.setHasRestoredTrack(true);
  }, [tracks, trackLoading, setCurrentTrack, resumeLastTrack, autoPlayOnStartup, setPlaying]);
}
