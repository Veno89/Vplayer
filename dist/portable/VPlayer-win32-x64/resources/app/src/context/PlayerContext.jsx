import React, { createContext, useContext, useState } from 'react';

const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('none');
  const [loadingTrackIndex, setLoadingTrackIndex] = useState(null);

  const value = {
    currentTrack, setCurrentTrack,
    playing, setPlaying,
    progress, setProgress,
    duration, setDuration,
    volume, setVolume,
    shuffle, setShuffle,
    repeatMode, setRepeatMode,
    loadingTrackIndex, setLoadingTrackIndex
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  return useContext(PlayerContext);
}
