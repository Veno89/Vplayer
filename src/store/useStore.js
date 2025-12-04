import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WINDOW_MIN_SIZES } from '../utils/constants';

// Comprehensive color schemes with full theming support
const COLOR_SCHEMES = {
  default: { 
    name: 'default', 
    label: 'Classic Cyan', 
    accent: 'text-cyan-400', 
    accentHex: '#22d3ee',
    background: '#0f172a', 
    backgroundSecondary: '#1e293b',
    backgroundTertiary: '#334155',
    primary: 'bg-cyan-500', 
    primaryHover: 'hover:bg-cyan-600',
    color: '#06b6d4',
    border: '#334155',
    borderLight: '#475569',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    textSubtle: '#64748b',
    gradientFrom: '#0f172a',
    gradientVia: '#1e293b',
    gradientTo: '#0f172a',
    windowBg: 'rgba(15, 23, 42, 0.95)',
    windowBorder: 'rgba(51, 65, 85, 0.8)',
    headerBg: 'rgba(30, 41, 59, 0.8)',
    scrollbarTrack: '#1e293b',
    scrollbarThumb: '#475569',
    selection: 'rgba(6, 182, 212, 0.2)',
  },
  blue: { 
    name: 'blue', 
    label: 'Ocean Blue', 
    accent: 'text-blue-400', 
    accentHex: '#60a5fa',
    background: '#0c1929', 
    backgroundSecondary: '#1e3a5f',
    backgroundTertiary: '#2563eb',
    primary: 'bg-blue-500', 
    primaryHover: 'hover:bg-blue-600',
    color: '#3b82f6',
    border: '#1e40af',
    borderLight: '#3b82f6',
    text: '#f0f9ff',
    textMuted: '#93c5fd',
    textSubtle: '#60a5fa',
    gradientFrom: '#0c1929',
    gradientVia: '#1e3a5f',
    gradientTo: '#0c1929',
    windowBg: 'rgba(12, 25, 41, 0.95)',
    windowBorder: 'rgba(30, 64, 175, 0.6)',
    headerBg: 'rgba(30, 58, 95, 0.8)',
    scrollbarTrack: '#1e3a5f',
    scrollbarThumb: '#3b82f6',
    selection: 'rgba(59, 130, 246, 0.25)',
  },
  emerald: { 
    name: 'emerald', 
    label: 'Forest Green', 
    accent: 'text-emerald-400', 
    accentHex: '#34d399',
    background: '#022c22', 
    backgroundSecondary: '#064e3b',
    backgroundTertiary: '#059669',
    primary: 'bg-emerald-500', 
    primaryHover: 'hover:bg-emerald-600',
    color: '#10b981',
    border: '#065f46',
    borderLight: '#10b981',
    text: '#ecfdf5',
    textMuted: '#6ee7b7',
    textSubtle: '#34d399',
    gradientFrom: '#022c22',
    gradientVia: '#064e3b',
    gradientTo: '#022c22',
    windowBg: 'rgba(2, 44, 34, 0.95)',
    windowBorder: 'rgba(6, 95, 70, 0.6)',
    headerBg: 'rgba(6, 78, 59, 0.8)',
    scrollbarTrack: '#064e3b',
    scrollbarThumb: '#10b981',
    selection: 'rgba(16, 185, 129, 0.25)',
  },
  rose: { 
    name: 'rose', 
    label: 'Sunset Rose', 
    accent: 'text-rose-400', 
    accentHex: '#fb7185',
    background: '#1c0a14', 
    backgroundSecondary: '#4c0519',
    backgroundTertiary: '#be123c',
    primary: 'bg-rose-500', 
    primaryHover: 'hover:bg-rose-600',
    color: '#f43f5e',
    border: '#881337',
    borderLight: '#f43f5e',
    text: '#fff1f2',
    textMuted: '#fda4af',
    textSubtle: '#fb7185',
    gradientFrom: '#1c0a14',
    gradientVia: '#4c0519',
    gradientTo: '#1c0a14',
    windowBg: 'rgba(28, 10, 20, 0.95)',
    windowBorder: 'rgba(136, 19, 55, 0.6)',
    headerBg: 'rgba(76, 5, 25, 0.8)',
    scrollbarTrack: '#4c0519',
    scrollbarThumb: '#f43f5e',
    selection: 'rgba(244, 63, 94, 0.25)',
  },
  amber: { 
    name: 'amber', 
    label: 'Golden Amber', 
    accent: 'text-amber-400', 
    accentHex: '#fbbf24',
    background: '#1c1509', 
    backgroundSecondary: '#451a03',
    backgroundTertiary: '#b45309',
    primary: 'bg-amber-500', 
    primaryHover: 'hover:bg-amber-600',
    color: '#f59e0b',
    border: '#78350f',
    borderLight: '#f59e0b',
    text: '#fffbeb',
    textMuted: '#fcd34d',
    textSubtle: '#fbbf24',
    gradientFrom: '#1c1509',
    gradientVia: '#451a03',
    gradientTo: '#1c1509',
    windowBg: 'rgba(28, 21, 9, 0.95)',
    windowBorder: 'rgba(120, 53, 15, 0.6)',
    headerBg: 'rgba(69, 26, 3, 0.8)',
    scrollbarTrack: '#451a03',
    scrollbarThumb: '#f59e0b',
    selection: 'rgba(245, 158, 11, 0.25)',
  },
  purple: { 
    name: 'purple', 
    label: 'Royal Purple', 
    accent: 'text-purple-400', 
    accentHex: '#c084fc',
    background: '#1a0a2e', 
    backgroundSecondary: '#3b0764',
    backgroundTertiary: '#7e22ce',
    primary: 'bg-purple-500', 
    primaryHover: 'hover:bg-purple-600',
    color: '#a855f7',
    border: '#581c87',
    borderLight: '#a855f7',
    text: '#faf5ff',
    textMuted: '#d8b4fe',
    textSubtle: '#c084fc',
    gradientFrom: '#1a0a2e',
    gradientVia: '#3b0764',
    gradientTo: '#1a0a2e',
    windowBg: 'rgba(26, 10, 46, 0.95)',
    windowBorder: 'rgba(88, 28, 135, 0.6)',
    headerBg: 'rgba(59, 7, 100, 0.8)',
    scrollbarTrack: '#3b0764',
    scrollbarThumb: '#a855f7',
    selection: 'rgba(168, 85, 247, 0.25)',
  },
  pink: { 
    name: 'pink', 
    label: 'Bubblegum Pink', 
    accent: 'text-pink-400', 
    accentHex: '#f472b6',
    background: '#1f0818', 
    backgroundSecondary: '#500724',
    backgroundTertiary: '#be185d',
    primary: 'bg-pink-500', 
    primaryHover: 'hover:bg-pink-600',
    color: '#ec4899',
    border: '#831843',
    borderLight: '#ec4899',
    text: '#fdf2f8',
    textMuted: '#f9a8d4',
    textSubtle: '#f472b6',
    gradientFrom: '#1f0818',
    gradientVia: '#500724',
    gradientTo: '#1f0818',
    windowBg: 'rgba(31, 8, 24, 0.95)',
    windowBorder: 'rgba(131, 24, 67, 0.6)',
    headerBg: 'rgba(80, 7, 36, 0.8)',
    scrollbarTrack: '#500724',
    scrollbarThumb: '#ec4899',
    selection: 'rgba(236, 72, 153, 0.25)',
  },
  indigo: { 
    name: 'indigo', 
    label: 'Deep Indigo', 
    accent: 'text-indigo-400', 
    accentHex: '#818cf8',
    background: '#0f0d1e', 
    backgroundSecondary: '#1e1b4b',
    backgroundTertiary: '#4338ca',
    primary: 'bg-indigo-500', 
    primaryHover: 'hover:bg-indigo-600',
    color: '#6366f1',
    border: '#312e81',
    borderLight: '#6366f1',
    text: '#eef2ff',
    textMuted: '#a5b4fc',
    textSubtle: '#818cf8',
    gradientFrom: '#0f0d1e',
    gradientVia: '#1e1b4b',
    gradientTo: '#0f0d1e',
    windowBg: 'rgba(15, 13, 30, 0.95)',
    windowBorder: 'rgba(49, 46, 129, 0.6)',
    headerBg: 'rgba(30, 27, 75, 0.8)',
    scrollbarTrack: '#1e1b4b',
    scrollbarThumb: '#6366f1',
    selection: 'rgba(99, 102, 241, 0.25)',
  },
  teal: { 
    name: 'teal', 
    label: 'Ocean Teal', 
    accent: 'text-teal-400', 
    accentHex: '#2dd4bf',
    background: '#042f2e', 
    backgroundSecondary: '#134e4a',
    backgroundTertiary: '#0d9488',
    primary: 'bg-teal-500', 
    primaryHover: 'hover:bg-teal-600',
    color: '#14b8a6',
    border: '#115e59',
    borderLight: '#14b8a6',
    text: '#f0fdfa',
    textMuted: '#5eead4',
    textSubtle: '#2dd4bf',
    gradientFrom: '#042f2e',
    gradientVia: '#134e4a',
    gradientTo: '#042f2e',
    windowBg: 'rgba(4, 47, 46, 0.95)',
    windowBorder: 'rgba(17, 94, 89, 0.6)',
    headerBg: 'rgba(19, 78, 74, 0.8)',
    scrollbarTrack: '#134e4a',
    scrollbarThumb: '#14b8a6',
    selection: 'rgba(20, 184, 166, 0.25)',
  },
  orange: { 
    name: 'orange', 
    label: 'Tangerine', 
    accent: 'text-orange-400', 
    accentHex: '#fb923c',
    background: '#1c1008', 
    backgroundSecondary: '#431407',
    backgroundTertiary: '#c2410c',
    primary: 'bg-orange-500', 
    primaryHover: 'hover:bg-orange-600',
    color: '#f97316',
    border: '#7c2d12',
    borderLight: '#f97316',
    text: '#fff7ed',
    textMuted: '#fdba74',
    textSubtle: '#fb923c',
    gradientFrom: '#1c1008',
    gradientVia: '#431407',
    gradientTo: '#1c1008',
    windowBg: 'rgba(28, 16, 8, 0.95)',
    windowBorder: 'rgba(124, 45, 18, 0.6)',
    headerBg: 'rgba(67, 20, 7, 0.8)',
    scrollbarTrack: '#431407',
    scrollbarThumb: '#f97316',
    selection: 'rgba(249, 115, 22, 0.25)',
  },
  slate: { 
    name: 'slate', 
    label: 'Midnight Slate', 
    accent: 'text-slate-300', 
    accentHex: '#cbd5e1',
    background: '#020617', 
    backgroundSecondary: '#0f172a',
    backgroundTertiary: '#334155',
    primary: 'bg-slate-500', 
    primaryHover: 'hover:bg-slate-600',
    color: '#64748b',
    border: '#1e293b',
    borderLight: '#475569',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    textSubtle: '#64748b',
    gradientFrom: '#020617',
    gradientVia: '#0f172a',
    gradientTo: '#020617',
    windowBg: 'rgba(2, 6, 23, 0.95)',
    windowBorder: 'rgba(30, 41, 59, 0.6)',
    headerBg: 'rgba(15, 23, 42, 0.8)',
    scrollbarTrack: '#0f172a',
    scrollbarThumb: '#475569',
    selection: 'rgba(100, 116, 139, 0.25)',
  },
  red: { 
    name: 'red', 
    label: 'Cherry Red', 
    accent: 'text-red-400', 
    accentHex: '#f87171',
    background: '#1c0808', 
    backgroundSecondary: '#450a0a',
    backgroundTertiary: '#dc2626',
    primary: 'bg-red-500', 
    primaryHover: 'hover:bg-red-600',
    color: '#ef4444',
    border: '#7f1d1d',
    borderLight: '#ef4444',
    text: '#fef2f2',
    textMuted: '#fca5a5',
    textSubtle: '#f87171',
    gradientFrom: '#1c0808',
    gradientVia: '#450a0a',
    gradientTo: '#1c0808',
    windowBg: 'rgba(28, 8, 8, 0.95)',
    windowBorder: 'rgba(127, 29, 29, 0.6)',
    headerBg: 'rgba(69, 10, 10, 0.8)',
    scrollbarTrack: '#450a0a',
    scrollbarThumb: '#ef4444',
    selection: 'rgba(239, 68, 68, 0.25)',
  },
  // New premium themes
  sunset: { 
    name: 'sunset', 
    label: 'Sunset Gradient', 
    accent: 'text-orange-300', 
    accentHex: '#fdba74',
    background: '#1a0a1e', 
    backgroundSecondary: '#3d1a2e',
    backgroundTertiary: '#9d174d',
    primary: 'bg-gradient-to-r from-orange-500 to-pink-500', 
    primaryHover: 'hover:from-orange-600 hover:to-pink-600',
    color: '#f97316',
    border: '#6b2142',
    borderLight: '#db2777',
    text: '#fef3c7',
    textMuted: '#fcd34d',
    textSubtle: '#f472b6',
    gradientFrom: '#1a0a1e',
    gradientVia: '#4c1d3b',
    gradientTo: '#1c1509',
    windowBg: 'rgba(26, 10, 30, 0.95)',
    windowBorder: 'rgba(107, 33, 66, 0.6)',
    headerBg: 'rgba(61, 26, 46, 0.85)',
    scrollbarTrack: '#3d1a2e',
    scrollbarThumb: '#db2777',
    selection: 'rgba(219, 39, 119, 0.25)',
  },
  ocean: { 
    name: 'ocean', 
    label: 'Deep Ocean', 
    accent: 'text-cyan-300', 
    accentHex: '#67e8f9',
    background: '#0a1628', 
    backgroundSecondary: '#0c2439',
    backgroundTertiary: '#0369a1',
    primary: 'bg-gradient-to-r from-cyan-500 to-blue-500', 
    primaryHover: 'hover:from-cyan-600 hover:to-blue-600',
    color: '#06b6d4',
    border: '#164e63',
    borderLight: '#0891b2',
    text: '#ecfeff',
    textMuted: '#67e8f9',
    textSubtle: '#22d3ee',
    gradientFrom: '#0a1628',
    gradientVia: '#0e3654',
    gradientTo: '#0a1628',
    windowBg: 'rgba(10, 22, 40, 0.95)',
    windowBorder: 'rgba(22, 78, 99, 0.6)',
    headerBg: 'rgba(12, 36, 57, 0.85)',
    scrollbarTrack: '#0c2439',
    scrollbarThumb: '#0891b2',
    selection: 'rgba(8, 145, 178, 0.25)',
  },
  forest: { 
    name: 'forest', 
    label: 'Enchanted Forest', 
    accent: 'text-lime-300', 
    accentHex: '#bef264',
    background: '#0a1a0a', 
    backgroundSecondary: '#14352a',
    backgroundTertiary: '#166534',
    primary: 'bg-gradient-to-r from-emerald-500 to-lime-500', 
    primaryHover: 'hover:from-emerald-600 hover:to-lime-600',
    color: '#22c55e',
    border: '#14532d',
    borderLight: '#22c55e',
    text: '#f0fdf4',
    textMuted: '#86efac',
    textSubtle: '#4ade80',
    gradientFrom: '#0a1a0a',
    gradientVia: '#14352a',
    gradientTo: '#0a1a0a',
    windowBg: 'rgba(10, 26, 10, 0.95)',
    windowBorder: 'rgba(20, 83, 45, 0.6)',
    headerBg: 'rgba(20, 53, 42, 0.85)',
    scrollbarTrack: '#14352a',
    scrollbarThumb: '#22c55e',
    selection: 'rgba(34, 197, 94, 0.25)',
  },
  synthwave: { 
    name: 'synthwave', 
    label: 'Synthwave', 
    accent: 'text-fuchsia-400', 
    accentHex: '#e879f9',
    background: '#0d0221', 
    backgroundSecondary: '#1a0536',
    backgroundTertiary: '#7c3aed',
    primary: 'bg-gradient-to-r from-fuchsia-500 to-cyan-400', 
    primaryHover: 'hover:from-fuchsia-600 hover:to-cyan-500',
    color: '#d946ef',
    border: '#581c87',
    borderLight: '#a855f7',
    text: '#fdf4ff',
    textMuted: '#f0abfc',
    textSubtle: '#e879f9',
    gradientFrom: '#0d0221',
    gradientVia: '#2e1065',
    gradientTo: '#0d0221',
    windowBg: 'rgba(13, 2, 33, 0.95)',
    windowBorder: 'rgba(88, 28, 135, 0.6)',
    headerBg: 'rgba(26, 5, 54, 0.85)',
    scrollbarTrack: '#1a0536',
    scrollbarThumb: '#a855f7',
    selection: 'rgba(217, 70, 239, 0.25)',
  },
  monochrome: { 
    name: 'monochrome', 
    label: 'Monochrome', 
    accent: 'text-neutral-200', 
    accentHex: '#e5e5e5',
    background: '#0a0a0a', 
    backgroundSecondary: '#171717',
    backgroundTertiary: '#404040',
    primary: 'bg-neutral-600', 
    primaryHover: 'hover:bg-neutral-500',
    color: '#a3a3a3',
    border: '#262626',
    borderLight: '#525252',
    text: '#fafafa',
    textMuted: '#a3a3a3',
    textSubtle: '#737373',
    gradientFrom: '#0a0a0a',
    gradientVia: '#171717',
    gradientTo: '#0a0a0a',
    windowBg: 'rgba(10, 10, 10, 0.95)',
    windowBorder: 'rgba(38, 38, 38, 0.6)',
    headerBg: 'rgba(23, 23, 23, 0.85)',
    scrollbarTrack: '#171717',
    scrollbarThumb: '#525252',
    selection: 'rgba(163, 163, 163, 0.2)',
  },
};

