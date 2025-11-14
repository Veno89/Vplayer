import { useState, useEffect, useRef } from 'react';
import { ERROR_MESSAGES, DEFAULT_PREFERENCES, STORAGE_KEYS } from '../utils/constants';

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
}) {
  const [loadedTrackId, setLoadedTrackId] = useState(null);
  const [hasRestoredTrack, setHasRestoredTrack] = useState(false);
  const lastToastTrackId = useRef(null);

  // Restore last played track on mount
  useEffect(() => {
    if (hasRestoredTrack || tracks.length === 0) return;
    
    const savedTrackId = localStorage.getItem('vplayer_last_track');
    if (savedTrackId) {
      const trackIndex = tracks.findIndex(t => t.id === savedTrackId);
      if (trackIndex !== -1) {
        // This will be handled by setCurrentTrack in parent
      }
    }
    setHasRestoredTrack(true);
  }, [tracks, hasRestoredTrack]);

  // Load track when currentTrack changes
  useEffect(() => {
    const loadTrack = async () => {
      if (currentTrack !== null && tracks[currentTrack]) {
        const track = tracks[currentTrack];
        
        // Don't reload if already loaded
        if (loadedTrackId === track.id) {
          // Position will be saved by the separate progress effect
          return;
        }
        
        // Save last played track (position will be saved incrementally during playback)
        localStorage.setItem('vplayer_last_track', track.id);
        localStorage.setItem('vplayer_last_position', '0');
        
        console.log('Loading track:', track.name);
        setLoadingTrackIndex(currentTrack);
        
        try {
          await audio.loadTrack(track);
          setLoadedTrackId(track.id);
          setLoadingTrackIndex(null);
          setDuration(track.duration || 0);
          
          // Restore last position if this is the restored track
          const savedTrackId = localStorage.getItem('vplayer_last_track');
          if (track.id === savedTrackId && hasRestoredTrack) {
            const savedPosition = localStorage.getItem('vplayer_last_position');
            if (savedPosition) {
              const position = parseFloat(savedPosition);
              if (position > 0 && position < track.duration) {
                await audio.seek(position);
              }
            }
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
          
          // Get user preferences
          const preferences = (() => {
            try {
              const raw = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
              return raw ? { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) } : DEFAULT_PREFERENCES;
            } catch {
              return DEFAULT_PREFERENCES;
            }
          })();
          
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
              if (tracks.length > 1 && handleNextTrack) {
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

  // Separate effect to save progress periodically
  useEffect(() => {
    if (loadedTrackId && progress > 0) {
      localStorage.setItem('vplayer_last_position', progress.toString());
    }
  }, [progress, loadedTrackId]);

  return {
    loadedTrackId,
    hasRestoredTrack,
    setHasRestoredTrack
  };
}
