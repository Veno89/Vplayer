import { createContext, useContext, useMemo, type ReactNode, type MutableRefObject } from 'react';
import { useAudio } from '../hooks/useAudio';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { TauriAPI } from '../services/TauriAPI';
import { log } from '../utils/logger';
import type { AudioService, Track } from '../types';
import type { CrossfadeAPI } from '../hooks/useCrossfade';

// ─────────────────────────────────────────────────────────────────────────────
// Context type
// ─────────────────────────────────────────────────────────────────────────────

export interface AudioEngineContextValue {
  audio: AudioService;
  audioIsLoading: boolean;
  audioBackendError: string | null;
}

const AudioEngineContext = createContext<AudioEngineContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export interface AudioEngineProviderProps {
  children: ReactNode;
  /** Ref set by EffectsProvider — used in onEnded/onDeviceLost to cancel fades. */
  crossfadeRef: MutableRefObject<CrossfadeAPI | null>;
  /** Ref set by PlaybackProvider — used in onEnded for handleNextTrack. */
  playerHookRef: MutableRefObject<{ handleNextTrack: () => void } | null>;
  /** Ref set by PlaybackProvider — fallback tracks for onEnded. */
  tracksRef: MutableRefObject<Track[]>;
}

export function AudioEngineProvider({
  children,
  crossfadeRef,
  playerHookRef,
  tracksRef,
}: AudioEngineProviderProps) {
  const volume = useStore(s => s.volume);
  const toast = useToast();

  // ── Audio engine ──────────────────────────────────────────────────
  const audio = useAudio({
    initialVolume: volume,
    onDeviceLost: () => {
      if (crossfadeRef.current?.isFading) {
        crossfadeRef.current.cancelCrossfade((vol: number) => {
          useStore.getState().setVolume(vol);
          TauriAPI.setVolume(vol).catch(() => {});
        });
      }
    },
    onEnded: () => {
      // ── Crossfade already handled this transition ──────────────────
      // If the crossfade midpoint already called setCurrentTrack, the
      // track switch is in progress. This track-ended event is a stale
      // signal from the old track running out — ignore it so we don't
      // double-advance (skip) or prematurely stop.
      const midpointHandled = crossfadeRef.current?.midpointReached ?? false;

      // Cancel any active crossfade first
      if (crossfadeRef.current?.isFading) {
        crossfadeRef.current.cancelCrossfade((vol: number) => {
          useStore.getState().setVolume(vol);
          TauriAPI.setVolume(vol).catch(err =>
            console.error('[onEnded] Failed to restore volume after crossfade cancel:', err)
          );
        });
      }

      if (midpointHandled) {
        log.info('[onEnded] Crossfade midpoint already switched tracks — ignoring stale track-ended');
        return;
      }

      // Read fresh state from store to avoid stale closures
      const state = useStore.getState();
      const pbTracks = state.activePlaybackTracks?.length > 0
        ? state.activePlaybackTracks
        : tracksRef.current;
      const currentRepeatMode = state.repeatMode;
      const currentTrackIdx = state.currentTrack;

      // ── Stop After Current Track ──────────────────────────────────
      if (state.stopAfterCurrent) {
        useStore.getState().setPlaying(false);
        useStore.getState().setStopAfterCurrent(false);
        return;
      }

      if (!pbTracks?.length) {
        useStore.getState().setPlaying(false);
      } else if (currentRepeatMode === 'one') {
        audio.seek(0);
        audio.play().catch(err => {
          console.error('Failed to replay:', err);
          toast.showError('Failed to replay track');
        });
      } else if (currentRepeatMode === 'all' || (currentTrackIdx ?? 0) < (pbTracks.length) - 1) {
        playerHookRef.current?.handleNextTrack();
      } else {
        useStore.getState().setPlaying(false);
      }
    },
  });

  const value = useMemo<AudioEngineContextValue>(() => ({
    audio,
    audioIsLoading: audio.isLoading,
    audioBackendError: audio.audioBackendError,
  }), [audio]);

  return (
    <AudioEngineContext.Provider value={value}>
      {children}
    </AudioEngineContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAudioEngine(): AudioEngineContextValue {
  const ctx = useContext(AudioEngineContext);
  if (!ctx) throw new Error('useAudioEngine must be used within <AudioEngineProvider>');
  return ctx;
}
