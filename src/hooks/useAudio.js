import { useState, useEffect, useCallback, useRef } from 'react';
import { TauriAPI } from '../services/TauriAPI';
import { AUDIO_RETRY_CONFIG } from '../utils/constants';
import { useErrorHandler } from '../services/ErrorHandler';
import { useToast } from './useToast';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Threshold for considering audio "long idle" - matches Rust LONG_PAUSE_THRESHOLD
const LONG_IDLE_THRESHOLD_SECONDS = 5 * 60; // 5 minutes

// Timeout for backend operations to prevent UI freezing
const BACKEND_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Wrap a promise with a timeout to prevent indefinite hangs
 */
const withTimeout = (promise, ms, errorMsg = 'Operation timed out') => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg)), ms)
    )
  ]);
};

/**
 * Audio playback hook
 * 
 * Manages the audio engine with retry logic and error handling.
 * Handles:
 * - Track loading with automatic retries
 * - Play/pause control
 * - Volume management
 * - Progress tracking via polling
 * - Error recovery
 * - Long-idle detection and proactive recovery
 * 
 * @param {Object} params - Hook parameters
 * @param {Function} params.onEnded - Callback when track finishes
 * @param {Function} params.onTimeUpdate - Callback for progress updates
 * @param {number} params.initialVolume - Initial volume level (0-1)
 * 
 * @returns {Object} Audio control interface
 * @returns {boolean} returns.isPlaying - Whether audio is playing
 * @returns {boolean} returns.isLoading - Whether track is loading
 * @returns {number} returns.progress - Current position in seconds
 * @returns {number} returns.duration - Track duration in seconds
 * @returns {number} returns.volume - Current volume (0-1)
 * @returns {Function} returns.loadTrack - Load a track by path
 * @returns {Function} returns.play - Start playback
 * @returns {Function} returns.pause - Pause playback
 * @returns {Function} returns.seek - Seek to position
 * @returns {Function} returns.changeVolume - Change volume level
 * @returns {string|null} returns.audioBackendError - Error message if backend unavailable
 */
