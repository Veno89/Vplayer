import { useCallback, useRef, useEffect } from 'react';
import { SEEK_THRESHOLD_SECONDS } from '../utils/constants';

/**
 * Unified player hook combining playback controls and volume management
 * 
 * Handles:
 * - Track navigation (next/previous)
 * - Seeking within tracks
 * - Volume control (up/down/mute)
 * - Track preloading for seamless transitions
 * - Crossfade support between tracks
 * 
 * @param {Object} params - Hook parameters
 * @param {Object} params.audio - Audio service for playback operations
 * @param {Object} params.player - Player state from store
 * @param {Array} params.tracks - Current track list
 * @param {Object} params.toast - Toast notification service
 * @param {Object} params.crossfade - Crossfade service (optional)
 * 
 * @returns {Object} Player control functions
 * @returns {Function} returns.handleNextTrack - Skip to next track
 * @returns {Function} returns.handlePrevTrack - Go to previous track or restart
 * @returns {Function} returns.handleSeek - Seek to position (0-100%)
 * @returns {Function} returns.handleVolumeChange - Set volume (0-1)
 * @returns {Function} returns.handleVolumeUp - Increase volume by step
 * @returns {Function} returns.handleVolumeDown - Decrease volume by step
 * @returns {Function} returns.handleToggleMute - Toggle mute state
 */
