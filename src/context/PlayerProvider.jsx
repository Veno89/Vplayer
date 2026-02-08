import { createContext, useContext, useEffect, useCallback, useRef } from 'react';
import { TauriAPI } from '../services/TauriAPI';
import { useStore } from '../store/useStore';
import { useAudio } from '../hooks/useAudio';
import { usePlayer as usePlayerHook } from '../hooks/usePlayer';
import { useTrackLoading } from '../hooks/useTrackLoading';
import { useCrossfade } from '../hooks/useCrossfade';
import { useToast } from '../hooks/useToast';
import { useLibrary } from '../hooks/useLibrary';

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
const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const toast = useToast();
  const prevPlayingRef = useRef(null);

  // ── Store selectors (reactive) ────────────────────────────────────
  const currentTrack = useStore(s => s.currentTrack);
  const setCurrentTrack = useStore(s => s.setCurrentTrack);
  const playing = useStore(s => s.playing);
  const setPlaying = useStore(s => s.setPlaying);
  const setProgress = useStore(s => s.setProgress);
  const setDuration = useStore(s => s.setDuration);
  const volume = useStore(s => s.volume);
  const setVolume = useStore(s => s.setVolume);
  const shuffle = useStore(s => s.shuffle);
  const setShuffle = useStore(s => s.setShuffle);
  const repeatMode = useStore(s => s.repeatMode);
  const setRepeatMode = useStore(s => s.setRepeatMode);
  const setLoadingTrackIndex = useStore(s => s.setLoadingTrackIndex);
  const abRepeat = useStore(s => s.abRepeat);
  const activePlaybackTracks = useStore(s => s.activePlaybackTracks);
  const progress = useStore(s => s.progress);
  const duration = useStore(s => s.duration);

  // Settings (for startup behaviour)
  const autoPlayOnStartup = useStore(s => s.autoPlayOnStartup);
  const resumeLastTrack = useStore(s => s.resumeLastTrack);

  // ── Library (provides tracks + management) ────────────────────────
  const library = useLibrary();
  const { tracks, removeTrack } = library;

  // ── Derived: playback track list ──────────────────────────────────
  const playbackTracks = activePlaybackTracks?.length > 0 ? activePlaybackTracks : tracks;

  // playerHookRef needed because playerHook is a hook instance, not store state
  const playerHookRef = useRef(null);

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
        setPlaying(false);
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

  // ── Effects (previously in VPlayer) ───────────────────────────────

  // Set initial volume on mount
  useEffect(() => {
    audio.changeVolume(volume).catch(err =>
      console.error('Failed to set initial volume:', err)
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync duration from audio engine → store
  useEffect(() => { setDuration(audio.duration); }, [audio.duration, setDuration]);

  // Sync progress from audio engine → store + save position + A-B repeat
  useEffect(() => {
    setProgress(audio.progress);
    if (audio.progress > 0 && Math.floor(audio.progress) % 5 === 0) {
      useStore.getState().setLastPosition(audio.progress);
    }

    if (abRepeat?.enabled && abRepeat?.pointA !== null && abRepeat?.pointB !== null) {
      if (audio.progress >= abRepeat.pointB) {
        audio.seek(abRepeat.pointA).catch(err => {
          console.error('Failed to seek for A-B repeat:', err);
        });
      }
    }
  }, [audio.progress, setProgress, abRepeat]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore last-played track on startup
  useEffect(() => {
    if (trackLoading.hasRestoredTrack || !tracks?.length) return;

    if (resumeLastTrack) {
      const savedTrackId = useStore.getState().lastTrackId;
      if (savedTrackId) {
        const trackIndex = tracks.findIndex(t => t.id === savedTrackId);
        if (trackIndex !== -1) {
          setCurrentTrack(trackIndex);
          if (autoPlayOnStartup) {
            setTimeout(() => setPlaying(true), 500);
          }
        }
      }
    }

    trackLoading.setHasRestoredTrack(true);
  }, [tracks, trackLoading, setCurrentTrack, resumeLastTrack, autoPlayOnStartup, setPlaying]);

  // Translate store `playing` intent → actual audio.play() / audio.pause()
  useEffect(() => {
    if (prevPlayingRef.current === null) {
      prevPlayingRef.current = playing;
      return;
    }
    if (prevPlayingRef.current === playing) return;

    const wasPlaying = prevPlayingRef.current;
    prevPlayingRef.current = playing;

    if (playing && !wasPlaying) {
      audio.play().catch(err => {
        console.error('Failed to play:', err);
        toast.showError('Failed to play track');
        setPlaying(false);
      });
    } else if (!playing && wasPlaying) {
      audio.pause().catch(err => {
        console.error('Failed to pause:', err);
        toast.showError('Failed to pause');
      });
    }
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Increment play count when a track starts playing
  useEffect(() => {
    if (playing && currentTrack !== null && tracks?.[currentTrack]) {
      TauriAPI.incrementPlayCount(tracks[currentTrack].id)
        .catch(err => console.warn('Failed to increment play count:', err));
    }
  }, [playing, currentTrack, tracks]);

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
export function usePlayerContext() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayerContext must be used within a <PlayerProvider>');
  }
  return context;
}
