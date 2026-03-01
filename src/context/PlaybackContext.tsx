import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type ReactNode,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useStore } from '../store/useStore';
import { usePlayer as usePlayerHook } from '../hooks/usePlayer';
import { useTrackLoading } from '../hooks/useTrackLoading';
import { useLibrary } from '../hooks/useLibrary';
import { useToast } from '../hooks/useToast';
import { usePlaybackEffects } from '../hooks/usePlaybackEffects';
import { useStartupRestore } from '../hooks/useStartupRestore';
import { useAudioEngine } from './AudioEngineContext';
import { useEffectsContext } from './EffectsContext';
import type { Track } from '../types';
import type { ToastAPI } from '../hooks/useToast';

// ─────────────────────────────────────────────────────────────────────────────
// Library type (co-located here to avoid circular imports with PlayerProvider)
// ─────────────────────────────────────────────────────────────────────────────

/** Library data & actions exposed via context. */
export interface LibraryContextValue {
  tracks: Track[];
  libraryFolders: { id: string; path: string; name: string; dateAdded: number }[];
  isScanning: boolean;
  scanProgress: number;
  scanCurrent: number;
  scanTotal: number;
  scanCurrentFile: string;
  searchQuery: string;
  sortBy: string;
  sortOrder: string;
  advancedFilters: Record<string, any>;
  filteredTracks: Track[];
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: string) => void;
  setSortOrder: (order: string) => void;
  setAdvancedFilters: Dispatch<SetStateAction<any>>;
  addFolder: () => Promise<any>;
  removeFolder: (id: string, path: string) => Promise<void>;
  refreshFolders: () => Promise<number>;
  removeTrack: (id: string) => Promise<void>;
  refreshTracks: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context type
// ─────────────────────────────────────────────────────────────────────────────

export interface PlaybackContextValue {
  handleNextTrack: () => void;
  handlePrevTrack: () => void;
  handleSeek: (percent: number) => void;
  handleVolumeChange: (volume: number) => void;
  handleVolumeUp: (step?: number) => void;
  handleVolumeDown: (step?: number) => void;
  handleToggleMute: () => void;
  togglePlay: () => void;
  playbackTracks: Track[];
  library: LibraryContextValue;
  toast: ToastAPI;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export interface PlaybackProviderProps {
  children: ReactNode;
  /** Ref bridge — PlaybackProvider writes the playerHook API here so
   *  AudioEngineProvider's onEnded callback can call handleNextTrack. */
  playerHookRef: MutableRefObject<{ handleNextTrack: () => void } | null>;
  /** Ref bridge — PlaybackProvider writes the library tracks here so
   *  AudioEngineProvider's onEnded callback can use them as fallback. */
  tracksRef: MutableRefObject<Track[]>;
}

export function PlaybackProvider({ children, playerHookRef, tracksRef }: PlaybackProviderProps) {
  const { audio } = useAudioEngine();
  const { crossfade } = useEffectsContext();
  const toast = useToast();

  // ── Store selectors (only what orchestration needs) ───────────────
  const currentTrack = useStore(s => s.currentTrack);
  const setCurrentTrack = useStore(s => s.setCurrentTrack);
  const setPlaying = useStore(s => s.setPlaying);
  const volume = useStore(s => s.volume);
  const setVolume = useStore(s => s.setVolume);
  const shuffle = useStore(s => s.shuffle);
  const repeatMode = useStore(s => s.repeatMode);
  const setLoadingTrackIndex = useStore(s => s.setLoadingTrackIndex);
  const activePlaybackTracks = useStore(s => s.activePlaybackTracks);
  const progress = useStore(s => s.progress);
  const duration = useStore(s => s.duration);
  const playing = useStore(s => s.playing);

  // ── Library (provides tracks + management) ────────────────────────
  const library = useLibrary();
  const { tracks, removeTrack } = library;

  // Keep tracksRef in sync for AudioEngine's onEnded callback
  useEffect(() => { tracksRef.current = tracks; });

  // ── Derived: playback track list ──────────────────────────────────
  const playbackTracks = activePlaybackTracks?.length > 0 ? activePlaybackTracks : tracks;

  // ── Player actions (next/prev/seek/volume) ────────────────────────
  const storeGetterRef = useRef(() => useStore.getState());

  const playerHook = usePlayerHook({
    audio,
    player: { currentTrack, setCurrentTrack, shuffle, repeatMode, progress, duration, volume, setVolume },
    tracks: playbackTracks,
    toast,
    crossfade,
    storeGetter: storeGetterRef.current,
  });

  // Keep playerHookRef in sync for AudioEngine's onEnded closure
  useEffect(() => { playerHookRef.current = playerHook; }, [playerHook]);

  // ── Track loading ─────────────────────────────────────────────────
  const trackLoading = useTrackLoading({
    audio,
    tracks: playbackTracks,
    currentTrack,
    playing,
    setLoadingTrackIndex,
    progress,
    toast,
    removeTrack,
    setCurrentTrack,
    handleNextTrack: playerHook.handleNextTrack,
  });

  // ── Startup restore ───────────────────────────────────────────────
  useStartupRestore(tracks, trackLoading);

  // ── Side-effect hooks ─────────────────────────────────────────────
  usePlaybackEffects({ audio, toast, tracks });

  // ── Derived callbacks ─────────────────────────────────────────────
  const togglePlayCb = useCallback(() => setPlaying((p: boolean) => !p), [setPlaying]);

  const value = useMemo<PlaybackContextValue>(() => ({
    handleNextTrack: playerHook.handleNextTrack,
    handlePrevTrack: playerHook.handlePrevTrack,
    handleSeek: playerHook.handleSeek,
    handleVolumeChange: playerHook.handleVolumeChange,
    handleVolumeUp: playerHook.handleVolumeUp,
    handleVolumeDown: playerHook.handleVolumeDown,
    handleToggleMute: playerHook.handleToggleMute,
    togglePlay: togglePlayCb,
    playbackTracks,
    library,
    toast,
  }), [playerHook, togglePlayCb, playbackTracks, library, toast]);

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function usePlaybackContext(): PlaybackContextValue {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error('usePlaybackContext must be used within <PlaybackProvider>');
  return ctx;
}
