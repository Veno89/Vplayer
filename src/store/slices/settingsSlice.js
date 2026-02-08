/**
 * Settings Slice - All user preferences and settings
 */

export const createSettingsSlice = (set) => ({
  // === Playback Settings ===
  gaplessPlayback: true,
  autoPlayOnStartup: false,
  resumeLastTrack: true,
  replayGainMode: 'off', // 'off', 'track', 'album'
  replayGainPreamp: 0, // dB
  playbackSpeed: 1.0, // 0.5 - 2.0
  fadeOnPause: true,
  fadeDuration: 200, // ms
  defaultVolume: 80, // 0-100
  rememberTrackPosition: true, // for podcasts/audiobooks

  // === Library Settings ===
  autoScanOnStartup: true,
  watchFolderChanges: true,
  excludedFormats: [],
  duplicateSensitivity: 'medium', // 'low', 'medium', 'high'
  showHiddenFiles: false,
  metadataLanguage: 'en',
  albumArtSize: 'large', // 'small', 'medium', 'large'
  autoFetchAlbumArt: true,

  // === Behavior Settings ===
  minimizeToTray: true,
  closeToTray: false,
  startMinimized: false,
  rememberWindowPositions: true,
  playlistAutoScroll: true,
  autoResizeWindow: true,
  confirmBeforeDelete: true,
  showNotifications: true,
  snapToGrid: true,
  gridSize: 10,

  // === Performance Settings ===
  cacheSizeLimit: 500, // MB
  maxConcurrentScans: 4,
  thumbnailQuality: 'high', // 'low', 'medium', 'high'
  hardwareAcceleration: true,
  audioBufferSize: 4096, // samples

  // === EQ Settings (migrated from localStorage) ===
  eqBands: [
    { freq: "60Hz", value: 50 },
    { freq: "170Hz", value: 50 },
    { freq: "310Hz", value: 50 },
    { freq: "600Hz", value: 50 },
    { freq: "1kHz", value: 50 },
    { freq: "3kHz", value: 50 },
    { freq: "6kHz", value: 50 },
    { freq: "12kHz", value: 50 },
    { freq: "14kHz", value: 50 },
    { freq: "16kHz", value: 50 }
  ],

  // === Crossfade Settings (migrated from localStorage) ===
  crossfadeEnabled: false,
  crossfadeDuration: 3000, // ms

  // === Keyboard Shortcuts (migrated from localStorage) ===
  keyboardShortcuts: null, // null means use defaults; array of {id, name, key, category}

  // === Onboarding ===
  onboardingComplete: false,

  // === Playback Settings Actions ===
  setGaplessPlayback: (enabled) => set({ gaplessPlayback: enabled }),
  setAutoPlayOnStartup: (enabled) => set({ autoPlayOnStartup: enabled }),
  setResumeLastTrack: (enabled) => set({ resumeLastTrack: enabled }),
  setReplayGainMode: (mode) => set({ replayGainMode: mode }),
  setReplayGainPreamp: (preamp) => set({ replayGainPreamp: preamp }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setFadeOnPause: (enabled) => set({ fadeOnPause: enabled }),
  setFadeDuration: (duration) => set({ fadeDuration: duration }),
  setDefaultVolume: (volume) => set({ defaultVolume: volume }),
  setRememberTrackPosition: (enabled) => set({ rememberTrackPosition: enabled }),

  // === Library Settings Actions ===
  setAutoScanOnStartup: (enabled) => set({ autoScanOnStartup: enabled }),
  setWatchFolderChanges: (enabled) => set({ watchFolderChanges: enabled }),
  setExcludedFormats: (formats) => set({ excludedFormats: formats }),
  setDuplicateSensitivity: (sensitivity) => set({ duplicateSensitivity: sensitivity }),
  setShowHiddenFiles: (enabled) => set({ showHiddenFiles: enabled }),
  setMetadataLanguage: (language) => set({ metadataLanguage: language }),
  setAlbumArtSize: (size) => set({ albumArtSize: size }),
  setAutoFetchAlbumArt: (enabled) => set({ autoFetchAlbumArt: enabled }),

  // === Behavior Settings Actions ===
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

  // === Performance Settings Actions ===
  setCacheSizeLimit: (limit) => set({ cacheSizeLimit: limit }),
  setMaxConcurrentScans: (max) => set({ maxConcurrentScans: max }),
  setThumbnailQuality: (quality) => set({ thumbnailQuality: quality }),
  setHardwareAcceleration: (enabled) => set({ hardwareAcceleration: enabled }),
  setAudioBufferSize: (size) => set({ audioBufferSize: size }),

  // === EQ Actions ===
  setEqBands: (bands) => set({ eqBands: bands }),

  // === Crossfade Actions ===
  setCrossfadeEnabled: (enabled) => set({ crossfadeEnabled: enabled }),
  setCrossfadeDuration: (duration) => set({ crossfadeDuration: duration }),

  // === Keyboard Shortcuts Actions ===
  setKeyboardShortcuts: (shortcuts) => set({ keyboardShortcuts: shortcuts }),

  // === Onboarding Actions ===
  setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),
});

/**
 * Settings state to persist
 */
export const settingsPersistState = (state) => ({
  // Playback Settings
  gaplessPlayback: state.gaplessPlayback,
  autoPlayOnStartup: state.autoPlayOnStartup,
  resumeLastTrack: state.resumeLastTrack,
  replayGainMode: state.replayGainMode,
  replayGainPreamp: state.replayGainPreamp,
  // Note: crossfade settings are now managed via Zustand persist (crossfadeEnabled, crossfadeDuration)
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
  // EQ Settings
  eqBands: state.eqBands,
  // Crossfade Settings
  crossfadeEnabled: state.crossfadeEnabled,
  crossfadeDuration: state.crossfadeDuration,
  // Keyboard Shortcuts
  keyboardShortcuts: state.keyboardShortcuts,
  // Onboarding
  onboardingComplete: state.onboardingComplete,
});
