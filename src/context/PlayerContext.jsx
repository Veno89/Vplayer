import React, { createContext, useContext, useState, useEffect } from 'react';

const PlayerContext = createContext();

/**
 * PlayerProvider manages all playback-related state.
 * Persists volume, shuffle, and repeat settings to localStorage.
 */
export function PlayerProvider({ children }) {
  // Load persisted player state
  const persistedState = (() => {
    try {
      const raw = localStorage.getItem('vplayer_player');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();

  // Playback state
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingTrackIndex, setLoadingTrackIndex] = useState(null);

  // User preferences (persisted)
  const [volume, setVolume] = useState(persistedState.volume ?? 0.7);
  const [shuffle, setShuffle] = useState(persistedState.shuffle ?? false);
  const [repeatMode, setRepeatMode] = useState(persistedState.repeatMode ?? 'off'); // 'off', 'all', 'one'

  // Persist user preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('vplayer_player', JSON.stringify({
        volume,
        shuffle,
        repeatMode
      }));
    } catch (err) {
      console.warn('Failed to persist player state:', err);
    }
  }, [volume, shuffle, repeatMode]);

  // Reset progress when track changes
  useEffect(() => {
    setProgress(0);
  }, [currentTrack]);

  const value = {
    // Playback state
    currentTrack,
    setCurrentTrack,
    playing,
    setPlaying,
    progress,
    setProgress,
    duration,
    setDuration,
    loadingTrackIndex,
    setLoadingTrackIndex,
    
    // User preferences
    volume,
    setVolume,
    shuffle,
    setShuffle,
    repeatMode,
    setRepeatMode,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

/**
 * Hook to access player context
 */
export function usePlayer() {
  const context = useContext(PlayerContext);
  
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  
  return context;
}