/**
 * Layout Templates — predefined window arrangements
 * 
 * Extracted from uiSlice to keep store code focused on state logic.
 * Each template defines which windows are visible and their positions.
 */
import type { LayoutTemplate } from '../store/types';

export const LAYOUT_TEMPLATES: Record<string, LayoutTemplate> = {
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
      discography: { x: 960, y: 40, width: 450, height: 500, visible: false, minimized: false },
    }
  },

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
      discography: { x: 1180, y: 560, width: 450, height: 500, visible: false, minimized: false },
    }
  },

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
      discography: { x: 860, y: 560, width: 450, height: 500, visible: false, minimized: false },
    }
  },

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
      discography: { x: 900, y: 560, width: 450, height: 500, visible: false, minimized: false },
    }
  },

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
      discography: { x: 980, y: 460, width: 450, height: 500, visible: false, minimized: false },
    }
  },

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
      discography: { x: 880, y: 560, width: 450, height: 500, visible: false, minimized: false },
    }
  },

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
      discography: { x: 480, y: 460, width: 450, height: 500, visible: false, minimized: false },
    }
  },

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
      discography: { x: 960, y: 40, width: 450, height: 500, visible: false, minimized: false },
    }
  },
};
