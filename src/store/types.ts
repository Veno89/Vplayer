import { Track } from '../types';

// =============================================================================
// Shared / Primitive Types
// =============================================================================

export interface ABRepeatState {
    enabled: boolean;
    pointA: number | null;
    pointB: number | null;
}

export type RepeatMode = 'off' | 'one' | 'all';

// =============================================================================
// Window Types (internal store representation)
// =============================================================================

export interface WindowPosition {
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    minimized: boolean;
    zIndex: number;
}

/** All window IDs the store recognises */
export type WindowId =
    | 'player' | 'playlist' | 'library' | 'equalizer' | 'visualizer'
    | 'queue' | 'options' | 'history' | 'albumView' | 'smartPlaylists'
    | 'lyrics' | 'shortcuts' | 'discography' | 'tagEditor' | 'miniPlayer';

export type WindowsState = Record<string, WindowPosition>;

// =============================================================================
// Layout Types
// =============================================================================

export interface LayoutPreviewItem {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
}

export interface LayoutTemplateWindow {
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    minimized: boolean;
}

export interface LayoutTemplate {
    name: string;
    label: string;
    description: string;
    preview: LayoutPreviewItem[];
    windows: Record<string, LayoutTemplateWindow>;
}

// =============================================================================
// Color / Theme Types
// =============================================================================

export interface ColorScheme {
    name: string;
    label?: string;
    accent: string;
    accentHex?: string;
    background: string;
    backgroundSecondary?: string;
    backgroundTertiary?: string;
    primary: string;
    primaryHover?: string;
    color?: string;
    border?: string;
    borderLight?: string;
    text: string;
    textMuted: string;
    textSubtle?: string;
    gradientFrom?: string;
    gradientVia?: string;
    gradientTo?: string;
    windowBg?: string;
    windowBorder?: string;
    headerBg?: string;
    scrollbarTrack?: string;
    scrollbarThumb?: string;
    selection?: string;
}

// =============================================================================
// EQ Types
// =============================================================================

export interface EqBand {
    freq: string;
    value: number;
}

// =============================================================================
// Keyboard Shortcut Types
// =============================================================================

export interface KeyboardShortcut {
    id: string;
    name: string;
    key: string;
    category: string;
}

// =============================================================================
// MusicBrainz Types
// =============================================================================

export interface ResolvedArtist {
    id: string;
    name: string;
    disambiguation?: string;
    resolvedAt: number;
    [key: string]: unknown;
}

export interface DiscographyAlbum {
    mbReleaseGroupId: string;
    title: string;
    type?: string;
    date?: string;
    status: string;
    localAlbum?: string | null;
    manuallySet?: boolean;
    [key: string]: unknown;
}

export interface ArtistDiscography {
    albums: DiscographyAlbum[];
    fetchedAt: number;
    [key: string]: unknown;
}

export interface DiscographyProgress {
    current: number;
    total: number;
    artist: string;
}

export interface DiscographyConfig {
    includeEPs: boolean;
    includeLive: boolean;
    includeCompilations: boolean;
    includeBootlegs: boolean;
    autoFetchOnOpen: boolean;
    refreshIntervalDays: number;
}

// =============================================================================
// Player Slice
// =============================================================================

export interface PlayerSliceState {
    // Player State
    currentTrack: number | null;
    playing: boolean;
    progress: number;
    duration: number;
    loadingTrackIndex: number | null;
    volume: number;
    shuffle: boolean;
    repeatMode: RepeatMode;

    // Active Playback Data
    activePlaybackTracks: Track[];

    // A-B Repeat State
    abRepeat: ABRepeatState;

    // Restore State (persisted)
    lastTrackId: string | null;
    lastPosition: number;
    lastPlaylistId: string | null;

    // Queue State
    queue: Track[];
    queueIndex: number;
    queueHistory: Track[];
}

export interface PlayerSliceActions {
    // Player Actions
    setCurrentTrack: (trackIndex: number | null) => void;
    setPlaying: (playing: boolean | ((prev: boolean) => boolean)) => void;
    setProgress: (progress: number) => void;
    setDuration: (duration: number) => void;
    setLoadingTrackIndex: (index: number | null) => void;
    setVolume: (volume: number) => void;
    setShuffle: (shuffle: boolean | ((prev: boolean) => boolean)) => void;
    setRepeatMode: (mode: RepeatMode) => void;

    // Active Playback Actions
    setActivePlaybackTracks: (tracks: Track[]) => void;
    getCurrentTrackData: () => Track | null;
    getPlaybackTracks: () => Track[];

    // Restore Actions
    setLastTrackId: (id: string | null) => void;
    setLastPosition: (position: number) => void;
    setLastPlaylistId: (id: string | null) => void;

