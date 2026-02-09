/**
 * UI Slice - Windows, themes, layouts, and visual settings
 */
import { WINDOW_MIN_SIZES } from '../../utils/constants';
import { COLOR_SCHEMES } from '../../utils/colorSchemes';
import { LAYOUT_TEMPLATES } from '../../utils/layoutTemplates';
import type { AppStore, UISlice, UISliceState, WindowsState, LayoutTemplate, ColorScheme } from '../types';

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
    return state.customThemes[state.colorScheme] || (COLOR_SCHEMES as Record<string, ColorScheme>)[state.colorScheme] || COLOR_SCHEMES.default;
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
        const minSize = (WINDOW_MIN_SIZES as Record<string, { width: number; height: number }>)[windowId] || { width: 250, height: 150 };
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
      const newWindows: WindowsState = {};
      let zIndex = 10;

      Object.keys(template.windows).forEach((windowId) => {
        const templateWindow = template.windows[windowId];
        const minSize = (WINDOW_MIN_SIZES as Record<string, { width: number; height: number }>)[windowId] || { width: 250, height: 150 };
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