const LAYOUT_TEMPLATES = {
  // Classic: Player + EQ left column, Playlist right (taller)
  classic: {
    name: 'classic',
    label: 'Classic',
    description: 'Player & Equalizer stacked left, Playlist right',
    preview: [
      { id: 'player', x: 0, y: 0, w: 4, h: 5, label: 'P' },
      { id: 'equalizer', x: 0, y: 5, w: 4, h: 3, label: 'EQ' },
      { id: 'playlist', x: 4, y: 0, w: 5, h: 8, label: 'PL' },
    ],
    windows: {
      player: { x: 40, y: 40, width: 400, height: 400, visible: true, minimized: false },
      equalizer: { x: 40, y: 460, width: 400, height: 280, visible: true, minimized: false },
      playlist: { x: 460, y: 40, width: 480, height: 700, visible: true, minimized: false },
      library: { x: 960, y: 40, width: 450, height: 500, visible: false, minimized: false },
      visualizer: { x: 460, y: 760, width: 480, height: 180, visible: false, minimized: false },
      queue: { x: 960, y: 40, width: 400, height: 400, visible: false, minimized: false },
    }
  },
  
  // Full: All main windows visible in grid
  full: {
    name: 'full',
    label: 'Full Studio',
    description: 'All windows visible in organized grid',
    preview: [
      { id: 'player', x: 0, y: 0, w: 4, h: 4, label: 'P' },
      { id: 'equalizer', x: 0, y: 4, w: 4, h: 4, label: 'EQ' },
      { id: 'playlist', x: 4, y: 0, w: 6, h: 5, label: 'PL' },
      { id: 'visualizer', x: 4, y: 5, w: 6, h: 3, label: 'VIS' },
      { id: 'library', x: 10, y: 0, w: 3, h: 8, label: 'LIB' },
    ],
    windows: {
      player: { x: 40, y: 40, width: 420, height: 400, visible: true, minimized: false },
      equalizer: { x: 40, y: 460, width: 420, height: 340, visible: true, minimized: false },
      playlist: { x: 480, y: 40, width: 680, height: 480, visible: true, minimized: false },
      visualizer: { x: 480, y: 540, width: 680, height: 260, visible: true, minimized: false },
      library: { x: 1180, y: 40, width: 420, height: 760, visible: true, minimized: false },
      queue: { x: 1180, y: 560, width: 420, height: 240, visible: false, minimized: false },
    }
  },
  
  // Playlist Focus: Large playlist, small player
  playlistFocus: {
    name: 'playlistFocus',
    label: 'Playlist Focus',
    description: 'Large playlist with compact player above',
    preview: [
      { id: 'player', x: 0, y: 0, w: 9, h: 3, label: 'PLAYER' },
      { id: 'playlist', x: 0, y: 3, w: 9, h: 5, label: 'PLAYLIST' },
    ],
    windows: {
      player: { x: 40, y: 40, width: 800, height: 340, visible: true, minimized: false },
      playlist: { x: 40, y: 400, width: 800, height: 400, visible: true, minimized: false },
      library: { x: 860, y: 40, width: 450, height: 500, visible: false, minimized: false },
      equalizer: { x: 860, y: 40, width: 400, height: 280, visible: false, minimized: false },
      visualizer: { x: 40, y: 820, width: 800, height: 180, visible: false, minimized: false },
      queue: { x: 860, y: 40, width: 400, height: 400, visible: false, minimized: false },
    }
  },
  
  // DJ Mode: Player + EQ + Visualizer column, Queue right
  djMode: {
    name: 'djMode',
    label: 'DJ Mode',
    description: 'Player, Equalizer & Visualizer with Queue',
    preview: [
      { id: 'player', x: 0, y: 0, w: 5, h: 4, label: 'P' },
      { id: 'equalizer', x: 0, y: 4, w: 5, h: 2, label: 'EQ' },
      { id: 'visualizer', x: 0, y: 6, w: 5, h: 2, label: 'VIS' },
      { id: 'queue', x: 5, y: 0, w: 4, h: 8, label: 'Q' },
    ],
    windows: {
      player: { x: 40, y: 40, width: 420, height: 360, visible: true, minimized: false },
      equalizer: { x: 40, y: 420, width: 420, height: 280, visible: true, minimized: false },
      visualizer: { x: 40, y: 720, width: 420, height: 180, visible: true, minimized: false },
      queue: { x: 480, y: 40, width: 400, height: 860, visible: true, minimized: false },
      playlist: { x: 900, y: 40, width: 480, height: 500, visible: false, minimized: false },
      library: { x: 900, y: 40, width: 450, height: 500, visible: false, minimized: false },
    }
  },
  
  // Library Browser: Large library, player + playlist side
  libraryBrowser: {
    name: 'libraryBrowser',
    label: 'Library Browser',
    description: 'Focus on library browsing with player sidebar',
    preview: [
      { id: 'library', x: 0, y: 0, w: 6, h: 8, label: 'LIBRARY' },
      { id: 'player', x: 6, y: 0, w: 3, h: 4, label: 'P' },
      { id: 'playlist', x: 6, y: 4, w: 3, h: 4, label: 'PL' },
    ],
    windows: {
      library: { x: 40, y: 40, width: 520, height: 700, visible: true, minimized: false },
      player: { x: 580, y: 40, width: 380, height: 340, visible: true, minimized: false },
      playlist: { x: 580, y: 400, width: 380, height: 340, visible: true, minimized: false },
      equalizer: { x: 580, y: 760, width: 380, height: 280, visible: false, minimized: false },
      visualizer: { x: 40, y: 760, width: 520, height: 180, visible: false, minimized: false },
      queue: { x: 980, y: 40, width: 400, height: 400, visible: false, minimized: false },
    }
  },
  
  // Visualizer Mode: Big visualizer with player
  visualizerMode: {
    name: 'visualizerMode',
    label: 'Visualizer Mode',
    description: 'Large visualizer with compact controls',
    preview: [
      { id: 'visualizer', x: 0, y: 0, w: 9, h: 5, label: 'VISUALIZER' },
      { id: 'player', x: 0, y: 5, w: 5, h: 3, label: 'P' },
      { id: 'equalizer', x: 5, y: 5, w: 4, h: 3, label: 'EQ' },
    ],
    windows: {
      visualizer: { x: 40, y: 40, width: 820, height: 400, visible: true, minimized: false },
      player: { x: 40, y: 460, width: 420, height: 340, visible: true, minimized: false },
      equalizer: { x: 480, y: 460, width: 380, height: 280, visible: true, minimized: false },
      playlist: { x: 880, y: 40, width: 480, height: 500, visible: false, minimized: false },
      library: { x: 880, y: 40, width: 450, height: 500, visible: false, minimized: false },
      queue: { x: 880, y: 40, width: 400, height: 400, visible: false, minimized: false },
    }
  },
  
  // Mini: Just the player
  mini: {
    name: 'mini',
    label: 'Mini Player',
    description: 'Minimal - just the player window',
    preview: [
      { id: 'player', x: 2, y: 2, w: 5, h: 5, label: 'PLAYER' },
    ],
    windows: {
      player: { x: 40, y: 40, width: 420, height: 400, visible: true, minimized: false },
      playlist: { x: 480, y: 40, width: 480, height: 500, visible: false, minimized: false },
      library: { x: 980, y: 40, width: 450, height: 500, visible: false, minimized: false },
      equalizer: { x: 40, y: 460, width: 420, height: 280, visible: false, minimized: false },
      visualizer: { x: 480, y: 460, width: 480, height: 180, visible: false, minimized: false },
      queue: { x: 480, y: 40, width: 400, height: 400, visible: false, minimized: false },
    }
  },
  
  // Compact: Player + Playlist side by side
  compact: {
    name: 'compact',
    label: 'Compact',
    description: 'Player and Playlist side by side',
    preview: [
      { id: 'player', x: 0, y: 0, w: 4, h: 6, label: 'P' },
      { id: 'playlist', x: 4, y: 0, w: 5, h: 6, label: 'PL' },
    ],
    windows: {
      player: { x: 40, y: 40, width: 400, height: 480, visible: true, minimized: false },
      playlist: { x: 460, y: 40, width: 480, height: 480, visible: true, minimized: false },
      library: { x: 960, y: 40, width: 450, height: 500, visible: false, minimized: false },
      equalizer: { x: 40, y: 540, width: 400, height: 280, visible: false, minimized: false },
      visualizer: { x: 460, y: 540, width: 480, height: 180, visible: false, minimized: false },
      queue: { x: 960, y: 40, width: 400, height: 400, visible: false, minimized: false },
    }
  },
};

