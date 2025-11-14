import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';

/**
 * Custom hook for window management using Zustand store
 */
export function useWindowManagement() {
  const windows = useStore((state) => state.windows);
  const setWindows = useStore((state) => state.setWindows);
  const setMaxZIndex = useStore((state) => state.setMaxZIndex);
  const bringToFront = useStore((state) => state.bringToFront);
  const toggleWindow = useStore((state) => state.toggleWindow);

  return {
    windows,
    setWindows,
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
    const COLOR_SCHEMES = {
      default: { name: 'default', label: 'Classic', accent: 'text-white', background: '#1e293b', primary: 'bg-cyan-500', color: '#06b6d4' },
      blue: { name: 'blue', label: 'Ocean Blue', accent: 'text-blue-400', background: '#1e3a8a', primary: 'bg-blue-500', color: '#3b82f6' },
      emerald: { name: 'emerald', label: 'Forest Green', accent: 'text-emerald-400', background: '#064e3b', primary: 'bg-emerald-500', color: '#10b981' },
      rose: { name: 'rose', label: 'Sunset Rose', accent: 'text-rose-400', background: '#881337', primary: 'bg-rose-500', color: '#f43f5e' },
      amber: { name: 'amber', label: 'Golden Amber', accent: 'text-amber-400', background: '#78350f', primary: 'bg-amber-500', color: '#f59e0b' },
      purple: { name: 'purple', label: 'Royal Purple', accent: 'text-purple-400', background: '#581c87', primary: 'bg-purple-500', color: '#a855f7' },
      pink: { name: 'pink', label: 'Bubblegum Pink', accent: 'text-pink-400', background: '#831843', primary: 'bg-pink-500', color: '#ec4899' },
      indigo: { name: 'indigo', label: 'Deep Indigo', accent: 'text-indigo-400', background: '#312e81', primary: 'bg-indigo-500', color: '#6366f1' },
      teal: { name: 'teal', label: 'Ocean Teal', accent: 'text-teal-400', background: '#134e4a', primary: 'bg-teal-500', color: '#14b8a6' },
      orange: { name: 'orange', label: 'Tangerine', accent: 'text-orange-400', background: '#7c2d12', primary: 'bg-orange-500', color: '#f97316' },
      slate: { name: 'slate', label: 'Midnight Slate', accent: 'text-slate-300', background: '#0f172a', primary: 'bg-slate-600', color: '#475569' },
      red: { name: 'red', label: 'Cherry Red', accent: 'text-red-400', background: '#7f1d1d', primary: 'bg-red-500', color: '#ef4444' },
    };
    return customThemes[colorScheme] || COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.default;
  }, [colorScheme, customThemes]);
  
  // Compute all color schemes (built-in + custom)
  const colorSchemes = useMemo(() => {
    const COLOR_SCHEMES = {
      default: { name: 'default', label: 'Classic', accent: 'text-white', background: '#1e293b', primary: 'bg-cyan-500', color: '#06b6d4' },
      blue: { name: 'blue', label: 'Ocean Blue', accent: 'text-blue-400', background: '#1e3a8a', primary: 'bg-blue-500', color: '#3b82f6' },
      emerald: { name: 'emerald', label: 'Forest Green', accent: 'text-emerald-400', background: '#064e3b', primary: 'bg-emerald-500', color: '#10b981' },
      rose: { name: 'rose', label: 'Sunset Rose', accent: 'text-rose-400', background: '#881337', primary: 'bg-rose-500', color: '#f43f5e' },
      amber: { name: 'amber', label: 'Golden Amber', accent: 'text-amber-400', background: '#78350f', primary: 'bg-amber-500', color: '#f59e0b' },
      purple: { name: 'purple', label: 'Royal Purple', accent: 'text-purple-400', background: '#581c87', primary: 'bg-purple-500', color: '#a855f7' },
      pink: { name: 'pink', label: 'Bubblegum Pink', accent: 'text-pink-400', background: '#831843', primary: 'bg-pink-500', color: '#ec4899' },
      indigo: { name: 'indigo', label: 'Deep Indigo', accent: 'text-indigo-400', background: '#312e81', primary: 'bg-indigo-500', color: '#6366f1' },
      teal: { name: 'teal', label: 'Ocean Teal', accent: 'text-teal-400', background: '#134e4a', primary: 'bg-teal-500', color: '#14b8a6' },
      orange: { name: 'orange', label: 'Tangerine', accent: 'text-orange-400', background: '#7c2d12', primary: 'bg-orange-500', color: '#f97316' },
      slate: { name: 'slate', label: 'Midnight Slate', accent: 'text-slate-300', background: '#0f172a', primary: 'bg-slate-600', color: '#475569' },
      red: { name: 'red', label: 'Cherry Red', accent: 'text-red-400', background: '#7f1d1d', primary: 'bg-red-500', color: '#ef4444' },
    };
    return { ...COLOR_SCHEMES, ...customThemes };
  }, [customThemes]);
  const saveCustomTheme = useStore((state) => state.saveCustomTheme);
  const deleteCustomTheme = useStore((state) => state.deleteCustomTheme);
  const applyCustomTheme = useStore((state) => state.applyCustomTheme);
  const debugVisible = useStore((state) => state.debugVisible);
  const setDebugVisible = useStore((state) => state.setDebugVisible);
  
  // Compute layouts from constants
  const layouts = useMemo(() => {
    const LAYOUT_TEMPLATES = {
      full: {
        name: 'full',
        label: 'Full Layout',
        description: 'All windows visible, non-overlapping grid',
      },
      compact: {
        name: 'compact',
        label: 'Compact Layout',
        description: 'Player, playlist, and visualizer focused',
      },
      mini: {
        name: 'mini',
        label: 'Mini Player',
        description: 'Player window only, minimal interface',
      }
    };
    return Object.values(LAYOUT_TEMPLATES);
  }, []);
  
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
    setFontSize
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
