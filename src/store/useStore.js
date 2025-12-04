import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WINDOW_MIN_SIZES } from '../utils/constants';
import { COLOR_SCHEMES } from '../utils/colorSchemes';

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
      playbackSpeed: 1.0, // 0.5 - 2.0
      fadeOnPause: true,
      fadeDuration: 200, // ms
      defaultVolume: 80, // 0-100
      rememberTrackPosition: true, // for podcasts/audiobooks

      // Library Settings
      autoScanOnStartup: true,
      watchFolderChanges: true,
      excludedFormats: [],
      duplicateSensitivity: 'medium', // 'low', 'medium', 'high'
      showHiddenFiles: false,
      metadataLanguage: 'en',
      albumArtSize: 'large', // 'small', 'medium', 'large'
      autoFetchAlbumArt: true,

      // Behavior Settings
      minimizeToTray: true,
      closeToTray: false,
      startMinimized: false,
      rememberWindowPositions: true,
      playlistAutoScroll: true, // Auto-scroll to current track in playlist
      autoResizeWindow: true, // Auto-resize main window to fit visible windows
      confirmBeforeDelete: true,
      showNotifications: true,
      snapToGrid: true,
      gridSize: 10,

      // Performance Settings
      cacheSizeLimit: 500, // MB
      maxConcurrentScans: 4,
      thumbnailQuality: 'high', // 'low', 'medium', 'high'
      hardwareAcceleration: true,
      audioBufferSize: 4096, // samples

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
      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
      setFadeOnPause: (enabled) => set({ fadeOnPause: enabled }),
      setFadeDuration: (duration) => set({ fadeDuration: duration }),
      setDefaultVolume: (volume) => set({ defaultVolume: volume }),
      setRememberTrackPosition: (enabled) => set({ rememberTrackPosition: enabled }),

      // Library Settings Actions
      setAutoScanOnStartup: (enabled) => set({ autoScanOnStartup: enabled }),
      setWatchFolderChanges: (enabled) => set({ watchFolderChanges: enabled }),
      setExcludedFormats: (formats) => set({ excludedFormats: formats }),
      setDuplicateSensitivity: (sensitivity) => set({ duplicateSensitivity: sensitivity }),
      setShowHiddenFiles: (enabled) => set({ showHiddenFiles: enabled }),
      setMetadataLanguage: (language) => set({ metadataLanguage: language }),
      setAlbumArtSize: (size) => set({ albumArtSize: size }),
      setAutoFetchAlbumArt: (enabled) => set({ autoFetchAlbumArt: enabled }),

      // Behavior Settings Actions
      setMinimizeToTray: (enabled) => set({ minimizeToTray: enabled }),
      setCloseToTray: (enabled) => set({ closeToTray: enabled }),
      setStartMinimized: (enabled) => set({ startMinimized: enabled }),
      setRememberWindowPositions: (enabled) => set({ rememberWindowPositions: enabled }),
      setPlaylistAutoScroll: (enabled) => set({ playlistAutoScroll: enabled }),
      setAutoResizeWindow: (enabled) => set({ autoResizeWindow: enabled }),
      setConfirmBeforeDelete: (enabled) => set({ confirmBeforeDelete: enabled }),
      setShowNotifications: (enabled) => set({ showNotifications: enabled }),
      setSnapToGrid: (enabled) => set({ snapToGrid: enabled }),
      setGridSize: (size) => set({ gridSize: size }),

      // Performance Settings Actions
      setCacheSizeLimit: (limit) => set({ cacheSizeLimit: limit }),
      setMaxConcurrentScans: (max) => set({ maxConcurrentScans: max }),
      setThumbnailQuality: (quality) => set({ thumbnailQuality: quality }),
      setHardwareAcceleration: (enabled) => set({ hardwareAcceleration: enabled }),
      setAudioBufferSize: (size) => set({ audioBufferSize: size }),

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
        playbackSpeed: state.playbackSpeed,
        fadeOnPause: state.fadeOnPause,
        fadeDuration: state.fadeDuration,
        defaultVolume: state.defaultVolume,
        rememberTrackPosition: state.rememberTrackPosition,
        // Library Settings
        autoScanOnStartup: state.autoScanOnStartup,
        watchFolderChanges: state.watchFolderChanges,
        excludedFormats: state.excludedFormats,
        duplicateSensitivity: state.duplicateSensitivity,
        showHiddenFiles: state.showHiddenFiles,
        metadataLanguage: state.metadataLanguage,
        albumArtSize: state.albumArtSize,
        autoFetchAlbumArt: state.autoFetchAlbumArt,
        // Behavior Settings
        minimizeToTray: state.minimizeToTray,
        closeToTray: state.closeToTray,
        startMinimized: state.startMinimized,
        rememberWindowPositions: state.rememberWindowPositions,
        playlistAutoScroll: state.playlistAutoScroll,
        autoResizeWindow: state.autoResizeWindow,
        confirmBeforeDelete: state.confirmBeforeDelete,
        showNotifications: state.showNotifications,
        snapToGrid: state.snapToGrid,
        gridSize: state.gridSize,
        // Performance Settings
        cacheSizeLimit: state.cacheSizeLimit,
        maxConcurrentScans: state.maxConcurrentScans,
        thumbnailQuality: state.thumbnailQuality,
        hardwareAcceleration: state.hardwareAcceleration,
        audioBufferSize: state.audioBufferSize,
        // Queue
        queue: state.queue,
        queueHistory: state.queueHistory.slice(-50)
      })
    }
  )
);