const getInitialWindows = () => {
  const fullLayout = LAYOUT_TEMPLATES.full.windows;
  const windowsWithZIndex = {};
  let zIndex = 10;
  Object.keys(fullLayout).forEach(key => {
    windowsWithZIndex[key] = { ...fullLayout[key], zIndex: zIndex++ };
  });
  return windowsWithZIndex;
};

export const useStore = create(
  persist(
    (set, get) => ({
      // Player State
      currentTrack: null,
      playing: false,
      progress: 0,
      duration: 0,
      loadingTrackIndex: null,
      volume: 0.7,
      shuffle: false,
      repeatMode: 'off',

      // UI State
      windows: getInitialWindows(),
      maxZIndex: 15,
      colorScheme: 'default',
      customThemes: {},
      debugVisible: false,
      currentLayout: 'full',
      backgroundImage: null,
      backgroundBlur: 10,
      backgroundOpacity: 0.3,
      windowOpacity: 0.95,
      fontSize: 14,

      // Playback Settings
      gaplessPlayback: true,
      autoPlayOnStartup: false,
      resumeLastTrack: true,
      skipSilence: false,
      replayGainMode: 'off', // 'off', 'track', 'album'
      replayGainPreamp: 0, // dB

      // Library Settings
      autoScanOnStartup: true,
      watchFolderChanges: true,
      excludedFormats: [],
      duplicateSensitivity: 'medium', // 'low', 'medium', 'high'

      // Behavior Settings
      minimizeToTray: true,
      closeToTray: false,
      startMinimized: false,
      rememberWindowPositions: true,
      playlistAutoScroll: true, // Auto-scroll to current track in playlist
      autoResizeWindow: true, // Auto-resize main window to fit visible windows

      // Performance Settings
      cacheSizeLimit: 500, // MB
      maxConcurrentScans: 4,
      thumbnailQuality: 'high', // 'low', 'medium', 'high'

      // Queue State
      queue: [],
      queueIndex: 0,
      queueHistory: [],

      // Player Actions
      setCurrentTrack: (track) => {
        set({ currentTrack: track, progress: 0 });
      },
      setPlaying: (playingOrUpdater) => 
        set((state) => ({
          playing: typeof playingOrUpdater === 'function' 
            ? playingOrUpdater(state.playing) 
            : playingOrUpdater
        })),
      setProgress: (progress) => set({ progress }),
      setDuration: (duration) => set({ duration }),
      setLoadingTrackIndex: (index) => set({ loadingTrackIndex: index }),
      setVolume: (volume) => set({ volume }),
      setShuffle: (shuffleOrUpdater) =>
        set((state) => ({
          shuffle: typeof shuffleOrUpdater === 'function'
            ? shuffleOrUpdater(state.shuffle)
            : shuffleOrUpdater
        })),
      setRepeatMode: (mode) => set({ repeatMode: mode }),

      // UI Actions
      setWindows: (windowsOrUpdater) => 
        set((state) => {
          const windows = typeof windowsOrUpdater === 'function' 
            ? windowsOrUpdater(state.windows) 
            : windowsOrUpdater;
          return { windows };
        }),
      updateWindow: (id, updates) =>
        set((state) => ({
          windows: {
            ...state.windows,
            [id]: { ...state.windows[id], ...updates }
          }
        })),
      setMaxZIndex: (zIndex) => set({ maxZIndex: zIndex }),
      bringToFront: (id) =>
        set((state) => {
          // Safety check - if window doesn't exist, don't update
          if (!state.windows[id]) {
            console.warn(`Attempted to bring non-existent window '${id}' to front`);
            return state;
          }
          const newZIndex = state.maxZIndex + 1;
          return {
            maxZIndex: newZIndex,
            windows: {
              ...state.windows,
              [id]: { ...state.windows[id], zIndex: newZIndex }
            }
          };
        }),
      toggleWindow: (id) =>
        set((state) => {
          // If window doesn't exist, create it with default values
          if (!state.windows[id]) {
            return {
              windows: {
                ...state.windows,
                [id]: { x: 100, y: 100, width: 400, height: 300, visible: true, minimized: false, zIndex: state.maxZIndex + 1 }
              },
              maxZIndex: state.maxZIndex + 1
            };
          }
          
          const isBecomingVisible = !state.windows[id].visible;
          
          // When showing a window, bring it to front
          if (isBecomingVisible) {
            const newZIndex = state.maxZIndex + 1;
            return {
              maxZIndex: newZIndex,
              windows: {
                ...state.windows,
                [id]: { ...state.windows[id], visible: true, zIndex: newZIndex }
              }
            };
          }
          
          // When hiding, just toggle visibility
          return {
            windows: {
              ...state.windows,
              [id]: { ...state.windows[id], visible: false }
            }
          };
        }),
      setColorScheme: (scheme) => set({ colorScheme: scheme }),
      getCurrentColors: () => {
        const state = get();
        return state.customThemes[state.colorScheme] || COLOR_SCHEMES[state.colorScheme] || COLOR_SCHEMES.default;
      },
      getColorSchemes: () => {
        const state = get();
        return { ...COLOR_SCHEMES, ...state.customThemes };
      },
      saveCustomTheme: (theme) => {
        const themeKey = theme.name.toLowerCase().replace(/\s+/g, '-');
        set((state) => ({
          customThemes: { ...state.customThemes, [themeKey]: theme }
        }));
      },
      deleteCustomTheme: (themeName) => {
        const themeKey = themeName.toLowerCase().replace(/\s+/g, '-');
        set((state) => {
          const newThemes = { ...state.customThemes };
          delete newThemes[themeKey];
          const newColorScheme = state.colorScheme === themeKey ? 'default' : state.colorScheme;
          return {
            customThemes: newThemes,
            colorScheme: newColorScheme
          };
        });
      },
      applyCustomTheme: (theme) => {
        const themeKey = theme.name.toLowerCase().replace(/\s+/g, '-');
        set({ colorScheme: themeKey });
      },
      setDebugVisible: (visible) => set({ debugVisible: visible }),
      applyLayout: (layoutName) => {
        const template = LAYOUT_TEMPLATES[layoutName];
        if (!template) return;

        set((state) => {
          const newWindows = { ...state.windows };
          let highestZ = state.maxZIndex;

          Object.keys(template.windows).forEach((windowId) => {
            const templateWindow = template.windows[windowId];
            const minSize = WINDOW_MIN_SIZES[windowId] || { width: 250, height: 150 };
            if (newWindows[windowId]) {
              newWindows[windowId] = {
                ...newWindows[windowId],
                ...templateWindow,
                // Enforce minimum sizes
                width: Math.max(templateWindow.width, minSize.width),
                height: Math.max(templateWindow.height, minSize.height),
                zIndex: templateWindow.visible ? ++highestZ : newWindows[windowId].zIndex
              };
            }
          });

          if (newWindows.options) {
            const optionsMin = WINDOW_MIN_SIZES.options || { width: 480, height: 480 };
            newWindows.options = {
              ...newWindows.options,
              width: Math.max(newWindows.options.width, optionsMin.width),
              height: Math.max(newWindows.options.height, optionsMin.height)
            };
          }

          return {
            windows: newWindows,
            maxZIndex: highestZ,
            currentLayout: layoutName
          };
        });
      },
      getLayouts: () => Object.values(LAYOUT_TEMPLATES),
      setBackgroundImage: (image) => set({ backgroundImage: image }),
      setBackgroundBlur: (blur) => set({ backgroundBlur: blur }),
      setBackgroundOpacity: (opacity) => set({ backgroundOpacity: opacity }),
      setWindowOpacity: (opacity) => set({ windowOpacity: opacity }),
      setFontSize: (size) => set({ fontSize: size }),

      // Playback Settings Actions
      setGaplessPlayback: (enabled) => set({ gaplessPlayback: enabled }),
      setAutoPlayOnStartup: (enabled) => set({ autoPlayOnStartup: enabled }),
      setResumeLastTrack: (enabled) => set({ resumeLastTrack: enabled }),
      setSkipSilence: (enabled) => set({ skipSilence: enabled }),
      setReplayGainMode: (mode) => set({ replayGainMode: mode }),
      setReplayGainPreamp: (preamp) => set({ replayGainPreamp: preamp }),

      // Library Settings Actions
      setAutoScanOnStartup: (enabled) => set({ autoScanOnStartup: enabled }),
      setWatchFolderChanges: (enabled) => set({ watchFolderChanges: enabled }),
      setExcludedFormats: (formats) => set({ excludedFormats: formats }),
      setDuplicateSensitivity: (sensitivity) => set({ duplicateSensitivity: sensitivity }),

      // Behavior Settings Actions
      setMinimizeToTray: (enabled) => set({ minimizeToTray: enabled }),
      setCloseToTray: (enabled) => set({ closeToTray: enabled }),
      setStartMinimized: (enabled) => set({ startMinimized: enabled }),
      setRememberWindowPositions: (enabled) => set({ rememberWindowPositions: enabled }),
      setPlaylistAutoScroll: (enabled) => set({ playlistAutoScroll: enabled }),
      setAutoResizeWindow: (enabled) => set({ autoResizeWindow: enabled }),

      // Performance Settings Actions
      setCacheSizeLimit: (limit) => set({ cacheSizeLimit: limit }),
      setMaxConcurrentScans: (max) => set({ maxConcurrentScans: max }),
      setThumbnailQuality: (quality) => set({ thumbnailQuality: quality }),

      // Queue Actions
      addToQueue: (tracks, position = 'end') => {
        const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
        set((state) => {
          let newQueue;
          if (position === 'end') {
            newQueue = [...state.queue, ...tracksArray];
          } else if (position === 'next') {
            newQueue = [...state.queue];
            newQueue.splice(state.queueIndex + 1, 0, ...tracksArray);
          } else if (position === 'start') {
            newQueue = [...tracksArray, ...state.queue];
          } else {
            newQueue = state.queue;
          }
          return { queue: newQueue };
        });
      },
      removeFromQueue: (index) =>
        set((state) => {
          const newQueue = [...state.queue];
          newQueue.splice(index, 1);
          const newQueueIndex = index < state.queueIndex ? Math.max(0, state.queueIndex - 1) : state.queueIndex;
          return { queue: newQueue, queueIndex: newQueueIndex };
        }),
      clearQueue: () => set({ queue: [], queueIndex: 0 }),
      nextInQueue: () => {
        const state = get();
        if (state.queueIndex < state.queue.length - 1) {
          const currentTrack = state.queue[state.queueIndex];
          if (currentTrack) {
            set((state) => ({
              queueHistory: [...state.queueHistory, currentTrack],
              queueIndex: state.queueIndex + 1
            }));
          } else {
            set((state) => ({ queueIndex: state.queueIndex + 1 }));
          }
          return state.queue[state.queueIndex + 1];
        }
        return null;
      },
      previousInQueue: () => {
        const state = get();
        if (state.queueIndex > 0) {
          set({ queueIndex: state.queueIndex - 1 });
          return state.queue[state.queueIndex - 1];
        } else if (state.queueHistory.length > 0) {
          const lastHistoryTrack = state.queueHistory[state.queueHistory.length - 1];
          set((state) => ({
            queueHistory: state.queueHistory.slice(0, -1)
          }));
          return lastHistoryTrack;
        }
        return null;
      },
      getCurrentQueueTrack: () => {
        const state = get();
        return state.queue[state.queueIndex] || null;
      },
      peekNextInQueue: () => {
        const state = get();
        return state.queue[state.queueIndex + 1] || null;
      },
      replaceQueue: (newTracks, startIndex = 0) =>
        set({
          queue: newTracks,
          queueIndex: startIndex,
          queueHistory: []
        }),
      shuffleQueue: () => {
        const state = get();
        const currentTrack = state.queue[state.queueIndex];
        const otherTracks = state.queue.filter((_, i) => i !== state.queueIndex);

        for (let i = otherTracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
        }

        const newQueue = currentTrack ? [currentTrack, ...otherTracks] : otherTracks;
        set({ queue: newQueue, queueIndex: 0 });
      },
      moveInQueue: (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        set((state) => {
          const newQueue = [...state.queue];
          const [movedTrack] = newQueue.splice(fromIndex, 1);
          newQueue.splice(toIndex, 0, movedTrack);

          let newQueueIndex = state.queueIndex;
          if (fromIndex === state.queueIndex) {
            newQueueIndex = toIndex;
          } else if (fromIndex < state.queueIndex && toIndex >= state.queueIndex) {
            newQueueIndex = state.queueIndex - 1;
          } else if (fromIndex > state.queueIndex && toIndex <= state.queueIndex) {
            newQueueIndex = state.queueIndex + 1;
          }

          return { queue: newQueue, queueIndex: newQueueIndex };
        });
      }
    }),
    {
      name: 'vplayer-storage',
      partialize: (state) => ({
        // Player preferences
        volume: state.volume,
        shuffle: state.shuffle,
        repeatMode: state.repeatMode,
        // UI preferences
        windows: state.windows,
        maxZIndex: state.maxZIndex,
        colorScheme: state.colorScheme,
        customThemes: state.customThemes,
        debugVisible: state.debugVisible,
        currentLayout: state.currentLayout,
        backgroundImage: state.backgroundImage,
        backgroundBlur: state.backgroundBlur,
        backgroundOpacity: state.backgroundOpacity,
        windowOpacity: state.windowOpacity,
        fontSize: state.fontSize,
        // Playback Settings
        gaplessPlayback: state.gaplessPlayback,
        autoPlayOnStartup: state.autoPlayOnStartup,
        resumeLastTrack: state.resumeLastTrack,
        skipSilence: state.skipSilence,
        replayGainMode: state.replayGainMode,
        replayGainPreamp: state.replayGainPreamp,
        crossfadeEnabled: state.crossfadeEnabled,
        crossfadeDuration: state.crossfadeDuration,
        // Library Settings
        autoScanOnStartup: state.autoScanOnStartup,
        watchFolderChanges: state.watchFolderChanges,
        excludedFormats: state.excludedFormats,
        duplicateSensitivity: state.duplicateSensitivity,
        // Behavior Settings
        minimizeToTray: state.minimizeToTray,
        closeToTray: state.closeToTray,
        startMinimized: state.startMinimized,
        rememberWindowPositions: state.rememberWindowPositions,
        playlistAutoScroll: state.playlistAutoScroll,
        autoResizeWindow: state.autoResizeWindow,
        // Performance Settings
        cacheSizeLimit: state.cacheSizeLimit,
        maxConcurrentScans: state.maxConcurrentScans,
        thumbnailQuality: state.thumbnailQuality,
        // Queue
        queue: state.queue,
        queueHistory: state.queueHistory.slice(-50)
      })
    }
  )
);
