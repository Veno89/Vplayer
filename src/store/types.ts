import { Track } from '../types';

export interface ABRepeatState {
    enabled: boolean;
    pointA: number | null;
    pointB: number | null;
}

export type RepeatMode = 'off' | 'one' | 'all';

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

// Helper type for Zustand creator
export type StateCreator<T> = (
    set: (partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: boolean) => void,
    get: () => T
) => T;
