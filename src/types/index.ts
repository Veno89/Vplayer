// Type definitions for VPlayer

// =============================================================================
// Track Types
// =============================================================================

export interface Track {
    id: string;
    path: string;
    name: string;
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    year?: number;
    duration: number;
    track_number?: number;
    disc_number?: number;
    rating?: number;
    play_count?: number;
    last_played?: number;
    date_added?: number;
    folder_id?: string;
}

export interface TrackFilter {
    searchQuery?: string | null;
    artist?: string | null;
    album?: string | null;
    genre?: string | null;
    sortBy?: string | null;
    sortDesc?: boolean;
    playCountMin?: number | null;
    playCountMax?: number | null;
    minRating?: number | null;
    durationFrom?: number | null;
    durationTo?: number | null;
    folderId?: string | null;
}

// =============================================================================
// Player Types
// =============================================================================

export type RepeatMode = 'none' | 'one' | 'all';

export interface PlayerState {
    currentTrack: number | null;
    setCurrentTrack: (index: number | null) => void;
    shuffle: boolean;
    repeatMode: RepeatMode;
    progress: number;
    duration: number;
    volume: number;
    setVolume: (volume: number) => void;
}

export interface PlayerHookParams {
    audio: AudioService;
    player: PlayerState;
    tracks: Track[];
    toast: ToastService;
    crossfade?: CrossfadeService;
    store?: StoreState;
}

export interface PlayerHookReturn {
    handleNextTrack: () => void;
    handlePrevTrack: () => void;
    handleSeek: (percent: number) => void;
    handleVolumeChange: (volume: number) => void;
    handleVolumeUp: (step?: number) => void;
    handleVolumeDown: (step?: number) => void;
    handleToggleMute: () => void;
}

// =============================================================================
// Audio Types
// =============================================================================

export interface AudioService {
    isPlaying: boolean;
    isLoading: boolean;
    progress: number;
    duration: number;
    volume: number;
    audioBackendError: string | null;
    loadTrack: (track: Track) => Promise<void>;
    play: () => Promise<void>;
    pause: () => Promise<void>;
    stop: () => Promise<void>;
    changeVolume: (volume: number) => Promise<void>;
    seek: (position: number) => Promise<void>;
}

export interface AudioHookParams {
    onEnded?: () => void;
    onTimeUpdate?: (time: number) => void;
    initialVolume?: number;
}

// =============================================================================
// Toast Types
// =============================================================================

export interface ToastService {
    showSuccess: (message: string, duration?: number) => void;
    showError: (message: string, duration?: number) => void;
    showWarning: (message: string, duration?: number) => void;
    showInfo: (message: string, duration?: number) => void;
}

// =============================================================================
// Crossfade Types
// =============================================================================

export interface CrossfadeService {
    enabled: boolean;
    duration: number;
    shouldCrossfade: (progress: number, duration: number) => boolean;
    startCrossfade: (options: CrossfadeOptions) => void;
    cancelCrossfade: (setVolume: (vol: number) => void) => void;
}

export interface CrossfadeOptions {
    setVolume: (vol: number) => void;
    currentVolume: number;
    onMidpoint: () => void;
    onComplete: () => void;
}

// =============================================================================
// Store Types
// =============================================================================

export interface QueueTrack extends Track {
    queueId: string;
}

export interface StoreState {
    queue: QueueTrack[];
    peekNextInQueue: () => QueueTrack | undefined;
    nextInQueue: () => QueueTrack | undefined;
}

// =============================================================================
// Playlist Types
// =============================================================================

export interface Playlist {
    id: string;
    name: string;
    created_at: number;
}

export interface PlaylistTrack {
    playlist_id: string;
    track_id: string;
    position: number;
}

// =============================================================================
// Window Types
// =============================================================================

export interface WindowState {
    id: string;
    visible: boolean;
    minimized: boolean;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
}

export interface WindowConfig {
    id: string;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    content: React.ReactNode;
}

// =============================================================================
// Theme Types
// =============================================================================

export interface ColorScheme {
    name: string;
    accent: string;
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
}
