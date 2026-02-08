import { useState, useEffect, useRef } from 'react';
import { ERROR_MESSAGES, DEFAULT_PREFERENCES } from '../utils/constants';
import { useReplayGain } from './useReplayGain';
import { useStore } from '../store/useStore';
import type { Track, AudioService, ToastService } from '../types';

export interface TrackLoadingParams {
  audio: AudioService;
  tracks: Track[];
  currentTrack: number | null;
  playing: boolean;
  setDuration: (d: number) => void;
  setLoadingTrackIndex: (i: number | null) => void;
  progress: number;
  toast: ToastService;
  removeTrack: (id: string) => Promise<void>;
  setCurrentTrack: (i: number | null) => void;
  handleNextTrack: () => void;
}

export interface TrackLoadingReturn {
  loadedTrackId: string | null;
  hasRestoredTrack: boolean;
  setHasRestoredTrack: (v: boolean) => void;
}

export function useTrackLoading({
  audio,
  tracks,
  currentTrack,
  playing,
  setDuration,
  setLoadingTrackIndex,
  progress,
  toast,
  removeTrack,
  setCurrentTrack,
  handleNextTrack
}: TrackLoadingParams): TrackLoadingReturn {
  const [loadedTrackId, setLoadedTrackId] = useState<string | null>(null);
  const [hasRestoredTrack, setHasRestoredTrack] = useState(false);
  const lastToastTrackId = useRef<string | null>(null);
  const shouldRestorePosition = useRef(true);

  // ReplayGain hook for volume normalization
  const replayGain = useReplayGain();

  // Restore last played track on mount
  useEffect(() => {
    if (hasRestoredTrack || !tracks?.length) return;

    const lastTrackId = useStore.getState().lastTrackId;
    if (lastTrackId) {
      const trackIndex = tracks.findIndex(t => t.id === lastTrackId);
      if (trackIndex !== -1) {
        // This will be handled by setCurrentTrack in parent
      }
    }
    setHasRestoredTrack(true);
  }, [tracks, hasRestoredTrack]);

  // Load track when currentTrack changes
  useEffect(() => {
    const loadTrack = async () => {
      // CRITICAL FIX: Get fresh tracks from store to avoid React render race conditions
      // When clicking a playlist track, store updates immediately but props might be stale
      const state = useStore.getState();
      const activeTracks = state.activePlaybackTracks;

      // Use fresh active tracks if available, otherwise fall back to props (Library)
      const currentTracks = activeTracks && activeTracks.length > 0 ? activeTracks : tracks;

      if (currentTrack !== null && currentTracks[currentTrack]) {
        const track = currentTracks[currentTrack];

        // Defensive: validate track has a path before loading
        if (!track.path || typeof track.path !== 'string') {
          console.error('[useTrackLoading] Track is missing path:', track);
          toast.showError('Cannot play track: invalid file path');
          return;
        }

        // Safety check: if the store has a known last-played track ID, and we're being
        // asked to load a different track at the same index, it may mean the tracks array
        // was re-sorted and the index is now stale. Log a warning for diagnostics.
        const lastSavedId = useStore.getState().lastTrackId;
        if (loadedTrackId && loadedTrackId !== track.id && lastSavedId && lastSavedId === loadedTrackId) {
          console.log('[useTrackLoading] Track at index', currentTrack, 'changed from', loadedTrackId, 'to', track.id,
            '- array may have been re-sorted, loading new track');
        }

        // Don't reload if already loaded
        if (loadedTrackId === track.id) {
          // Position will be saved by the separate progress effect
          return;
        }

        // Save last played track
        useStore.getState().setLastTrackId(track.id);

        // Check if we should restore position for this track
        const shouldRestore = shouldRestorePosition.current && track.id === useStore.getState().lastTrackId;

        if (!shouldRestore) {
          // Reset position only if not restoring
          useStore.getState().setLastPosition(0);
        }

        console.log('Loading track:', track.name);
        setLoadingTrackIndex(currentTrack);

        try {
          await audio.loadTrack(track);
          setLoadedTrackId(track.id);
          setLoadingTrackIndex(null);
          setDuration(track.duration || 0);

          // Apply ReplayGain if enabled
          await replayGain.applyReplayGain(track);

          // Restore last position if we should
          const storedTrackId = useStore.getState().lastTrackId;
          if (shouldRestorePosition.current && track.id === storedTrackId) {
            const savedPosition = useStore.getState().lastPosition;
            if (savedPosition > 0 && savedPosition < track.duration) {
              console.log(`Restoring position: ${savedPosition}s for track ${track.name}`);
              await audio.seek(savedPosition);
            }
            // Mark that we've restored, so subsequent track changes don't restore
            shouldRestorePosition.current = false;
          }

          // Auto-play if playing state is true
          if (playing) {
            await audio.play();
          }

          // Only show toast if we haven't already shown it for this track
          if (lastToastTrackId.current !== track.id) {
            toast.showSuccess(`Now playing: ${track.title || track.name}`, 2000);
            lastToastTrackId.current = track.id;
          }
        } catch (err) {
          console.error('Failed to load track:', err);
          setLoadingTrackIndex(null);
          setLoadedTrackId(null);

          // Check if this is a decode error (corrupted file)
          const isDecodeError = err.message && err.message.includes('Decode error');

          // Get user preferences from store
          const storeState = useStore.getState();
          const preferences = {
            autoRemoveCorruptedFiles: DEFAULT_PREFERENCES.autoRemoveCorruptedFiles,
            confirmCorruptedFileRemoval: DEFAULT_PREFERENCES.confirmCorruptedFileRemoval,
          };

          if (isDecodeError && preferences.autoRemoveCorruptedFiles) {
            // Show confirmation dialog if enabled
            if (preferences.confirmCorruptedFileRemoval) {
              const confirmed = window.confirm(
                `The file "${track.name}" appears to be corrupted.\n\n` +
                `Would you like to remove it from your library?\n\n` +
                `(You can disable this prompt in Settings)`
              );

              if (!confirmed) {
                toast.showError(`Failed to load track: ${track.name}`);
                return;
              }
            }

            toast.showWarning(`${ERROR_MESSAGES.CORRUPTED_FILE_DETECTED}: ${track.name}`, 4000);

            // Remove the corrupted track from the database
            try {
              await removeTrack(track.id);
              console.log('Removed corrupted track:', track.name);

              // Skip to next track if there are more tracks
              if (tracks?.length > 1 && handleNextTrack) {
                setTimeout(() => {
                  handleNextTrack();
                }, 500);
              } else {
                // No more tracks, clear current track
                setCurrentTrack(null);
              }
            } catch (removeErr) {
              console.error('Failed to remove corrupted track:', removeErr);
              toast.showError(`Could not remove corrupted track from library`);
            }
          } else {
            // Other types of errors
            toast.showError(`Failed to load track: ${track.name}`);
          }
        }
      }
    };

    loadTrack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, loadedTrackId]);
  // Only re-run when currentTrack index or loadedTrackId changes
  // All other values (tracks, audio, etc.) are accessed from the closure

  // Separate effect to save progress periodically to store
  useEffect(() => {
    if (loadedTrackId && progress > 0) {
      useStore.getState().setLastPosition(progress);
    }
  }, [progress, loadedTrackId]);

  return {
    loadedTrackId,
    hasRestoredTrack,
    setHasRestoredTrack
  };
}
