import { createContext, useContext, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { useAudio } from '../hooks/useAudio';
import { usePlayer as usePlayerHook } from '../hooks/usePlayer';
import { useTrackLoading } from '../hooks/useTrackLoading';
import { useCrossfade } from '../hooks/useCrossfade';
import { useToast } from '../hooks/useToast';
import { useLibrary } from '../hooks/useLibrary';
import { usePlaybackEffects } from '../hooks/usePlaybackEffects';
import { useStartupRestore } from '../hooks/useStartupRestore';
import type { AudioService, Track } from '../types';
import type { CrossfadeAPI } from '../hooks/useCrossfade';
import type { ToastAPI } from '../hooks/useToast';

// ─────────────────────────────────────────────────────────────────────────────
// PlayerContext type definition
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
  setAdvancedFilters: React.Dispatch<React.SetStateAction<any>>;
  addFolder: () => Promise<any>;
  removeFolder: (id: string, path: string) => Promise<void>;
  refreshFolders: () => Promise<number>;
  removeTrack: (id: string) => Promise<void>;
  refreshTracks: () => Promise<void>;
}

/** Complete typed context value. */
export interface PlayerContextValue {
  // Audio engine state (not in Zustand)
  audioIsLoading: boolean;
  audioBackendError: string | null;

  // Player actions
  handleNextTrack: () => void;
  handlePrevTrack: () => void;
  handleSeek: (percent: number) => void;
  handleVolumeChange: (volume: number) => void;
  handleVolumeUp: (step?: number) => void;
  handleVolumeDown: (step?: number) => void;
  handleToggleMute: () => void;
  togglePlay: () => void;

  // Low-level audio (needed by shortcuts, MiniPlayer, etc.)
  audio: AudioService;

  // Crossfade
  crossfade: CrossfadeAPI;

  // Derived
  playbackTracks: Track[];

  // Library
  library: LibraryContextValue;

  // Toast (singleton — also available via useToast() directly)
  toast: ToastAPI;
}

/**
 * PlayerContext — single source of truth for audio playback.
 *
 * Encapsulates: useAudio, usePlayer, useTrackLoading, useCrossfade, useLibrary.
 * All player-related state lives in the Zustand store; this context
 * exposes *actions* and *derived values* that depend on the audio engine.
 *
 * Windows read scalar state (playing, progress, volume, etc.) directly
 * from `useStore(s => s.playing)` — they do NOT receive them as props.
 * They use `usePlayerContext()` only for actions and audio-engine state.
 */
const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const toast = useToast();

  // ── Store selectors (only what orchestration needs) ───────────────
  const currentTrack = useStore(s => s.currentTrack);
  const setCurrentTrack = useStore(s => s.setCurrentTrack);
  const setPlaying = useStore(s => s.setPlaying);
  const setProgress = useStore(s => s.setProgress);
  const setDuration = useStore(s => s.setDuration);
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

  // ── Derived: playback track list ──────────────────────────────────
  const playbackTracks = activePlaybackTracks?.length > 0 ? activePlaybackTracks : tracks;

  // playerHookRef needed because playerHook is a hook instance, not store state
  const playerHookRef = useRef<any>(null);

  // ── Audio engine ──────────────────────────────────────────────────
  const audio = useAudio({
    initialVolume: volume,
    onEnded: () => {
      // Read fresh state from store to avoid stale closures
      const state = useStore.getState();
      const pbTracks = state.activePlaybackTracks?.length > 0 ? state.activePlaybackTracks : state.tracks;
      const currentRepeatMode = state.repeatMode;
      const currentTrackIdx = state.currentTrack;

      if (currentRepeatMode === 'one') {
        audio.seek(0);
        audio.play().catch(err => {
          console.error('Failed to replay:', err);
          toast.showError('Failed to replay track');
        });
      } else if (currentRepeatMode === 'all' || currentTrackIdx < (pbTracks?.length ?? 0) - 1) {
        playerHookRef.current?.handleNextTrack();
      } else {
        useStore.getState().setPlaying(false);
      }
    },
    onTimeUpdate: (time) => {
      setProgress(time);
    },
  });

  // ── Crossfade ─────────────────────────────────────────────────────
  const crossfade = useCrossfade();

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

  // Keep playerHookRef in sync for onEnded closure
  useEffect(() => { playerHookRef.current = playerHook; }, [playerHook]);

  // ── Track loading ─────────────────────────────────────────────────
  const trackLoading = useTrackLoading({
    audio,
    tracks: playbackTracks,
    currentTrack,
    playing,
    setDuration,
    setLoadingTrackIndex,
    progress,
    toast,
    removeTrack,
    setCurrentTrack,
    handleNextTrack: playerHook.handleNextTrack,
  });

  // ── Extracted side-effect hooks ───────────────────────────────────
  usePlaybackEffects({ audio, toast, tracks });
  useStartupRestore(tracks, trackLoading);

  // ── Context value ─────────────────────────────────────────────────
  // NOTE: Scalar playback state (playing, progress, volume, etc.) is NOT here.
  // Windows read those directly from useStore. This context provides:
  //   1) Audio-engine state not in the store (isLoading, audioBackendError)
  //   2) Actions that need the audio engine (next, prev, seek, togglePlay …)
  //   3) Derived values (playbackTracks)
  //   4) Library data & actions
  //   5) Crossfade service
  //   6) Toast service

  const value = {
    // Audio engine state (not in Zustand)
    audioIsLoading: audio.isLoading,
    audioBackendError: audio.audioBackendError,

    // Player actions
    handleNextTrack: playerHook.handleNextTrack,
    handlePrevTrack: playerHook.handlePrevTrack,
    handleSeek: playerHook.handleSeek,
    handleVolumeChange: playerHook.handleVolumeChange,
    handleVolumeUp: playerHook.handleVolumeUp,
    handleVolumeDown: playerHook.handleVolumeDown,
    handleToggleMute: playerHook.handleToggleMute,
    togglePlay: useCallback(() => setPlaying(p => !p), [setPlaying]),

    // Low-level audio access (needed by shortcuts, MiniPlayer, etc.)
    audio,

    // Crossfade
    crossfade,

    // Derived
    playbackTracks,

    // Library (so windows can access tracks, folders, scanning, etc.)
    library,

    // Toast (shared instance)
    toast,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

/**
 * Use the player context in any descendant component.
 *
 * For scalar playback state (playing, progress, volume, currentTrack, …)
 * prefer `useStore(s => s.playing)` directly — it's more granular and
 * avoids unnecessary re-renders.
 *
 * Use this hook for:
 * - Actions: `handleNextTrack`, `handleSeek`, `togglePlay`, …
 * - Audio-engine state: `audioIsLoading`, `audioBackendError`
 * - Library data: `library.tracks`, `library.libraryFolders`, …
 * - Crossfade: `crossfade.enabled`, `crossfade.toggleEnabled`, …
 */
export function usePlayerContext(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayerContext must be used within a <PlayerProvider>');
  }
  return context;
}
