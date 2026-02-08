import { StateCreator } from 'zustand';
import { PlayerSlice, PlayerSliceState } from '../types';
import { Track } from '../../types';

export const createPlayerSlice: StateCreator<PlayerSlice> = (set, get) => ({
    // === Player State ===
    currentTrack: null,
    playing: false,
    progress: 0,
    duration: 0,
    loadingTrackIndex: null,
    volume: 0.7,
    shuffle: false,
    repeatMode: 'off',

    // === Active Playback Tracks ===
    activePlaybackTracks: [],

    // === A-B Repeat State ===
    abRepeat: {
        enabled: false,
        pointA: null,
        pointB: null,
    },

    // === Restore State (persisted) ===
    lastTrackId: null as string | null,
    lastPosition: 0,
    lastPlaylistId: null as string | null,

    // === Queue State ===
    queue: [],
    queueIndex: 0,
    queueHistory: [],

    // === Player Actions ===
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

    setActivePlaybackTracks: (tracks) => set({ activePlaybackTracks: tracks }),

    // === Restore Actions ===
    setLastTrackId: (id: string | null) => set({ lastTrackId: id }),
    setLastPosition: (position: number) => set({ lastPosition: position }),
    setLastPlaylistId: (id: string | null) => set({ lastPlaylistId: id }),

    getCurrentTrackData: () => {
        const state = get();
        if (state.currentTrack === null || state.currentTrack === undefined) return null;
        return state.activePlaybackTracks[state.currentTrack] || null;
    },

    getPlaybackTracks: () => {
        return get().activePlaybackTracks;
    },

    setShuffle: (shuffleOrUpdater) =>
        set((state) => ({
            shuffle: typeof shuffleOrUpdater === 'function'
                ? shuffleOrUpdater(state.shuffle)
                : shuffleOrUpdater
        })),

    setRepeatMode: (mode) => set({ repeatMode: mode }),

    // === A-B Repeat Actions ===
    setPointA: (time) => set((state) => ({
        abRepeat: { ...state.abRepeat, pointA: time }
    })),

    setPointB: (time) => set((state) => ({
        abRepeat: { ...state.abRepeat, pointB: time, enabled: time !== null && state.abRepeat.pointA !== null }
    })),

    toggleABRepeat: () => set((state) => ({
        abRepeat: {
            ...state.abRepeat,
            enabled: state.abRepeat.pointA !== null && state.abRepeat.pointB !== null
                ? !state.abRepeat.enabled
                : false
        }
    })),

    clearABRepeat: () => set({
        abRepeat: { enabled: false, pointA: null, pointB: null }
    }),

    // === Queue Actions ===
    addToQueue: (tracks, position = 'end') => {
        const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
        set((state) => {
            let newQueue: Track[];
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
            const newQueueIndex = index < state.queueIndex
                ? Math.max(0, state.queueIndex - 1)
                : state.queueIndex;
            return { queue: newQueue, queueIndex: newQueueIndex };
        }),

    clearQueue: () => set({ queue: [], queueIndex: 0 }),

    nextInQueue: () => {
        const state = get();
        if (state.queueIndex < state.queue.length - 1) {
            const currentTrack = state.queue[state.queueIndex];
            // Add current track to history before moving to next
            if (currentTrack) {
                set((state) => ({
                    queueHistory: [...state.queueHistory, currentTrack],
                    queueIndex: state.queueIndex + 1
                }));
            } else {
                set((state) => ({ queueIndex: state.queueIndex + 1 }));
            }
            return get().queue[state.queueIndex];
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
            // We return the track we just popped from history, but logic might vary
            // Usually "previous" means go back to the track we just played
            // which is now "current" or arguably the one before it?
            // Logic from original js: returns lastHistoryTrack.
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

        // Fisher-Yates shuffle
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
});

/**
 * Player state to persist
 */
export const playerPersistState = (state: PlayerSliceState) => ({
    volume: state.volume,
    shuffle: state.shuffle,
    repeatMode: state.repeatMode,
    lastTrackId: state.lastTrackId,
    lastPosition: state.lastPosition,
    lastPlaylistId: state.lastPlaylistId,
    queue: state.queue,
    queueHistory: state.queueHistory.slice(-50)
});
