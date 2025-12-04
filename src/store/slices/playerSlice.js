/**
 * Player Slice - Playback state and queue management
 */

export const createPlayerSlice = (set, get) => ({
  // === Player State ===
  currentTrack: null,
  playing: false,
  progress: 0,
  duration: 0,
  loadingTrackIndex: null,
  volume: 0.7,
  shuffle: false,
  repeatMode: 'off', // 'off', 'one', 'all'

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
  
  setShuffle: (shuffleOrUpdater) =>
    set((state) => ({
      shuffle: typeof shuffleOrUpdater === 'function'
        ? shuffleOrUpdater(state.shuffle)
        : shuffleOrUpdater
    })),
  
  setRepeatMode: (mode) => set({ repeatMode: mode }),

  // === Queue Actions ===
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
export const playerPersistState = (state) => ({
  volume: state.volume,
  shuffle: state.shuffle,
  repeatMode: state.repeatMode,
  queue: state.queue,
  queueHistory: state.queueHistory.slice(-50)
});