export function useAudio({ onEnded, onTimeUpdate, initialVolume = 1.0 }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioBackendError, setAudioBackendError] = useState(null);
  
  // Track if we're currently seeking to avoid polling race conditions
  const isSeekingRef = useRef(false);
  // Track if we're in the middle of a recovery
  const isRecoveringRef = useRef(false);
  
  // CRITICAL: Store callbacks in refs so the polling interval always calls the latest version.
  // Without this, the setInterval closure captures the initial onEnded/onTimeUpdate and
  // they become stale after hours of idle, causing wrong-track or crash bugs.
  const onEndedRef = useRef(onEnded);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  
  // Error handling
  const toast = useToast();
  const errorHandler = useErrorHandler(toast);
  
  // Volume state - initialVolume comes from the Zustand store (persisted)
  const [volume, setVolumeState] = useState(initialVolume);
  
  const progressIntervalRef = useRef(null);
  const currentTrackRef = useRef(null);
  const retryCountRef = useRef(0);
  const pollErrorCountRef = useRef(0);
  const MAX_POLL_ERRORS = 5;

  // Check if audio backend is available on mount
  useEffect(() => {
    const checkAudioBackend = async () => {
      try {
        await TauriAPI.isPlaying();
        setAudioBackendError(null);
      } catch (err) {
        setAudioBackendError(`Audio system unavailable: ${err}`);
        errorHandler.handle(err, 'Audio Backend Initialization');
      }
    };
    
    checkAudioBackend();
  }, []);

  // Update progress by polling the backend for real position
  // Uses adaptive polling: 100ms when playing, 1000ms when paused
  useEffect(() => {
    const pollInterval = isPlaying ? 100 : 1000; // Slower polling when paused to reduce load
    
    if (duration > 0) {
      progressIntervalRef.current = setInterval(async () => {
        // Skip polling if we're in the middle of a seek or recovery operation
        if (isSeekingRef.current || isRecoveringRef.current) return;
        
        try {
          // Get real position from Rust backend with timeout to prevent hangs
          const position = await withTimeout(
            TauriAPI.getPosition(),
            2000, // 2 second timeout for polling
            'Position polling timed out'
          );
          setProgress(position);
          
          // Reset error count on successful poll
          pollErrorCountRef.current = 0;
          
          // Use ref to always call the latest onTimeUpdate callback
          if (onTimeUpdateRef.current) {
            onTimeUpdateRef.current(position);
          }
          
          // Check if track finished (only when playing)
          if (isPlaying && position >= duration - 0.1) {
            const finished = await withTimeout(
              TauriAPI.isFinished(),
              2000,
              'Finished check timed out'
            );
            if (finished) {
              setIsPlaying(false);
              setProgress(0);
              // Use ref to always call the latest onEnded callback
              if (onEndedRef.current) onEndedRef.current();
            }
          }
          
          // Periodic health check: verify audio is actually playing when we think it is
          // This catches the case where audio stops unexpectedly mid-track
          if (isPlaying && position < duration - 1) {
            try {
              const actuallyPlaying = await TauriAPI.isPlaying();
              if (!actuallyPlaying) {
                console.warn('[useAudio] Audio stopped unexpectedly at position:', position, '/', duration);
                // Audio stopped but we think it's playing - try to recover
                const isFinished = await TauriAPI.isFinished();
                if (isFinished && position < duration - 1) {
                  // Audio finished prematurely - this is the bug!
                  console.error('[useAudio] Audio finished prematurely, attempting recovery...');
                  // Reload and seek to current position
                  const currentPath = currentTrackRef.current?.path;
                  if (currentPath) {
                    try {
                      await TauriAPI.loadTrack(currentPath);
                      await TauriAPI.seekTo(position);
                      await TauriAPI.play();
                      console.log('[useAudio] Recovered from premature audio stop');
                    } catch (recoveryErr) {
                      console.error('[useAudio] Recovery failed:', recoveryErr);
                      setIsPlaying(false);
                    }
                  }
                }
              }
            } catch (healthErr) {
              // Ignore health check errors
              console.debug('[useAudio] Health check failed:', healthErr);
            }
          }
        } catch (err) {
          console.error('Failed to get position:', err);
          pollErrorCountRef.current++;
          
          // If we get too many consecutive errors, try to recover
          if (pollErrorCountRef.current >= MAX_POLL_ERRORS) {
            console.warn('Too many poll errors, attempting audio backend recovery...');
            pollErrorCountRef.current = 0;
            
            // Prevent concurrent recovery
            if (isRecoveringRef.current) return;
            isRecoveringRef.current = true;
            
            try {
              // Try to reinitialize the audio backend connection
              const recovered = await withTimeout(
                TauriAPI.recoverAudio(),
                BACKEND_TIMEOUT_MS,
                'Audio recovery timed out'
              );
              if (recovered) {
                console.log('Audio backend recovered successfully');
                setAudioBackendError(null);
              } else {
                console.error('Audio backend recovery returned false');
                setAudioBackendError('Audio system became unresponsive. Please restart the application.');
              }
            } catch (recoveryErr) {
              console.error('Audio backend recovery failed:', recoveryErr);
              setAudioBackendError('Audio system became unresponsive. Please restart the application.');
            } finally {
              isRecoveringRef.current = false;
            }
          }
        }
      }, pollInterval);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
    
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying, duration]);
  // Note: onEnded and onTimeUpdate are NOT in deps - we use refs (onEndedRef, onTimeUpdateRef)
  // so the interval always calls the latest callbacks without needing to be recreated.
  // This prevents the polling interval from being torn down & rebuilt every time a parent
  // re-renders, which was causing stale state after long idle periods.

  const loadTrack = useCallback(async (track) => {
    // Check if audio backend is available
    if (audioBackendError) {
      console.error('Cannot load track - audio backend unavailable:', audioBackendError);
      throw new Error('Audio system unavailable. Please restart the application.');
    }
    
    let attempt = 0;
    let lastError = null;
    
    while (attempt <= AUDIO_RETRY_CONFIG.MAX_RETRIES) {
      try {
        setIsLoading(true);
        await TauriAPI.loadTrack(track.path);
        currentTrackRef.current = track;
        
        // Get real duration from backend
        const realDuration = await TauriAPI.getDuration();
        setDuration(realDuration > 0 ? realDuration : track.duration || 0);
        setProgress(0);
        setIsLoading(false);
        retryCountRef.current = 0; // Reset retry count on success
        return; // Success!
      } catch (err) {
        lastError = err;
        attempt++;
        
        if (attempt > AUDIO_RETRY_CONFIG.MAX_RETRIES) {
          console.error(`Failed to load track after ${AUDIO_RETRY_CONFIG.MAX_RETRIES} retries:`, err);
          setIsLoading(false);
          retryCountRef.current = 0;
          throw new Error(`Failed to load track: ${err.message || err}`);
        }
        
        // Calculate exponential backoff delay
        const delay = Math.min(
          AUDIO_RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(AUDIO_RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1),
          AUDIO_RETRY_CONFIG.MAX_DELAY_MS
        );
        
        console.warn(`Load attempt ${attempt} failed, retrying in ${delay}ms...`, err);
        await sleep(delay);
      }
    }
    
    // Should not reach here, but just in case
    setIsLoading(false);
    throw lastError || new Error('Failed to load track');
  }, [audioBackendError]);

  const play = useCallback(async () => {
    if (audioBackendError) {
      console.error('Cannot play - audio backend unavailable:', audioBackendError);
      return; // Silently fail for play
    }
    
    // Prevent concurrent recovery attempts
    if (isRecoveringRef.current) {
      console.log('Recovery already in progress, skipping play');
      return;
    }
    
    try {
      // Check if audio device is available
      const deviceAvailable = await TauriAPI.isAudioDeviceAvailable();
      if (!deviceAvailable) {
        toast.showError('No audio device found. Please connect headphones or speakers.');
        setAudioBackendError('No audio device available');
        return;
      }
      
      // Check if audio device has changed (e.g., external DAC reconnected)
      const deviceChanged = await TauriAPI.hasAudioDeviceChanged();
      
      // Check if audio has been idle for a long time
      const inactiveDuration = await TauriAPI.getInactiveDuration();
      
      if (deviceChanged) {
        console.log('Audio device changed, backend will reinitialize...');
        toast.showInfo('Audio device changed, reconnecting...', 2000);
      } else if (inactiveDuration > LONG_IDLE_THRESHOLD_SECONDS) {
        console.log(`Audio has been idle for ${Math.round(inactiveDuration / 60)} minutes, backend will reinitialize...`);
        toast.showInfo('Resuming playback...', 2000);
      }
      
      await TauriAPI.play();
      setIsPlaying(true);
      setAudioBackendError(null); // Clear any previous error
    } catch (err) {
      console.error('Failed to play:', err);
      
      // If play fails, try explicit recovery
      try {
        console.log('Play failed, attempting explicit recovery...');
        isRecoveringRef.current = true;
        toast.showWarning('Reinitializing audio system...');
        
        const recovered = await TauriAPI.recoverAudio();
        if (recovered) {
          console.log('Recovery successful, retrying play...');
          await TauriAPI.play();
          setIsPlaying(true);
          setAudioBackendError(null);
          toast.showSuccess('Audio resumed');
        } else {
          throw new Error('Audio recovery returned false');
        }
      } catch (recoveryErr) {
        console.error('Recovery failed:', recoveryErr);
        setAudioBackendError('Audio system unresponsive. Please restart the application.');
        toast.showError('Audio system error. Please restart the app.');
      } finally {
        isRecoveringRef.current = false;
      }
    }
  }, [audioBackendError, toast]);

  const pause = useCallback(async () => {
    if (audioBackendError) return;
    
    try {
      console.log('Calling pause_audio command');
      await TauriAPI.pause();
      console.log('Pause command completed, setting isPlaying to false');
      setIsPlaying(false);
    } catch (err) {
      console.error('Failed to pause:', err);
      throw err;
    }
  }, [audioBackendError]);

  const stop = useCallback(async () => {
    if (audioBackendError) return; // Silently fail
    
    try {
      await TauriAPI.stop();
      setIsPlaying(false);
      setProgress(0);
    } catch (err) {
      console.error('Failed to stop:', err);
      throw err;
    }
  }, [audioBackendError]);

  const changeVolume = useCallback(async (newVolume) => {
    if (audioBackendError) {
      errorHandler.logOnly('Cannot change volume - audio backend unavailable', 'Audio Volume');
      return;
    }
    
    try {
      const clampedVolume = Math.max(0, Math.min(1, newVolume));
      await TauriAPI.setVolume(clampedVolume);
      setVolumeState(clampedVolume);
    } catch (err) {
      errorHandler.handle(err, 'Audio Volume');
      throw err;
    }
  }, [audioBackendError, errorHandler]);

  const seek = useCallback(async (position) => {
    if (audioBackendError) return; // Silently fail
    if (isRecoveringRef.current) return; // Don't seek during recovery
    
    // Set seeking flag to pause polling
    isSeekingRef.current = true;
    
    try {
      // Check for long idle - if so, the Rust play() function will handle reinit
      // but we should warn the user that seek might fail until they press play
      const inactiveDuration = await TauriAPI.getInactiveDuration();
      if (inactiveDuration > LONG_IDLE_THRESHOLD_SECONDS) {
        console.warn('Seeking while audio is idle for a long time - may need to press play first');
      }
      
      await TauriAPI.seekTo(position);
      // Update UI after successful seek to ensure we show the correct position
      setProgress(position);
    } catch (err) {
      console.error('Failed to seek:', err);
      
      // If seek fails due to stale audio, inform the user
      if (err.toString().includes('No file loaded') || err.toString().includes('error')) {
        toast.showWarning('Press play to resume playback');
      }
    } finally {
      // Small delay before resuming polling to ensure backend has updated
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 50);
    }
  }, [audioBackendError, toast]);

  return {
    isPlaying,
    isLoading,
    progress,
    duration,
    volume: volume,
    audioBackendError,
    loadTrack,
    play,
    pause,
    stop,
    changeVolume,
    seek,
  };
}