    // A-B Repeat Actions
    setPointA: (time: number | null) => void;
    setPointB: (time: number | null) => void;
    toggleABRepeat: () => void;
    clearABRepeat: () => void;

    // Queue Actions
    addToQueue: (tracks: Track | Track[], position?: 'end' | 'next' | 'start') => void;
    removeFromQueue: (index: number) => void;
    clearQueue: () => void;
    nextInQueue: () => Track | null;
    previousInQueue: () => Track | null;
    getCurrentQueueTrack: () => Track | null;
    peekNextInQueue: () => Track | null;
    replaceQueue: (newTracks: Track[], startIndex?: number) => void;
    shuffleQueue: () => void;
    moveInQueue: (fromIndex: number, toIndex: number) => void;
}

export type PlayerSlice = PlayerSliceState & PlayerSliceActions;

// =============================================================================
// UI Slice
// =============================================================================

export interface UISliceState {
    // Window State
    windows: WindowsState;
    maxZIndex: number;
    currentLayout: string;

    // Theme State
    colorScheme: string;
    customThemes: Record<string, ColorScheme>;

    // Visual Settings
    backgroundImage: string | null;
    backgroundBlur: number;
    backgroundOpacity: number;
    windowOpacity: number;
    fontSize: number;
    debugVisible: boolean;

    // Transient UI State (not persisted)
    tagEditorTrack: Track | null;
    themeEditorOpen: boolean;
    isDraggingTracks: boolean;
}

export interface UISliceActions {
    // Window Actions
    setWindows: (windowsOrUpdater: WindowsState | ((prev: WindowsState) => WindowsState)) => void;
    updateWindow: (id: string, updates: Partial<WindowPosition>) => void;
    setMaxZIndex: (zIndex: number) => void;
    bringToFront: (id: string) => void;
    toggleWindow: (id: string) => void;

    // Theme Actions
    setColorScheme: (scheme: string) => void;
    getCurrentColors: () => ColorScheme;
    getColorSchemes: () => Record<string, ColorScheme>;
    saveCustomTheme: (theme: ColorScheme) => void;
    deleteCustomTheme: (themeName: string) => void;
    applyCustomTheme: (theme: ColorScheme) => void;

    // Layout Actions
    applyLayout: (layoutName: string) => void;
    getLayouts: () => LayoutTemplate[];

    // Visual Settings Actions
    setBackgroundImage: (image: string | null) => void;
    setBackgroundBlur: (blur: number) => void;
    setBackgroundOpacity: (opacity: number) => void;
    setWindowOpacity: (opacity: number) => void;
    setFontSize: (size: number) => void;
    setDebugVisible: (visible: boolean) => void;

    // Transient UI Actions
    setTagEditorTrack: (track: Track | null) => void;
    setThemeEditorOpen: (open: boolean) => void;
    setIsDraggingTracks: (dragging: boolean) => void;

    // Reset
    resetWindowPositions: () => void;
}

export type UISlice = UISliceState & UISliceActions;

// =============================================================================
// Settings Slice
// =============================================================================

export interface SettingsSliceState {
    // Playback Settings
    gaplessPlayback: boolean;
    autoPlayOnStartup: boolean;
    resumeLastTrack: boolean;
    replayGainMode: 'off' | 'track' | 'album';
    replayGainPreamp: number;
    playbackSpeed: number;
    fadeOnPause: boolean;
    fadeDuration: number;
    defaultVolume: number;
    rememberTrackPosition: boolean;

    // Library Settings
    autoScanOnStartup: boolean;
    watchFolderChanges: boolean;
    excludedFormats: string[];
    duplicateSensitivity: 'low' | 'medium' | 'high';
    showHiddenFiles: boolean;
    metadataLanguage: string;
    albumArtSize: 'small' | 'medium' | 'large';
    autoFetchAlbumArt: boolean;

    // Behavior Settings
    minimizeToTray: boolean;
    closeToTray: boolean;
    startMinimized: boolean;
    rememberWindowPositions: boolean;
    playlistAutoScroll: boolean;
    autoResizeWindow: boolean;
    confirmBeforeDelete: boolean;
    showNotifications: boolean;
    snapToGrid: boolean;
    gridSize: number;

    // Performance Settings
    cacheSizeLimit: number;
    maxConcurrentScans: number;
    thumbnailQuality: 'low' | 'medium' | 'high';
    hardwareAcceleration: boolean;
    audioBufferSize: number;

    // EQ Settings
    eqBands: EqBand[];

    // Crossfade Settings
    crossfadeEnabled: boolean;
    crossfadeDuration: number;

    // Keyboard Shortcuts
    keyboardShortcuts: KeyboardShortcut[] | null;

    // Onboarding
    onboardingComplete: boolean;
}

