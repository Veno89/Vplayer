/**
 * UI Slice - Windows, themes, layouts, and visual settings
 */
import { WINDOW_MIN_SIZES } from '../../utils/constants';
import { COLOR_SCHEMES } from '../../utils/colorSchemes';
import type { AppStore, UISlice, UISliceState, WindowsState, LayoutTemplate, ColorScheme } from '../types';

// === Layout Templates ===
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

/**
 * Get initial windows state from full layout
 */
export const getInitialWindows = (): WindowsState => {
  const fullLayout = LAYOUT_TEMPLATES.full.windows;
  const windowsWithZIndex: WindowsState = {};
  let zIndex = 10;
  Object.keys(fullLayout).forEach(key => {
    windowsWithZIndex[key] = { ...fullLayout[key], zIndex: zIndex++ };
  });
  return windowsWithZIndex;
};

type SetFn = (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
type GetFn = () => AppStore;

/**
 * UI Slice creator
 */
export const createUISlice = (set: SetFn, get: GetFn): UISlice => ({
  // === Window State ===
  windows: getInitialWindows(),
  maxZIndex: 15,
  currentLayout: 'full',

  // === Theme State ===
  colorScheme: 'default',
  customThemes: {},

  // === Visual Settings ===
  backgroundImage: null,
  backgroundBlur: 10,
  backgroundOpacity: 0.3,
  windowOpacity: 0.95,
  fontSize: 14,
  debugVisible: false,

  // === Transient UI State (not persisted) ===
  tagEditorTrack: null,
  themeEditorOpen: false,
  isDraggingTracks: false,

  // === Window Actions ===
  setWindows: (windowsOrUpdater: WindowsState | ((prev: WindowsState) => WindowsState)) =>
    set((state) => {
      const windows = typeof windowsOrUpdater === 'function'
        ? windowsOrUpdater(state.windows)
        : windowsOrUpdater;
      return { windows };
    }),

  updateWindow: (id: string, updates: Partial<import('../types').WindowPosition>) =>
    set((state) => ({
      windows: {
        ...state.windows,
        [id]: { ...state.windows[id], ...updates }
      }
    })),

  setMaxZIndex: (zIndex: number) => set({ maxZIndex: zIndex }),

  bringToFront: (id: string) =>
    set((state) => {
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

  toggleWindow: (id: string) =>
    set((state) => {
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

      return {
        windows: {
          ...state.windows,
          [id]: { ...state.windows[id], visible: false }
        }
      };
    }),

  // === Theme Actions ===
  setColorScheme: (scheme: string) => set({ colorScheme: scheme }),

  getCurrentColors: (): ColorScheme => {
    const state = get();
    return state.customThemes[state.colorScheme] || COLOR_SCHEMES[state.colorScheme] || COLOR_SCHEMES.default;
  },

  getColorSchemes: () => {
    const state = get();
    return { ...COLOR_SCHEMES, ...state.customThemes };
  },

  saveCustomTheme: (theme: ColorScheme) => {
    const themeKey = theme.name.toLowerCase().replace(/\s+/g, '-');
    set((state) => ({
      customThemes: { ...state.customThemes, [themeKey]: theme }
    }));
  },

  deleteCustomTheme: (themeName: string) => {
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

  applyCustomTheme: (theme: ColorScheme) => {
    const themeKey = theme.name.toLowerCase().replace(/\s+/g, '-');
    set({ colorScheme: themeKey });
  },

  // === Layout Actions ===
  applyLayout: (layoutName: string) => {
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

  getLayouts: () => Object.values(LAYOUT_TEMPLATES) as LayoutTemplate[],

  // === Visual Settings Actions ===
  setBackgroundImage: (image: string | null) => set({ backgroundImage: image }),
  setBackgroundBlur: (blur: number) => set({ backgroundBlur: blur }),
  setBackgroundOpacity: (opacity: number) => set({ backgroundOpacity: opacity }),
  setWindowOpacity: (opacity: number) => set({ windowOpacity: opacity }),
  setFontSize: (size: number) => set({ fontSize: size }),
  setDebugVisible: (visible: boolean) => set({ debugVisible: visible }),

  // === Transient UI Actions ===
  setTagEditorTrack: (track: import('../../types').Track | null) => set({ tagEditorTrack: track }),
  setThemeEditorOpen: (open: boolean) => set({ themeEditorOpen: open }),
  setIsDraggingTracks: (dragging: boolean) => set({ isDraggingTracks: dragging }),

  // Reset all windows to default layout (classic)
  resetWindowPositions: () => {
    const template = LAYOUT_TEMPLATES.classic;
    set((state) => {
      const newWindows = {};
      let zIndex = 10;

      Object.keys(template.windows).forEach((windowId) => {
        const templateWindow = template.windows[windowId];
        const minSize = WINDOW_MIN_SIZES[windowId] || { width: 250, height: 150 };
        newWindows[windowId] = {
          ...templateWindow,
          width: Math.max(templateWindow.width, minSize.width),
          height: Math.max(templateWindow.height, minSize.height),
          zIndex: zIndex++
        };
      });

      // Keep any additional windows that aren't in the template
      Object.keys(state.windows).forEach((windowId) => {
        if (!newWindows[windowId]) {
          newWindows[windowId] = {
            ...state.windows[windowId],
            x: 100,
            y: 100,
            visible: false,
            minimized: false,
            zIndex: zIndex++
          };
        }
      });

      return {
        windows: newWindows,
        maxZIndex: zIndex,
        currentLayout: 'classic'
      };
    });
  },
});

/**
 * UI state to persist
 */
export const uiPersistState = (state: UISliceState) => ({
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
});
