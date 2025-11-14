import { useCallback, useRef, useEffect } from 'react';
import { SEEK_THRESHOLD_SECONDS } from '../utils/constants';

/**
 * Unified player hook combining playback controls and volume management
 */
export function usePlayer({ 
  audio, 
  player, 
  tracks,
  toast,
  crossfade
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

  // Helper to get next track index
  const getNextTrackIndex = (current, totalTracks, isShuffled, repeat) => {
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

  // Playback controls
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

  const handleSeek = useCallback((percent) => {
    if (duration > 0) {
      const time = (percent / 100) * duration;
      audio.seek(time).catch(err => {
        console.error('Failed to seek:', err);
        toast.showWarning('Seeking may not be supported for this file format');
      });
    }
  }, [duration, audio, toast]);

  // Volume controls
  const handleVolumeChange = useCallback((newVolume) => {
    setVolume(newVolume);
    audio.changeVolume(newVolume).catch(err => {
      console.error('Failed to change volume:', err);
      toast.showError('Failed to change volume');
    });
  }, [audio, setVolume, toast]);

  const handleVolumeUp = useCallback((step = 0.05) => {
    const newVolume = Math.min(1, volume + step);
    handleVolumeChange(newVolume);
  }, [volume, handleVolumeChange]);

  const handleVolumeDown = useCallback((step = 0.05) => {
    const newVolume = Math.max(0, volume - step);
    handleVolumeChange(newVolume);
  }, [volume, handleVolumeChange]);

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
