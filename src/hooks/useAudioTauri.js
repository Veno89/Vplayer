import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useAudioTauri({ onEnded, onTimeUpdate, initialVolume = 1.0 }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Load volume from localStorage or use initialVolume
  const savedVolume = localStorage.getItem('vplayer_volume');
  const [volume, setVolumeState] = useState(
    savedVolume !== null ? parseFloat(savedVolume) : initialVolume
  );
  
  const progressIntervalRef = useRef(null);
  const currentTrackRef = useRef(null);

  // Update progress periodically when playing
  useEffect(() => {
    if (isPlaying && duration > 0) {
      progressIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 0.1;
          if (newProgress >= duration) {
            if (onEnded) onEnded();
            setIsPlaying(false);
            return 0;
          }
          if (onTimeUpdate) onTimeUpdate(newProgress);
          return newProgress;
        });
      }, 100);
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
    try {
      setIsLoading(true);
      await invoke('load_track', { path: track.path });
      currentTrackRef.current = track;
      setDuration(track.duration || 0);
      setProgress(0);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load track:', err);
      setIsLoading(false);
    }
  }, []);

  const play = useCallback(async () => {
    try {
      await invoke('play_audio');
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to play:', err);
    }
  }, []);

  const pause = useCallback(async () => {
    try {
      await invoke('pause_audio');
      setIsPlaying(false);
    } catch (err) {
      console.error('Failed to pause:', err);
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await invoke('stop_audio');
      setIsPlaying(false);
      setProgress(0);
    } catch (err) {
      console.error('Failed to stop:', err);
    }
  }, []);

  const changeVolume = useCallback(async (newVolume) => {
    try {
      const clampedVolume = Math.max(0, Math.min(1, newVolume));
      await invoke('set_volume', { volume: clampedVolume });
      setVolumeState(clampedVolume);
      localStorage.setItem('vplayer_volume', clampedVolume.toString());
    } catch (err) {
      console.error('Failed to set volume:', err);
    }
  }, []);

  const seek = useCallback(async (position) => {
    try {
      await invoke('seek_to', { position });
      setProgress(position);
    } catch (err) {
      // Seeking not supported in rodio 0.17, just update progress
      setProgress(position);
    }
  }, []);

  return {
    isPlaying,
    isLoading,
    progress,
    duration,
    volume: volume,
    loadTrack,
    play,
    pause,
    stop,
    changeVolume,
    seek,
  };
}
