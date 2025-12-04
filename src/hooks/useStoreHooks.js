import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { COLOR_SCHEMES } from '../utils/colorSchemes';

/**
 * Custom hook for window management using Zustand store
 */
export function useWindowManagement() {
  const windows = useStore((state) => state.windows);
  const setWindows = useStore((state) => state.setWindows);
  const updateWindow = useStore((state) => state.updateWindow);
  const setMaxZIndex = useStore((state) => state.setMaxZIndex);
  const bringToFront = useStore((state) => state.bringToFront);
  const toggleWindow = useStore((state) => state.toggleWindow);

  return {
    windows,
    setWindows,
    updateWindow,
    setMaxZIndex,
    bringToFront,
    toggleWindow
  };
}

/**
 * Custom hook for UI state using Zustand store
 */
export function useUIState() {
  const colorScheme = useStore((state) => state.colorScheme);
  const setColorScheme = useStore((state) => state.setColorScheme);
  const customThemes = useStore((state) => state.customThemes);

  // Compute current colors - use useMemo to prevent infinite loops
  const currentColors = useMemo(() => {
    return customThemes[colorScheme] || COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.default;
  }, [colorScheme, customThemes]);
  
  // Compute all color schemes (built-in + custom)
  const colorSchemes = useMemo(() => {
    return { ...COLOR_SCHEMES, ...customThemes };
  }, [customThemes]);
  const saveCustomTheme = useStore((state) => state.saveCustomTheme);
  const deleteCustomTheme = useStore((state) => state.deleteCustomTheme);
  const applyCustomTheme = useStore((state) => state.applyCustomTheme);
  const debugVisible = useStore((state) => state.debugVisible);
  const setDebugVisible = useStore((state) => state.setDebugVisible);
  
  // Get layouts from store
  const getLayouts = useStore((state) => state.getLayouts);
  const layouts = useMemo(() => getLayouts(), [getLayouts]);
  
  const currentLayout = useStore((state) => state.currentLayout);
  const applyLayout = useStore((state) => state.applyLayout);
  const backgroundImage = useStore((state) => state.backgroundImage);
  const setBackgroundImage = useStore((state) => state.setBackgroundImage);
  const backgroundBlur = useStore((state) => state.backgroundBlur);
  const setBackgroundBlur = useStore((state) => state.setBackgroundBlur);
  const backgroundOpacity = useStore((state) => state.backgroundOpacity);
  const setBackgroundOpacity = useStore((state) => state.setBackgroundOpacity);
  const windowOpacity = useStore((state) => state.windowOpacity);
  const setWindowOpacity = useStore((state) => state.setWindowOpacity);
  const fontSize = useStore((state) => state.fontSize);
  const setFontSize = useStore((state) => state.setFontSize);

  // Playback settings
  const gaplessPlayback = useStore((state) => state.gaplessPlayback);
  const autoPlayOnStartup = useStore((state) => state.autoPlayOnStartup);
  const resumeLastTrack = useStore((state) => state.resumeLastTrack);
  
  // Library settings
  const autoScanOnStartup = useStore((state) => state.autoScanOnStartup);

  return {
    colorScheme,
    setColorScheme,
    currentColors,
    colorSchemes,
    customThemes,
    saveCustomTheme,
    deleteCustomTheme,
    applyCustomTheme,
    debugVisible,
    setDebugVisible,
    layouts,
    currentLayout,
    applyLayout,
    backgroundImage,
    setBackgroundImage,
    backgroundBlur,
    setBackgroundBlur,
    backgroundOpacity,
    setBackgroundOpacity,
    windowOpacity,
    setWindowOpacity,
    fontSize,
    setFontSize,
    gaplessPlayback,
    autoPlayOnStartup,
    resumeLastTrack,
    autoScanOnStartup
  };
}

/**
 * Custom hook for player state using Zustand store
 */
export function usePlayerState() {
  const currentTrack = useStore((state) => state.currentTrack);
  const setCurrentTrack = useStore((state) => state.setCurrentTrack);
  const playing = useStore((state) => state.playing);
  const setPlaying = useStore((state) => state.setPlaying);
  const progress = useStore((state) => state.progress);
  const setProgress = useStore((state) => state.setProgress);
  const duration = useStore((state) => state.duration);
  const setDuration = useStore((state) => state.setDuration);
  const volume = useStore((state) => state.volume);
  const setVolume = useStore((state) => state.setVolume);
  const shuffle = useStore((state) => state.shuffle);
  const setShuffle = useStore((state) => state.setShuffle);
  const repeatMode = useStore((state) => state.repeatMode);
  const setRepeatMode = useStore((state) => state.setRepeatMode);
  const loadingTrackIndex = useStore((state) => state.loadingTrackIndex);
  const setLoadingTrackIndex = useStore((state) => state.setLoadingTrackIndex);

  return {
    currentTrack,
    setCurrentTrack,
    playing,
    setPlaying,
    progress,
    setProgress,
    duration,
    setDuration,
    volume,
    setVolume,
    shuffle,
    setShuffle,
    repeatMode,
    setRepeatMode,
    loadingTrackIndex,
    setLoadingTrackIndex
  };
}