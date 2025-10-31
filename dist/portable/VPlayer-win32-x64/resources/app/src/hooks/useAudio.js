import { useRef, useState, useEffect, useCallback } from 'react';

export function useAudio({
  onEnded,
  onLoadedMetadata,
  onTimeUpdate,
  onError,
  initialVolume = 1.0,
}) {
  const audioRef = useRef(null);
  const loadTokenRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(Math.max(0, Math.min(1, initialVolume)));
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [loop, setLoop] = useState(false);

  // Play with promise handling
  const play = useCallback(async () => {
    if (audioRef.current) {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Playback failed:', error);
        setIsPlaying(false);
      }
    }
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  // Seek to specific time
  const seek = useCallback((time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, duration));
    }
  }, [duration]);

  // Skip forward/backward
  const skip = useCallback((seconds) => {
    if (audioRef.current) {
      seek(audioRef.current.currentTime + seconds);
    }
  }, [seek]);

  const loadSrc = useCallback((src) => {
    if (audioRef.current) {
      loadTokenRef.current++;
      audioRef.current.src = src;
      audioRef.current.load();
      setIsPlaying(false);
      setProgress(0);
      setDuration(0);
    }
  }, []);

  // Volume control with bounds checking
  const changeVolume = useCallback((newVolume) => {
    setVolume(Math.max(0, Math.min(1, newVolume)));
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  // Playback rate control
  const changePlaybackRate = useCallback((rate) => {
    setPlaybackRate(Math.max(0.25, Math.min(4, rate)));
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Sync mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Sync playback rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Sync loop
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = loop;
    }
  }, [loop]);

  // Event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      onLoadedMetadata?.(audio.duration);
    };

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime || 0);
      onTimeUpdate?.(audio.currentTime);
    };

    const handleError = (e) => {
      setIsPlaying(false);
      setIsLoading(false);
      onError?.(e);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handlePlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
    };
  }, [onEnded, onLoadedMetadata, onTimeUpdate, onError]);

  return {
    audioRef,
    loadTokenRef,
    // State
    isPlaying,
    isLoading,
    progress,
    duration,
    volume,
    isMuted,
    playbackRate,
    loop,
    // Controls
    play,
    pause,
    togglePlayPause,
    seek,
    skip,
    loadSrc,
    changeVolume,
    toggleMute,
    changePlaybackRate,
    setLoop,
  };
}