export function usePlayer({ 
  audio, 
  player, 
  tracks,
  toast,
  crossfade,
  store
}) {
  const { 
    currentTrack, setCurrentTrack,
    shuffle, 
    repeatMode, 
    progress,
    duration,
    volume,
    setVolume
  } = player;

  const nextTrackPreloadedRef = useRef(false);
  const preloadAudioRef = useRef(null);
  const crossfadeStartedRef = useRef(false);

  // Pre-load next track and handle crossfade
  useEffect(() => {
    if (!tracks.length || currentTrack === null || !duration) return;
    
    const timeRemaining = duration - progress;
    
    // Check if we should start crossfade
    if (crossfade && crossfade.shouldCrossfade(progress, duration) && !crossfadeStartedRef.current) {
      const nextIdx = getNextTrackIndex(currentTrack, tracks.length, shuffle, repeatMode);
      
      if (nextIdx !== null && nextIdx !== currentTrack) {
        crossfadeStartedRef.current = true;
        console.log('Starting crossfade...');
        
        crossfade.startCrossfade(() => {
          setCurrentTrack(nextIdx);
          crossfadeStartedRef.current = false;
          nextTrackPreloadedRef.current = false;
        });
      }
    }
    
    if (timeRemaining <= 5 && timeRemaining > 0 && !nextTrackPreloadedRef.current && !crossfade?.enabled) {
      const nextIdx = getNextTrackIndex(currentTrack, tracks.length, shuffle, repeatMode);
      
      if (nextIdx !== null && nextIdx !== currentTrack) {
        const nextTrack = tracks[nextIdx];
        if (nextTrack) {
          console.log(`Preloading next track: ${nextTrack.title || nextTrack.name}`);
          nextTrackPreloadedRef.current = true;
        }
      }
    }
    
    if (progress < 1) {
      nextTrackPreloadedRef.current = false;
      crossfadeStartedRef.current = false;
    }
  }, [progress, duration, currentTrack, tracks, shuffle, repeatMode, crossfade, setCurrentTrack]);

  /**
   * Calculate the next track index based on playback mode
   * Prioritizes queue over shuffle/normal playback
   * 
   * @param {number} current - Current track index
   * @param {number} totalTracks - Total number of tracks
   * @param {boolean} isShuffled - Whether shuffle is enabled
   * @param {string} repeat - Repeat mode ('off', 'all', 'one')
   * @returns {number|null} Next track index, or null if no next track
   */
  const getNextTrackIndex = (current, totalTracks, isShuffled, repeat) => {
    // Check queue first - queue always takes priority
    if (store && store.queue && store.queue.length > 0) {
      const nextQueueTrack = store.peekNextInQueue();
      if (nextQueueTrack) {
        // Find the track in the tracks array
        const queueTrackIndex = tracks.findIndex(t => t.id === nextQueueTrack.id);
        if (queueTrackIndex !== -1) {
          store.nextInQueue(); // Advance queue
          return queueTrackIndex;
        }
      }
    }
    
    // No queue or queue exhausted - use normal playback logic
    if (isShuffled) {
      let nextIdx;
      do {
        nextIdx = Math.floor(Math.random() * totalTracks);
      } while (nextIdx === current && totalTracks > 1);
      return nextIdx;
    } else {
      const nextIdx = current + 1;
      if (nextIdx < totalTracks) {
        return nextIdx;
      } else if (repeat === 'all') {
        return 0;
      }
      return null;
    }
  };

  /**
   * Skip to the next track
   * Respects shuffle and repeat modes
   * Cancels any active crossfade
   */
  const handleNextTrack = useCallback(() => {
    if (!tracks.length) return;
    
    const nextIdx = getNextTrackIndex(currentTrack, tracks.length, shuffle, repeatMode);
    if (nextIdx !== null) {
      setCurrentTrack(nextIdx);
      nextTrackPreloadedRef.current = false;
      crossfadeStartedRef.current = false;
      if (crossfade) {
        crossfade.cancelCrossfade();
      }
    }
  }, [currentTrack, tracks, shuffle, repeatMode, setCurrentTrack, crossfade]);

  /**
   * Go to previous track or restart current track
   * If progress > threshold (3s), restarts current track
   * Otherwise goes to previous track
   */
  const handlePrevTrack = useCallback(() => {
    if (!tracks.length) return;
    
    if (progress > SEEK_THRESHOLD_SECONDS) {
      audio.seek(0).catch(err => {
        console.error('Failed to seek:', err);
        toast.showError('Failed to seek to beginning');
      });
      return;
    }

    if (shuffle) {
      let prevIdx;
      do {
        prevIdx = Math.floor(Math.random() * tracks.length);
      } while (prevIdx === currentTrack && tracks.length > 1);
      setCurrentTrack(prevIdx);
    } else {
      const prevIdx = currentTrack - 1;
      if (prevIdx >= 0) {
        setCurrentTrack(prevIdx);
      } else if (repeatMode === 'all') {
        setCurrentTrack(tracks.length - 1);
      }
    }
    nextTrackPreloadedRef.current = false;
    crossfadeStartedRef.current = false;
    if (crossfade) {
      crossfade.cancelCrossfade();
    }
  }, [currentTrack, tracks, shuffle, repeatMode, progress, audio, setCurrentTrack, toast, crossfade]);

  /**
   * Seek to a position in the current track
   * @param {number} percent - Position as percentage (0-100)
   */
  const seekTimeoutRef = useRef(null);
  const lastSeekTimeRef = useRef(0);
  const handleSeek = useCallback((percent) => {
    if (duration > 0) {
      const time = (percent / 100) * duration;
      const now = Date.now();
      
      // Clear any pending seek
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
      
      // Throttle backend seeks to max once per 100ms
      const timeSinceLastSeek = now - lastSeekTimeRef.current;
      const delay = timeSinceLastSeek < 100 ? 100 - timeSinceLastSeek : 0;
      
      seekTimeoutRef.current = setTimeout(() => {
        lastSeekTimeRef.current = Date.now();
        audio.seek(time).catch(err => {
          console.error('Failed to seek:', err);
          toast.showWarning('Seeking may not be supported for this file format');
        });
      }, delay);
    }
  }, [duration, audio, toast]);

  /**
   * Set volume to specific level
   * @param {number} newVolume - Volume level (0-1)
   */
  const handleVolumeChange = useCallback((newVolume) => {
    setVolume(newVolume);
    audio.changeVolume(newVolume).catch(err => {
      console.error('Failed to change volume:', err);
      toast.showError('Failed to change volume');
    });
  }, [audio, setVolume, toast]);

  /**
   * Increase volume by step
   * @param {number} step - Amount to increase (default 0.05)
   */
  const handleVolumeUp = useCallback((step = 0.05) => {
    const newVolume = Math.min(1, volume + step);
    handleVolumeChange(newVolume);
  }, [volume, handleVolumeChange]);

  /**
   * Decrease volume by step
   * @param {number} step - Amount to decrease (default 0.05)
   */
  const handleVolumeDown = useCallback((step = 0.05) => {
    const newVolume = Math.max(0, volume - step);
    handleVolumeChange(newVolume);
  }, [volume, handleVolumeChange]);

  /**
   * Toggle mute state
   * Mutes to 0, unmutes to 0.7
   */
  const handleToggleMute = useCallback(() => {
    const newVolume = volume > 0 ? 0 : 0.7;
    handleVolumeChange(newVolume);
  }, [volume, handleVolumeChange]);

  return {
    // Playback
    handleNextTrack,
    handlePrevTrack,
    handleSeek,
    // Volume
    handleVolumeChange,
    handleVolumeUp,
    handleVolumeDown,
    handleToggleMute
  };
}
