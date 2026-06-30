export interface DevCountersState {
  albumArt: {
    requestsScheduled: number;
    requestsCancelledBeforeStart: number;
    requestsStarted: number;
    requestsDeduplicated: number;
    requestsQueued: number;
    requestsCompleted: number;
    requestsFailed: number;
    maxConcurrentRequests: number;
    currentQueueDepth: number;
    maxQueueDepth: number;
    requestsSkippedDueToFailedCache: number;
    requestsCancelledWhileQueued: number;
  };
  library: {
    loadTracksCount: number;
    loadAllFoldersCount: number;
    lastSearchDurationMs: number;
    lastTrackQueryDurationMs: number;
    staleSearchResultsIgnored: number;
  };
  audio: {
    lastTrackClickToUiUpdateMs: number;
    lastTrackClickToBackendInvokeMs: number;
    lastTrackClickToPlaybackStartMs: number;
    stalePlaybackRequestsIgnored: number;
    playbackTimeoutCount: number;
    pendingPlaybackStartTime: number;
  };
}

const defaultCounters: DevCountersState = {
  albumArt: {
    requestsScheduled: 0,
    requestsCancelledBeforeStart: 0,
    requestsStarted: 0,
    requestsDeduplicated: 0,
    requestsQueued: 0,
    requestsCompleted: 0,
    requestsFailed: 0,
    maxConcurrentRequests: 0,
    currentQueueDepth: 0,
    maxQueueDepth: 0,
    requestsSkippedDueToFailedCache: 0,
    requestsCancelledWhileQueued: 0,
  },
  library: {
    loadTracksCount: 0,
    loadAllFoldersCount: 0,
    lastSearchDurationMs: 0,
    lastTrackQueryDurationMs: 0,
    staleSearchResultsIgnored: 0,
  },
  audio: {
    lastTrackClickToUiUpdateMs: 0,
    lastTrackClickToBackendInvokeMs: 0,
    lastTrackClickToPlaybackStartMs: 0,
    stalePlaybackRequestsIgnored: 0,
    playbackTimeoutCount: 0,
    pendingPlaybackStartTime: 0,
  }
};

class DevCountersManager {
  private state: DevCountersState = JSON.parse(JSON.stringify(defaultCounters));

  get counters() {
    return this.state;
  }

  reset() {
    this.state = JSON.parse(JSON.stringify(defaultCounters));
    console.log('[DevCounters] Reset to zero');
  }

  // Album Art
  incAlbumArt(key: keyof DevCountersState['albumArt']) {
    this.state.albumArt[key]++;
  }

  updateAlbumArtMaxConcurrency(current: number) {
    if (current > this.state.albumArt.maxConcurrentRequests) {
      this.state.albumArt.maxConcurrentRequests = current;
    }
  }

  setAlbumArtValue(key: keyof DevCountersState['albumArt'], value: number) {
    this.state.albumArt[key] = value;
  }

  // Library
  incLibrary(key: keyof DevCountersState['library']) {
    this.state.library[key]++;
  }

  setLibraryValue(key: keyof DevCountersState['library'], value: number) {
    this.state.library[key] = value;
  }

  // Audio
  incAudio(key: keyof DevCountersState['audio']) {
    this.state.audio[key]++;
  }

  setAudioValue(key: keyof DevCountersState['audio'], value: number) {
    this.state.audio[key] = value;
  }
}

export const devCounters = new DevCountersManager();

// Expose globally for testing, but only in development mode
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).__DEV_COUNTERS__ = devCounters;
}