/**
 * Generic setter: updateSetting('gaplessPlayback', true)
 * All individual setXxx methods are auto-generated from SettingsSliceState keys.
 */
export interface SettingsSliceActions {
    /** Generic type-safe setter for any setting */
    updateSetting: <K extends keyof SettingsSliceState>(key: K, value: SettingsSliceState[K]) => void;

    // Individual setters (backward-compatible, auto-generated in createSettingsSlice)
    setGaplessPlayback: (enabled: boolean) => void;
    setAutoPlayOnStartup: (enabled: boolean) => void;
    setResumeLastTrack: (enabled: boolean) => void;
    setReplayGainMode: (mode: 'off' | 'track' | 'album') => void;
    setReplayGainPreamp: (preamp: number) => void;
    setPlaybackSpeed: (speed: number) => void;
    setFadeOnPause: (enabled: boolean) => void;
    setFadeDuration: (duration: number) => void;
    setDefaultVolume: (volume: number) => void;
    setRememberTrackPosition: (enabled: boolean) => void;
    setAutoScanOnStartup: (enabled: boolean) => void;
    setWatchFolderChanges: (enabled: boolean) => void;
    setExcludedFormats: (formats: string[]) => void;
    setDuplicateSensitivity: (sensitivity: 'low' | 'medium' | 'high') => void;
    setShowHiddenFiles: (enabled: boolean) => void;
    setMetadataLanguage: (language: string) => void;
    setAlbumArtSize: (size: 'small' | 'medium' | 'large') => void;
    setAutoFetchAlbumArt: (enabled: boolean) => void;
    setMinimizeToTray: (enabled: boolean) => void;
    setCloseToTray: (enabled: boolean) => void;
    setStartMinimized: (enabled: boolean) => void;
    setRememberWindowPositions: (enabled: boolean) => void;
    setPlaylistAutoScroll: (enabled: boolean) => void;
    setAutoResizeWindow: (enabled: boolean) => void;
    setConfirmBeforeDelete: (enabled: boolean) => void;
    setShowNotifications: (enabled: boolean) => void;
    setSnapToGrid: (enabled: boolean) => void;
    setGridSize: (size: number) => void;
    setCacheSizeLimit: (limit: number) => void;
    setMaxConcurrentScans: (max: number) => void;
    setThumbnailQuality: (quality: 'low' | 'medium' | 'high') => void;
    setHardwareAcceleration: (enabled: boolean) => void;
    setAudioBufferSize: (size: number) => void;
    setEqBands: (bands: EqBand[]) => void;
    setCrossfadeEnabled: (enabled: boolean) => void;
    setCrossfadeDuration: (duration: number) => void;
    setKeyboardShortcuts: (shortcuts: KeyboardShortcut[] | null) => void;
    setOnboardingComplete: (complete: boolean) => void;
}

export type SettingsSlice = SettingsSliceState & SettingsSliceActions;

// =============================================================================
// MusicBrainz Slice
// =============================================================================

export interface MusicBrainzSliceState {
    resolvedArtists: Record<string, ResolvedArtist>;
    artistDiscographies: Record<string, ArtistDiscography>;
    selectedArtistMbid: string | null;
    discographyLoading: boolean;
    discographyProgress: DiscographyProgress;
    discographyError: string | null;
    discographyConfig: DiscographyConfig;
}

export interface MusicBrainzSliceActions {
    setResolvedArtist: (artistName: string, mbArtistData: Omit<ResolvedArtist, 'resolvedAt'>) => void;
    removeResolvedArtist: (artistName: string) => void;
    setArtistDiscography: (artistMbid: string, discographyData: Omit<ArtistDiscography, 'fetchedAt'>) => void;
    updateAlbumMatchStatus: (artistMbid: string, releaseGroupId: string, newStatus: string, localAlbum?: string | null) => void;
    setSelectedArtistMbid: (mbid: string | null) => void;
    setDiscographyLoading: (loading: boolean) => void;
    setDiscographyProgress: (progress: DiscographyProgress) => void;
    setDiscographyError: (error: string | null) => void;
    setDiscographyConfig: (config: Partial<DiscographyConfig>) => void;
    clearDiscographyData: () => void;
    getResolvedArtist: (artistName: string) => ResolvedArtist | null;
    getArtistDiscography: (artistMbid: string) => ArtistDiscography | null;
    needsDiscographyRefresh: (artistMbid: string) => boolean;
}

export type MusicBrainzSlice = MusicBrainzSliceState & MusicBrainzSliceActions;

// =============================================================================
// Combined Store Type
// =============================================================================

export type AppStore = PlayerSlice & UISlice & SettingsSlice & MusicBrainzSlice;

// Helper type for Zustand creator
export type SliceCreator<T> = (
    set: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void,
    get: () => AppStore
) => T;
