import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';

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
  
  // Comprehensive color schemes with full theming support - must match useStore.js
  const COLOR_SCHEMES = useMemo(() => ({
    default: { 
      name: 'default', label: 'Classic Cyan', accent: 'text-cyan-400', accentHex: '#22d3ee',
      background: '#0f172a', backgroundSecondary: '#1e293b', backgroundTertiary: '#334155',
      primary: 'bg-cyan-500', primaryHover: 'hover:bg-cyan-600', color: '#06b6d4',
      border: '#334155', borderLight: '#475569', text: '#f8fafc', textMuted: '#94a3b8', textSubtle: '#64748b',
      gradientFrom: '#0f172a', gradientVia: '#1e293b', gradientTo: '#0f172a',
      windowBg: 'rgba(15, 23, 42, 0.95)', windowBorder: 'rgba(51, 65, 85, 0.8)', headerBg: 'rgba(30, 41, 59, 0.8)',
      scrollbarTrack: '#1e293b', scrollbarThumb: '#475569', selection: 'rgba(6, 182, 212, 0.2)',
    },
    blue: { 
      name: 'blue', label: 'Ocean Blue', accent: 'text-blue-400', accentHex: '#60a5fa',
      background: '#0c1929', backgroundSecondary: '#1e3a5f', backgroundTertiary: '#2563eb',
      primary: 'bg-blue-500', primaryHover: 'hover:bg-blue-600', color: '#3b82f6',
      border: '#1e40af', borderLight: '#3b82f6', text: '#f0f9ff', textMuted: '#93c5fd', textSubtle: '#60a5fa',
      gradientFrom: '#0c1929', gradientVia: '#1e3a5f', gradientTo: '#0c1929',
      windowBg: 'rgba(12, 25, 41, 0.95)', windowBorder: 'rgba(30, 64, 175, 0.6)', headerBg: 'rgba(30, 58, 95, 0.8)',
      scrollbarTrack: '#1e3a5f', scrollbarThumb: '#3b82f6', selection: 'rgba(59, 130, 246, 0.25)',
    },
    emerald: { 
      name: 'emerald', label: 'Forest Green', accent: 'text-emerald-400', accentHex: '#34d399',
      background: '#022c22', backgroundSecondary: '#064e3b', backgroundTertiary: '#059669',
      primary: 'bg-emerald-500', primaryHover: 'hover:bg-emerald-600', color: '#10b981',
      border: '#065f46', borderLight: '#10b981', text: '#ecfdf5', textMuted: '#6ee7b7', textSubtle: '#34d399',
      gradientFrom: '#022c22', gradientVia: '#064e3b', gradientTo: '#022c22',
      windowBg: 'rgba(2, 44, 34, 0.95)', windowBorder: 'rgba(6, 95, 70, 0.6)', headerBg: 'rgba(6, 78, 59, 0.8)',
      scrollbarTrack: '#064e3b', scrollbarThumb: '#10b981', selection: 'rgba(16, 185, 129, 0.25)',
    },
    rose: { 
      name: 'rose', label: 'Sunset Rose', accent: 'text-rose-400', accentHex: '#fb7185',
      background: '#1c0a14', backgroundSecondary: '#4c0519', backgroundTertiary: '#be123c',
      primary: 'bg-rose-500', primaryHover: 'hover:bg-rose-600', color: '#f43f5e',
      border: '#881337', borderLight: '#f43f5e', text: '#fff1f2', textMuted: '#fda4af', textSubtle: '#fb7185',
      gradientFrom: '#1c0a14', gradientVia: '#4c0519', gradientTo: '#1c0a14',
      windowBg: 'rgba(28, 10, 20, 0.95)', windowBorder: 'rgba(136, 19, 55, 0.6)', headerBg: 'rgba(76, 5, 25, 0.8)',
      scrollbarTrack: '#4c0519', scrollbarThumb: '#f43f5e', selection: 'rgba(244, 63, 94, 0.25)',
    },
    amber: { 
      name: 'amber', label: 'Golden Amber', accent: 'text-amber-400', accentHex: '#fbbf24',
      background: '#1c1509', backgroundSecondary: '#451a03', backgroundTertiary: '#b45309',
      primary: 'bg-amber-500', primaryHover: 'hover:bg-amber-600', color: '#f59e0b',
      border: '#78350f', borderLight: '#f59e0b', text: '#fffbeb', textMuted: '#fcd34d', textSubtle: '#fbbf24',
      gradientFrom: '#1c1509', gradientVia: '#451a03', gradientTo: '#1c1509',
      windowBg: 'rgba(28, 21, 9, 0.95)', windowBorder: 'rgba(120, 53, 15, 0.6)', headerBg: 'rgba(69, 26, 3, 0.8)',
      scrollbarTrack: '#451a03', scrollbarThumb: '#f59e0b', selection: 'rgba(245, 158, 11, 0.25)',
    },
    purple: { 
      name: 'purple', label: 'Royal Purple', accent: 'text-purple-400', accentHex: '#c084fc',
      background: '#1a0a2e', backgroundSecondary: '#3b0764', backgroundTertiary: '#7e22ce',
      primary: 'bg-purple-500', primaryHover: 'hover:bg-purple-600', color: '#a855f7',
      border: '#581c87', borderLight: '#a855f7', text: '#faf5ff', textMuted: '#d8b4fe', textSubtle: '#c084fc',
      gradientFrom: '#1a0a2e', gradientVia: '#3b0764', gradientTo: '#1a0a2e',
      windowBg: 'rgba(26, 10, 46, 0.95)', windowBorder: 'rgba(88, 28, 135, 0.6)', headerBg: 'rgba(59, 7, 100, 0.8)',
      scrollbarTrack: '#3b0764', scrollbarThumb: '#a855f7', selection: 'rgba(168, 85, 247, 0.25)',
    },
    pink: { 
      name: 'pink', label: 'Bubblegum Pink', accent: 'text-pink-400', accentHex: '#f472b6',
      background: '#1f0818', backgroundSecondary: '#500724', backgroundTertiary: '#be185d',
      primary: 'bg-pink-500', primaryHover: 'hover:bg-pink-600', color: '#ec4899',
      border: '#831843', borderLight: '#ec4899', text: '#fdf2f8', textMuted: '#f9a8d4', textSubtle: '#f472b6',
      gradientFrom: '#1f0818', gradientVia: '#500724', gradientTo: '#1f0818',
      windowBg: 'rgba(31, 8, 24, 0.95)', windowBorder: 'rgba(131, 24, 67, 0.6)', headerBg: 'rgba(80, 7, 36, 0.8)',
      scrollbarTrack: '#500724', scrollbarThumb: '#ec4899', selection: 'rgba(236, 72, 153, 0.25)',
    },
    indigo: { 
      name: 'indigo', label: 'Deep Indigo', accent: 'text-indigo-400', accentHex: '#818cf8',
      background: '#0f0d1e', backgroundSecondary: '#1e1b4b', backgroundTertiary: '#4338ca',
      primary: 'bg-indigo-500', primaryHover: 'hover:bg-indigo-600', color: '#6366f1',
      border: '#312e81', borderLight: '#6366f1', text: '#eef2ff', textMuted: '#a5b4fc', textSubtle: '#818cf8',
      gradientFrom: '#0f0d1e', gradientVia: '#1e1b4b', gradientTo: '#0f0d1e',
      windowBg: 'rgba(15, 13, 30, 0.95)', windowBorder: 'rgba(49, 46, 129, 0.6)', headerBg: 'rgba(30, 27, 75, 0.8)',
      scrollbarTrack: '#1e1b4b', scrollbarThumb: '#6366f1', selection: 'rgba(99, 102, 241, 0.25)',
    },
    teal: { 
      name: 'teal', label: 'Ocean Teal', accent: 'text-teal-400', accentHex: '#2dd4bf',
      background: '#042f2e', backgroundSecondary: '#134e4a', backgroundTertiary: '#0d9488',
      primary: 'bg-teal-500', primaryHover: 'hover:bg-teal-600', color: '#14b8a6',
      border: '#115e59', borderLight: '#14b8a6', text: '#f0fdfa', textMuted: '#5eead4', textSubtle: '#2dd4bf',
      gradientFrom: '#042f2e', gradientVia: '#134e4a', gradientTo: '#042f2e',
      windowBg: 'rgba(4, 47, 46, 0.95)', windowBorder: 'rgba(17, 94, 89, 0.6)', headerBg: 'rgba(19, 78, 74, 0.8)',
      scrollbarTrack: '#134e4a', scrollbarThumb: '#14b8a6', selection: 'rgba(20, 184, 166, 0.25)',
    },
    orange: { 
      name: 'orange', label: 'Tangerine', accent: 'text-orange-400', accentHex: '#fb923c',
      background: '#1c1008', backgroundSecondary: '#431407', backgroundTertiary: '#c2410c',
      primary: 'bg-orange-500', primaryHover: 'hover:bg-orange-600', color: '#f97316',
      border: '#7c2d12', borderLight: '#f97316', text: '#fff7ed', textMuted: '#fdba74', textSubtle: '#fb923c',
      gradientFrom: '#1c1008', gradientVia: '#431407', gradientTo: '#1c1008',
      windowBg: 'rgba(28, 16, 8, 0.95)', windowBorder: 'rgba(124, 45, 18, 0.6)', headerBg: 'rgba(67, 20, 7, 0.8)',
      scrollbarTrack: '#431407', scrollbarThumb: '#f97316', selection: 'rgba(249, 115, 22, 0.25)',
    },
    slate: { 
      name: 'slate', label: 'Midnight Slate', accent: 'text-slate-300', accentHex: '#cbd5e1',
      background: '#020617', backgroundSecondary: '#0f172a', backgroundTertiary: '#334155',
      primary: 'bg-slate-500', primaryHover: 'hover:bg-slate-600', color: '#64748b',
      border: '#1e293b', borderLight: '#475569', text: '#f8fafc', textMuted: '#94a3b8', textSubtle: '#64748b',
      gradientFrom: '#020617', gradientVia: '#0f172a', gradientTo: '#020617',
      windowBg: 'rgba(2, 6, 23, 0.95)', windowBorder: 'rgba(30, 41, 59, 0.6)', headerBg: 'rgba(15, 23, 42, 0.8)',
      scrollbarTrack: '#0f172a', scrollbarThumb: '#475569', selection: 'rgba(100, 116, 139, 0.25)',
    },
    red: { 
      name: 'red', label: 'Cherry Red', accent: 'text-red-400', accentHex: '#f87171',
      background: '#1c0808', backgroundSecondary: '#450a0a', backgroundTertiary: '#dc2626',
      primary: 'bg-red-500', primaryHover: 'hover:bg-red-600', color: '#ef4444',
      border: '#7f1d1d', borderLight: '#ef4444', text: '#fef2f2', textMuted: '#fca5a5', textSubtle: '#f87171',
      gradientFrom: '#1c0808', gradientVia: '#450a0a', gradientTo: '#1c0808',
      windowBg: 'rgba(28, 8, 8, 0.95)', windowBorder: 'rgba(127, 29, 29, 0.6)', headerBg: 'rgba(69, 10, 10, 0.8)',
      scrollbarTrack: '#450a0a', scrollbarThumb: '#ef4444', selection: 'rgba(239, 68, 68, 0.25)',
    },
    sunset: { 
      name: 'sunset', label: 'Sunset Gradient', accent: 'text-orange-300', accentHex: '#fdba74',
      background: '#1a0a1e', backgroundSecondary: '#3d1a2e', backgroundTertiary: '#9d174d',
      primary: 'bg-gradient-to-r from-orange-500 to-pink-500', primaryHover: 'hover:from-orange-600 hover:to-pink-600', color: '#f97316',
      border: '#6b2142', borderLight: '#db2777', text: '#fef3c7', textMuted: '#fcd34d', textSubtle: '#f472b6',
      gradientFrom: '#1a0a1e', gradientVia: '#4c1d3b', gradientTo: '#1c1509',
      windowBg: 'rgba(26, 10, 30, 0.95)', windowBorder: 'rgba(107, 33, 66, 0.6)', headerBg: 'rgba(61, 26, 46, 0.85)',
      scrollbarTrack: '#3d1a2e', scrollbarThumb: '#db2777', selection: 'rgba(219, 39, 119, 0.25)',
    },
    ocean: { 
      name: 'ocean', label: 'Deep Ocean', accent: 'text-cyan-300', accentHex: '#67e8f9',
      background: '#0a1628', backgroundSecondary: '#0c2439', backgroundTertiary: '#0369a1',
      primary: 'bg-gradient-to-r from-cyan-500 to-blue-500', primaryHover: 'hover:from-cyan-600 hover:to-blue-600', color: '#06b6d4',
      border: '#164e63', borderLight: '#0891b2', text: '#ecfeff', textMuted: '#67e8f9', textSubtle: '#22d3ee',
      gradientFrom: '#0a1628', gradientVia: '#0e3654', gradientTo: '#0a1628',
      windowBg: 'rgba(10, 22, 40, 0.95)', windowBorder: 'rgba(22, 78, 99, 0.6)', headerBg: 'rgba(12, 36, 57, 0.85)',
      scrollbarTrack: '#0c2439', scrollbarThumb: '#0891b2', selection: 'rgba(8, 145, 178, 0.25)',
    },
    forest: { 
      name: 'forest', label: 'Enchanted Forest', accent: 'text-lime-300', accentHex: '#bef264',
      background: '#0a1a0a', backgroundSecondary: '#14352a', backgroundTertiary: '#166534',
      primary: 'bg-gradient-to-r from-emerald-500 to-lime-500', primaryHover: 'hover:from-emerald-600 hover:to-lime-600', color: '#22c55e',
      border: '#14532d', borderLight: '#22c55e', text: '#f0fdf4', textMuted: '#86efac', textSubtle: '#4ade80',
      gradientFrom: '#0a1a0a', gradientVia: '#14352a', gradientTo: '#0a1a0a',
      windowBg: 'rgba(10, 26, 10, 0.95)', windowBorder: 'rgba(20, 83, 45, 0.6)', headerBg: 'rgba(20, 53, 42, 0.85)',
      scrollbarTrack: '#14352a', scrollbarThumb: '#22c55e', selection: 'rgba(34, 197, 94, 0.25)',
    },
    synthwave: { 
      name: 'synthwave', label: 'Synthwave', accent: 'text-fuchsia-400', accentHex: '#e879f9',
      background: '#0d0221', backgroundSecondary: '#1a0536', backgroundTertiary: '#7c3aed',
      primary: 'bg-gradient-to-r from-fuchsia-500 to-cyan-400', primaryHover: 'hover:from-fuchsia-600 hover:to-cyan-500', color: '#d946ef',
      border: '#581c87', borderLight: '#a855f7', text: '#fdf4ff', textMuted: '#f0abfc', textSubtle: '#e879f9',
      gradientFrom: '#0d0221', gradientVia: '#2e1065', gradientTo: '#0d0221',
      windowBg: 'rgba(13, 2, 33, 0.95)', windowBorder: 'rgba(88, 28, 135, 0.6)', headerBg: 'rgba(26, 5, 54, 0.85)',
      scrollbarTrack: '#1a0536', scrollbarThumb: '#a855f7', selection: 'rgba(217, 70, 239, 0.25)',
    },
    monochrome: { 
      name: 'monochrome', label: 'Monochrome', accent: 'text-neutral-200', accentHex: '#e5e5e5',
      background: '#0a0a0a', backgroundSecondary: '#171717', backgroundTertiary: '#404040',
      primary: 'bg-neutral-600', primaryHover: 'hover:bg-neutral-500', color: '#a3a3a3',
      border: '#262626', borderLight: '#525252', text: '#fafafa', textMuted: '#a3a3a3', textSubtle: '#737373',
      gradientFrom: '#0a0a0a', gradientVia: '#171717', gradientTo: '#0a0a0a',
      windowBg: 'rgba(10, 10, 10, 0.95)', windowBorder: 'rgba(38, 38, 38, 0.6)', headerBg: 'rgba(23, 23, 23, 0.85)',
      scrollbarTrack: '#171717', scrollbarThumb: '#525252', selection: 'rgba(163, 163, 163, 0.2)',
    },
  }), []);

  // Compute current colors - use useMemo to prevent infinite loops
  const currentColors = useMemo(() => {
    return customThemes[colorScheme] || COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.default;
  }, [colorScheme, customThemes, COLOR_SCHEMES]);
  
  // Compute all color schemes (built-in + custom)
  const colorSchemes = useMemo(() => {
    return { ...COLOR_SCHEMES, ...customThemes };
  }, [customThemes, COLOR_SCHEMES]);
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