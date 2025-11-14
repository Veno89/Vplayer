import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

const LAYOUT_TEMPLATES = {
  full: {
    name: 'full',
    label: 'Full Layout',
    description: 'All windows visible, non-overlapping grid',
    windows: {
      player: { x: 40, y: 40, width: 420, height: 400, visible: true, minimized: false },
      playlist: { x: 480, y: 40, width: 480, height: 520, visible: true, minimized: false },
      library: { x: 980, y: 40, width: 450, height: 520, visible: true, minimized: false },
      equalizer: { x: 40, y: 460, width: 420, height: 300, visible: true, minimized: false },
      visualizer: { x: 480, y: 580, width: 480, height: 180, visible: true, minimized: false }
    }
  },
  compact: {
    name: 'compact',
    label: 'Compact Layout',
    description: 'Player, playlist, and visualizer focused',
    windows: {
      player: { x: 40, y: 40, width: 420, height: 400, visible: true, minimized: false },
      playlist: { x: 480, y: 40, width: 540, height: 580, visible: true, minimized: false },
      visualizer: { x: 40, y: 460, width: 420, height: 160, visible: true, minimized: false },
      library: { x: 1040, y: 40, width: 450, height: 580, visible: false, minimized: false },
      equalizer: { x: 1040, y: 440, width: 420, height: 300, visible: false, minimized: false }
    }
  },
  mini: {
    name: 'mini',
    label: 'Mini Player',
    description: 'Player window only, minimal interface',
    windows: {
      player: { x: 40, y: 40, width: 420, height: 400, visible: true, minimized: false },
      playlist: { x: 480, y: 40, width: 480, height: 520, visible: false, minimized: false },
      library: { x: 980, y: 40, width: 450, height: 520, visible: false, minimized: false },
      equalizer: { x: 40, y: 460, width: 420, height: 300, visible: false, minimized: false },
      visualizer: { x: 480, y: 580, width: 480, height: 180, visible: false, minimized: false }
    }
  }
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

      // Queue State
      queue: [],
      queueIndex: 0,
      queueHistory: [],

      // Player Actions
      setCurrentTrack: (track) => {
        set({ currentTrack: track, progress: 0 });
      },
      setPlaying: (playing) => set({ playing }),
      setProgress: (progress) => set({ progress }),
      setDuration: (duration) => set({ duration }),
      setLoadingTrackIndex: (index) => set({ loadingTrackIndex: index }),
      setVolume: (volume) => set({ volume }),
      setShuffle: (shuffle) => set({ shuffle }),
      setRepeatMode: (mode) => set({ repeatMode: mode }),

      // UI Actions
      setWindows: (windows) => set({ windows }),
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
        set((state) => ({
          windows: {
            ...state.windows,
            [id]: { ...state.windows[id], visible: !state.windows[id].visible }
          }
        })),
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
            if (newWindows[windowId]) {
              newWindows[windowId] = {
                ...newWindows[windowId],
                ...templateWindow,
                zIndex: templateWindow.visible ? ++highestZ : newWindows[windowId].zIndex
              };
            }
          });

          if (newWindows.options) {
            newWindows.options = {
              ...newWindows.options,
              width: Math.max(newWindows.options.width, 480),
              height: Math.max(newWindows.options.height, 420)
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
        // Queue
        queue: state.queue,
        queueHistory: state.queueHistory.slice(-50)
      })
    }
  )
);
