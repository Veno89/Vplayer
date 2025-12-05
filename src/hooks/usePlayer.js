import { useCallback, useRef, useEffect, useState } from 'react';
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
  const crossfadeInProgressRef = useRef(false);
  const previousVolumeRef = useRef(0.7); // Store volume before muting
  const userVolumeRef = useRef(volume); // Track user's intended volume (not affected by crossfade)
  const seekTimeoutRef = useRef(null);
  const lastSeekTimeRef = useRef(0);

  // Keep user volume in sync
  useEffect(() => {
    if (!crossfadeInProgressRef.current) {
      userVolumeRef.current = volume;
    }
  }, [volume]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Calculate the next track index based on playback mode
   * Prioritizes queue over shuffle/normal playback
   */
  const getNextTrackIndex = useCallback((current, totalTracks, isShuffled, repeat) => {
    console.log('[getNextTrackIndex] shuffle:', isShuffled, 'current:', current, 'total:', totalTracks);
    
    // Check queue first - queue always takes priority
    if (store && store.queue && store.queue.length > 0) {
      const nextQueueTrack = store.peekNextInQueue();
      if (nextQueueTrack) {
        // Find the track in the tracks array
        const queueTrackIndex = tracks.findIndex(t => t.id === nextQueueTrack.id);
        if (queueTrackIndex !== -1) {
          store.nextInQueue(); // Only advance queue if track was found
          console.log('[getNextTrackIndex] Using queue, index:', queueTrackIndex);
          return queueTrackIndex;
        } else {
          // Track not found in library, skip it and try next in queue
          console.warn('[getNextTrackIndex] Queue track not found in library, skipping:', nextQueueTrack.id);
          store.nextInQueue(); // Remove invalid track from queue
          // Recursively try next queue item
          return getNextTrackIndex(current, totalTracks, isShuffled, repeat);
        }
      }
    }
    
    // No queue or queue exhausted - use normal playback logic
    if (isShuffled) {
      let nextIdx;
      do {
        nextIdx = Math.floor(Math.random() * totalTracks);
      } while (nextIdx === current && totalTracks > 1);
      console.log('[getNextTrackIndex] Shuffled to:', nextIdx);
      return nextIdx;
    } else {
      const nextIdx = current + 1;
      if (nextIdx < totalTracks) {
        console.log('[getNextTrackIndex] Sequential to:', nextIdx);
        return nextIdx;
      } else if (repeat === 'all') {
        console.log('[getNextTrackIndex] Repeat all, going to 0');
        return 0;
      }
      console.log('[getNextTrackIndex] No next track');
      return null;
    }
  }, [store, tracks]);

  // Crossfade monitoring effect
  useEffect(() => {
    if (!tracks.length || currentTrack === null || !duration) return;
    if (!crossfade || !crossfade.enabled) return;
    
    // Check if we should start crossfade
    if (crossfade.shouldCrossfade(progress, duration) && !crossfadeStartedRef.current) {
      const nextIdx = getNextTrackIndex(currentTrack, tracks.length, shuffle, repeatMode);
      
      if (nextIdx !== null && nextIdx !== currentTrack) {
        crossfadeStartedRef.current = true;
        crossfadeInProgressRef.current = true;
        console.log('[Crossfade] Initiating crossfade to track:', nextIdx);
        
        crossfade.startCrossfade({
          setVolume: (vol) => {
            audio.changeVolume(vol).catch(err => console.error('Volume change failed:', err));
          },
          currentVolume: userVolumeRef.current,
          onMidpoint: () => {
            // Switch to next track at midpoint
            setCurrentTrack(nextIdx);
          },
          onComplete: () => {
            crossfadeStartedRef.current = false;
            crossfadeInProgressRef.current = false;
            nextTrackPreloadedRef.current = false;
            // Restore user's intended volume
            audio.changeVolume(userVolumeRef.current).catch(err => 
              console.error('Failed to restore volume:', err)
            );
          }
        });
      }
    }
    
    // Reset crossfade state when near start of track
    if (progress < 1) {
      crossfadeStartedRef.current = false;
    }
  }, [progress, duration, currentTrack, tracks, shuffle, repeatMode, crossfade, setCurrentTrack, audio, getNextTrackIndex]);

  // Pre-load next track for gapless playback (when crossfade disabled)
  useEffect(() => {
    if (!tracks.length || currentTrack === null || !duration) return;
    if (crossfade?.enabled) return; // Don't preload if crossfade is handling transitions
    
    const timeRemaining = duration - progress;
    
    if (timeRemaining <= 5 && timeRemaining > 0 && !nextTrackPreloadedRef.current) {
      const nextIdx = getNextTrackIndex(currentTrack, tracks.length, shuffle, repeatMode);
      
      if (nextIdx !== null && nextIdx !== currentTrack) {
        const nextTrack = tracks[nextIdx];
        if (nextTrack) {
          console.log(`[Gapless] Preloading next track: ${nextTrack.title || nextTrack.name}`);
          nextTrackPreloadedRef.current = true;
        }
      }
    }
    
    if (progress < 1) {
      nextTrackPreloadedRef.current = false;
    }
  }, [progress, duration, currentTrack, tracks, shuffle, repeatMode, crossfade, getNextTrackIndex]);

  /**
   * Skip to the next track
   * Respects shuffle and repeat modes
   * Cancels any active crossfade
   */
  const handleNextTrack = useCallback(() => {
    if (!tracks.length) return;
    
    // Cancel any in-progress crossfade
    if (crossfade && crossfadeInProgressRef.current) {
      crossfade.cancelCrossfade((vol) => {
        audio.changeVolume(vol).catch(err => console.error('Volume restore failed:', err));
      });
      crossfadeInProgressRef.current = false;
    }
    
    const nextIdx = getNextTrackIndex(currentTrack, tracks.length, shuffle, repeatMode);
    if (nextIdx !== null) {
      setCurrentTrack(nextIdx);
      nextTrackPreloadedRef.current = false;
      crossfadeStartedRef.current = false;
    }
  }, [currentTrack, tracks, shuffle, repeatMode, setCurrentTrack, crossfade, audio, getNextTrackIndex]);

  /**
   * Go to previous track or restart current track
   * If progress > threshold (3s), restarts current track
   * Otherwise goes to previous track
   */
  const handlePrevTrack = useCallback(() => {
    if (!tracks.length) return;
    
    // Cancel any in-progress crossfade
    if (crossfade && crossfadeInProgressRef.current) {
      crossfade.cancelCrossfade((vol) => {
        audio.changeVolume(vol).catch(err => console.error('Volume restore failed:', err));
      });
      crossfadeInProgressRef.current = false;
    }
    
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
  }, [currentTrack, tracks, shuffle, repeatMode, progress, audio, setCurrentTrack, toast, crossfade]);

  /**
   * Seek to a position in the current track
   * @param {number} percent - Position as percentage (0-100)
   */
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
    userVolumeRef.current = newVolume; // Track user's intended volume
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
    const newVolume = Math.min(1, userVolumeRef.current + step);
    handleVolumeChange(newVolume);
  }, [handleVolumeChange]);

  /**
   * Decrease volume by step
   * @param {number} step - Amount to decrease (default 0.05)
   */
  const handleVolumeDown = useCallback((step = 0.05) => {
    const newVolume = Math.max(0, userVolumeRef.current - step);
    handleVolumeChange(newVolume);
  }, [handleVolumeChange]);

  /**
   * Toggle mute state
   * Mutes to 0, unmutes to previous volume
   */
  const handleToggleMute = useCallback(() => {
    if (volume > 0) {
      // Store current volume before muting
      previousVolumeRef.current = userVolumeRef.current;
      handleVolumeChange(0);
    } else {
      // Restore previous volume (default to 0.7 if not set)
      handleVolumeChange(previousVolumeRef.current || 0.7);
    }
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
