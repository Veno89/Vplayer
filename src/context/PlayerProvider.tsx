import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { AudioEngineProvider, useAudioEngine } from './AudioEngineContext';
import { EffectsProvider, useEffectsContext } from './EffectsContext';
import { PlaybackProvider, usePlaybackContext, type LibraryContextValue } from './PlaybackContext';
import type { AudioService, Track } from '../types';
import type { CrossfadeAPI } from '../hooks/useCrossfade';
import type { ToastAPI } from '../hooks/useToast';

// ─────────────────────────────────────────────────────────────────────────────
// Re-export focused hooks for consumers that only need a specific domain
// ─────────────────────────────────────────────────────────────────────────────

export { useAudioEngine } from './AudioEngineContext';
export { useEffectsContext } from './EffectsContext';
export { usePlaybackContext } from './PlaybackContext';

// Re-export LibraryContextValue from its canonical location
export type { LibraryContextValue } from './PlaybackContext';

// ─────────────────────────────────────────────────────────────────────────────
// Shared type definitions
// ─────────────────────────────────────────────────────────────────────────────

/** Complete typed context value (backward-compat aggregate). */
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

// ─────────────────────────────────────────────────────────────────────────────
// Combined PlayerContext (backward compat for existing consumers)
// ─────────────────────────────────────────────────────────────────────────────

const PlayerContext = createContext<PlayerContextValue | null>(null);

/**
 * Bridge component that sits inside all 3 providers and aggregates their
 * values into the legacy PlayerContext. Existing consumers keep working
 * without changes.
 */
function PlayerContextBridge({ children }: { children: ReactNode }) {
  const { audio, audioIsLoading, audioBackendError } = useAudioEngine();
  const { crossfade } = useEffectsContext();
  const {
    handleNextTrack, handlePrevTrack, handleSeek,
    handleVolumeChange, handleVolumeUp, handleVolumeDown,
    handleToggleMute, togglePlay, playbackTracks, library, toast,
  } = usePlaybackContext();

  const value = useMemo<PlayerContextValue>(() => ({
    audio, audioIsLoading, audioBackendError,
    handleNextTrack, handlePrevTrack, handleSeek,
    handleVolumeChange, handleVolumeUp, handleVolumeDown,
    handleToggleMute, togglePlay,
    crossfade,
    playbackTracks,
    library,
    toast,
  }), [
    audio, audioIsLoading, audioBackendError,
    handleNextTrack, handlePrevTrack, handleSeek,
    handleVolumeChange, handleVolumeUp, handleVolumeDown,
    handleToggleMute, togglePlay,
    crossfade, playbackTracks, library, toast,
  ]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlayerProvider — thin composition root
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Composes three focused providers into the unified player context:
 *
 *   AudioEngineProvider  — useAudio + device events
 *   EffectsProvider      — crossfade
 *   PlaybackProvider     — player actions + library + track loading + side-effects
 *
 * Cross-provider communication uses ref bridges (crossfadeRef, playerHookRef,
 * tracksRef) created here and passed as props.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const crossfadeRef = useRef<CrossfadeAPI | null>(null);
  const playerHookRef = useRef<{ handleNextTrack: () => void } | null>(null);
  const tracksRef = useRef<Track[]>([]);

  return (
    <AudioEngineProvider
      crossfadeRef={crossfadeRef}
      playerHookRef={playerHookRef}
      tracksRef={tracksRef}
    >
      <EffectsProvider crossfadeRef={crossfadeRef}>
        <PlaybackProvider playerHookRef={playerHookRef} tracksRef={tracksRef}>
          <PlayerContextBridge>
            {children}
          </PlayerContextBridge>
        </PlaybackProvider>
      </EffectsProvider>
    </AudioEngineProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward-compatible hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Use the player context in any descendant component.
 *
 * For scalar playback state (playing, progress, volume, currentTrack, …)
 * prefer `useStore(s => s.playing)` directly — it's more granular and
 * avoids unnecessary re-renders.
 *
 * For focused access, prefer the domain-specific hooks:
 * - `useAudioEngine()` — audio engine state
 * - `useEffectsContext()` — crossfade
 * - `usePlaybackContext()` — player actions, library, toast
 */
export function usePlayerContext(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayerContext must be used within a <PlayerProvider>');
  }
  return context;
}
