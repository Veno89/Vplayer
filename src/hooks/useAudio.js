import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AUDIO_RETRY_CONFIG, STORAGE_KEYS } from '../utils/constants';
import { useErrorHandler } from '../services/ErrorHandler';
import { useToast } from './useToast';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
  
  // Error handling
  const toast = useToast();
  const errorHandler = useErrorHandler(toast);
  
  // Load volume from localStorage or use initialVolume
  const savedVolume = localStorage.getItem(STORAGE_KEYS.PLAYER_STATE);
  const initialVol = savedVolume ? JSON.parse(savedVolume).volume : initialVolume;
  const [volume, setVolumeState] = useState(initialVol ?? initialVolume);
  
  const progressIntervalRef = useRef(null);
  const currentTrackRef = useRef(null);
  const retryCountRef = useRef(0);

  // Check if audio backend is available on mount
  useEffect(() => {
    const checkAudioBackend = async () => {
      try {
        await invoke('is_playing');
        setAudioBackendError(null);
      } catch (err) {
        setAudioBackendError(`Audio system unavailable: ${err}`);
        errorHandler.handle(err, 'Audio Backend Initialization');
      }
    };
    
    checkAudioBackend();
  }, []);

  // Update progress by polling the backend for real position
  useEffect(() => {
    if (isPlaying && duration > 0) {
      progressIntervalRef.current = setInterval(async () => {
        // Skip polling if we're in the middle of a seek operation
        if (isSeekingRef.current) return;
        
        try {
          // Get real position from Rust backend
          const position = await invoke('get_position');
          setProgress(position);
          
          if (onTimeUpdate) {
            onTimeUpdate(position);
          }
          
          // Check if track finished
          if (position >= duration - 0.1) {
            const finished = await invoke('is_finished');
            if (finished) {
              setIsPlaying(false);
              setProgress(0);
              if (onEnded) onEnded();
            }
          }
        } catch (err) {
          console.error('Failed to get position:', err);
        }
      }, 100); // Poll every 100ms for smooth updates
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
  }, [isPlaying, duration, onEnded, onTimeUpdate]);

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
        await invoke('load_track', { path: track.path });
        currentTrackRef.current = track;
        
        // Get real duration from backend
        const realDuration = await invoke('get_duration');
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
    
    try {
      await invoke('play_audio');
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to play:', err);
      throw err;
    }
  }, [audioBackendError]);

  const pause = useCallback(async () => {
    if (audioBackendError) return;
    
    try {
      console.log('Calling pause_audio command');
      await invoke('pause_audio');
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
      await invoke('stop_audio');
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
      await invoke('set_volume', { volume: clampedVolume });
      setVolumeState(clampedVolume);
      localStorage.setItem('vplayer_volume', clampedVolume.toString());
    } catch (err) {
      errorHandler.handle(err, 'Audio Volume');
      throw err;
    }
  }, [audioBackendError, errorHandler]);

  const seek = useCallback(async (position) => {
    if (audioBackendError) return; // Silently fail
    
    // Set seeking flag to pause polling
    isSeekingRef.current = true;
    
    try {
      await invoke('seek_to', { position });
      // Update UI after successful seek to ensure we show the correct position
      setProgress(position);
    } catch (err) {
      console.error('Failed to seek:', err);
      // Don't update progress on error
    } finally {
      // Small delay before resuming polling to ensure backend has updated
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 50);
    }
  }, [audioBackendError]);

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