import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AUDIO_RETRY_CONFIG, STORAGE_KEYS } from '../utils/constants';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function useAudio({ onEnded, onTimeUpdate, initialVolume = 1.0 }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioBackendError, setAudioBackendError] = useState(null);
  
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
        console.error('Audio backend initialization failed:', err);
      }
    };
    
    checkAudioBackend();
  }, []);

  // Update progress by polling the backend for real position
  useEffect(() => {
    if (isPlaying && duration > 0) {
      progressIntervalRef.current = setInterval(async () => {
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
    if (audioBackendError) return; // Silently fail
    
    try {
      await invoke('pause_audio');
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
    if (audioBackendError) return; // Silently fail
    
    try {
      const clampedVolume = Math.max(0, Math.min(1, newVolume));
      await invoke('set_volume', { volume: clampedVolume });
      setVolumeState(clampedVolume);
      localStorage.setItem('vplayer_volume', clampedVolume.toString());
    } catch (err) {
      console.error('Failed to set volume:', err);
      throw err;
    }
  }, [audioBackendError]);

  const seek = useCallback(async (position) => {
    if (audioBackendError) return; // Silently fail
    
    try {
      await invoke('seek_to', { position });
      setProgress(position);
    } catch (err) {
      console.error('Failed to seek:', err);
      // Don't throw - seeking might not be supported for all formats
      // Just update UI position optimistically
      setProgress(position);
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