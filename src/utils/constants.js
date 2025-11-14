// Audio Constants
export const VOLUME_STEP = 0.1;
export const SEEK_THRESHOLD_SECONDS = 3;
export const DEFAULT_VOLUME = 0.7;
export const AUDIO_UPDATE_INTERVAL_MS = 100;

// LocalStorage Keys
export const STORAGE_KEYS = {
  PLAYER_STATE: 'vplayer_player',
  UI_STATE: 'vplayer_ui',
  LAST_TRACK: 'vplayer_last_track',
  LAST_POSITION: 'vplayer_last_position',
  EQ_BANDS: 'vplayer_eq_bands',
  PLAYLISTS: 'vplayer_playlists',
  QUEUE: 'vplayer_queue',
  CROSSFADE_DURATION: 'vplayer_crossfade_duration',
  CROSSFADE_ENABLED: 'vplayer_crossfade_enabled',
};

// UI Constants
export const WINDOW_MIN_WIDTH = 200;
export const WINDOW_MIN_HEIGHT = 150;
export const MAX_Z_INDEX_START = 1000;

// Playlist Constants
export const REPEAT_MODES = {
  OFF: 'off',
  ALL: 'all',
  ONE: 'one',
};

// Search & Filter
export const SEARCH_DEBOUNCE_MS = 300;
export const MIN_SEARCH_LENGTH = 1;

// Visualizer
export const VISUALIZER_MODES = ['bars', 'wave', 'circular'];
export const VISUALIZER_FPS = 60;

// EQ Presets
export const EQ_PRESETS = {
  FLAT: {
    name: 'Flat',
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  ROCK: {
    name: 'Rock',
    bands: [5, 3, -2, -3, -1, 2, 4, 5, 5, 5],
  },
  JAZZ: {
    name: 'Jazz',
    bands: [4, 3, 1, 2, -1, -1, 0, 2, 3, 4],
  },
  CLASSICAL: {
    name: 'Classical',
    bands: [5, 4, 3, 2, -1, -1, 0, 2, 3, 4],
  },
  POP: {
    name: 'Pop',
    bands: [-1, -1, 0, 2, 4, 4, 2, 0, -1, -1],
  },
  ELECTRONIC: {
    name: 'Electronic',
    bands: [5, 4, 2, 0, -2, 2, 1, 2, 4, 5],
  },
  BASS_BOOST: {
    name: 'Bass Boost',
    bands: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  },
  TREBLE_BOOST: {
    name: 'Treble Boost',
    bands: [0, 0, 0, 0, 0, 2, 4, 6, 8, 10],
  },
  VOCAL: {
    name: 'Vocal',
    bands: [-2, -1, -1, 1, 3, 3, 2, 1, 0, -1],
  },
};

// Audio Retry
export const AUDIO_RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 500,
  MAX_DELAY_MS: 5000,
  BACKOFF_MULTIPLIER: 2,
};

// Crossfade
export const CROSSFADE_CONFIG = {
  DEFAULT_DURATION_MS: 3000,
  MIN_DURATION_MS: 1000,
  MAX_DURATION_MS: 10000,
  DEFAULT_ENABLED: false,
};

// Scanner
export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a', 'wma', 'opus',
];

// Event Names
export const EVENTS = {
  SCAN_TOTAL: 'scan-total',
  SCAN_PROGRESS: 'scan-progress',
  SCAN_COMPLETE: 'scan-complete',
  SCAN_CANCELLED: 'scan-cancelled',
  SCAN_ERROR: 'scan-error',
  GLOBAL_SHORTCUT: 'global-shortcut',
};

// Global Shortcut Actions
export const SHORTCUT_ACTIONS = {
  PLAY_PAUSE: 'play-pause',
  NEXT_TRACK: 'next-track',
  PREV_TRACK: 'prev-track',
  STOP: 'stop',
  VOLUME_UP: 'volume-up',
  VOLUME_DOWN: 'volume-down',
  MUTE: 'mute',
};

// Toast Types
export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

// Sort Options
export const SORT_OPTIONS = {
  TITLE: 'title',
  ARTIST: 'artist',
  ALBUM: 'album',
  DURATION: 'duration',
  YEAR: 'year',
  RATING: 'rating',
  PLAY_COUNT: 'playCount',
  DATE_ADDED: 'dateAdded',
};

// Error Messages
export const ERROR_MESSAGES = {
  AUDIO_BACKEND_UNAVAILABLE: 'Audio system is unavailable. Please restart the application.',
  TRACK_LOAD_FAILED: 'Failed to load track. The file may be corrupted or in an unsupported format.',
  FOLDER_SCAN_FAILED: 'Failed to scan folder. Please check folder permissions.',
  PLAYLIST_CREATE_FAILED: 'Failed to create playlist. Please try again.',
  TRACK_REMOVE_FAILED: 'Failed to remove track from library.',
  CORRUPTED_FILE_DETECTED: 'Corrupted audio file detected and removed from library.',
};

// Preferences
export const DEFAULT_PREFERENCES = {
  autoRemoveCorruptedFiles: true,
  confirmCorruptedFileRemoval: true,
  crossfadeEnabled: false,
  crossfadeDuration: 3000,
  gaplessPlayback: true,
  replayGain: false,
  normalization: false,
};
