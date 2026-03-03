import { useState, useEffect, useCallback, useRef } from 'react';
import { TauriAPI } from '../services/TauriAPI';
import { AUDIO_RETRY_CONFIG } from '../utils/constants';
import { log } from '../utils/logger';
import { useErrorHandler } from '../services/ErrorHandler';
import { useToast } from './useToast';
import { useStore } from '../store/useStore';
import type { Track, AudioHookParams, AudioService } from '../types';
import type { UnlistenFn } from '@tauri-apps/api/event';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Threshold for considering audio "long idle" – matches Rust LONG_PAUSE_THRESHOLD
const LONG_IDLE_THRESHOLD_SECONDS = 5 * 60; // 5 minutes

// Timeout for backend operations to prevent UI freezing
const BACKEND_TIMEOUT_MS = 5000;

/** Wrap a promise with a timeout. */
const withTimeout = <T>(promise: Promise<T>, ms: number, errorMsg = 'Operation timed out'): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);

/** Playback-tick payload emitted by the Rust broadcast thread. */
interface PlaybackTickPayload {
  position: number;
  duration: number;
  isPlaying: boolean;
  isFinished: boolean;
}

/**
 * Audio playback hook – event-driven.
 *
 * Instead of polling Rust every 100 ms, it listens for `playback-tick` and
 * `track-ended` events emitted by the Rust broadcast thread and writes
 * position / duration directly to the Zustand store (#1 + #4).
 *
 * **Local state** kept here (not in Zustand):
 *  - `isLoading` – transient loading indicator
 *  - `audioBackendError` – error banner state
 *
 * **Zustand store** is the single source of truth for:
 *  - `playing`, `progress`, `duration`, `volume`
 */
export function useAudio({ onEnded, onDeviceLost, onTimeUpdate, initialVolume = 1.0 }: AudioHookParams): AudioService {
  const [isLoading, setIsLoading] = useState(false);
  const [audioBackendError, setAudioBackendError] = useState<string | null>(null);

  // Track if we're currently seeking / recovering / toggling play state to suppress events briefly
  const isSeekingRef = useRef(false);
  const isRecoveringRef = useRef(false);
  const isTogglingRef = useRef(false);

  // Refs for callbacks – avoids stale closures in event listeners
  const onEndedRef = useRef(onEnded);
  const onDeviceLostRef = useRef(onDeviceLost);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onDeviceLostRef.current = onDeviceLost; }, [onDeviceLost]);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  // Error handling
  const toast = useToast();
  const errorHandler = useErrorHandler(toast);

  const currentTrackRef = useRef<Track | null>(null);
  const retryCountRef = useRef(0);

  // ── Store reads (for return value only – components can also read directly) ──
  const storeIsPlaying = useStore(s => s.playing);
  const storeProgress = useStore(s => s.progress);
  const storeDuration = useStore(s => s.duration);
  const storeVolume = useStore(s => s.volume);

  // ── Check audio backend on mount ──────────────────────────────────
  useEffect(() => {
    const checkAudioBackend = async () => {
      try {
        await withTimeout(TauriAPI.isPlaying(), BACKEND_TIMEOUT_MS);
        setAudioBackendError(null);
      } catch (err) {
        setAudioBackendError(`Audio system unavailable: ${err}`);
        errorHandler.handle(err, 'Audio Backend Initialization');
      }
    };
    checkAudioBackend();
  }, []);

  // ── Event listeners: playback-tick + track-ended + device-lost ────
  useEffect(() => {
    let unlistenTick: UnlistenFn | undefined;
    let unlistenEnded: UnlistenFn | undefined;
    let unlistenDeviceLost: UnlistenFn | undefined;
    let unlistenDeviceRecovered: UnlistenFn | undefined;

    const setup = async () => {
      unlistenTick = await TauriAPI.onEvent<PlaybackTickPayload>('playback-tick', (event) => {
        if (isSeekingRef.current || isRecoveringRef.current) return;

        const { position, duration } = event.payload;
        const clamped = duration > 0 ? Math.min(position, duration) : position;

        // Write directly to Zustand – single source of truth
        useStore.getState().setProgress(clamped);
        if (duration > 0) {
          useStore.getState().setDuration(duration);
        }

        if (onTimeUpdateRef.current) {
          onTimeUpdateRef.current(clamped);
        }
      });

      unlistenEnded = await TauriAPI.onEvent<null>('track-ended', () => {
        const state = useStore.getState();
        // Ignore stale track-ended events emitted during pause transitions.
        const looksLikePauseTransition =
          !state.playing
          && state.duration > 0
          && state.progress < state.duration
          && !isTogglingRef.current;

        if (looksLikePauseTransition || isTogglingRef.current) {
          log.warn('[Audio] Ignoring track-ended while not actively playing');
          return;
        }

        // Don't set playing=false here — let the onEnded callback decide.
        // If there's a next track, playing should stay true so useTrackLoading
        // auto-plays it. The onEnded handler in PlayerProvider sets playing=false
        // only when the playlist is truly exhausted (no repeat, last track).
        state.setProgress(0);
        if (onEndedRef.current) onEndedRef.current();
      });

      // Device-lost: the Rust broadcast thread detected the audio device
      // disappeared while playing. Pause the UI and show a recoverable
      // error instead of advancing to the next track (which would also fail).
      unlistenDeviceLost = await TauriAPI.onEvent<null>('device-lost', () => {
        console.warn('[Audio] Device lost during playback');
        if (onDeviceLostRef.current) onDeviceLostRef.current();
        useStore.getState().setPlaying(false);
        setAudioBackendError('Audio device disconnected. Waiting for reconnect...');
        toast.showWarning('Audio device disconnected');
      });

      // Device-recovered: the Rust broadcast thread detected the audio device
      // reappeared and successfully resumed playback. Sync the UI back.
      unlistenDeviceRecovered = await TauriAPI.onEvent<null>('device-recovered', () => {
        log.info('[Audio] Device recovered — playback auto-resumed');
        setAudioBackendError(null);
        useStore.getState().setPlaying(true);
        toast.showSuccess('Audio device reconnected');
      });
    };

    setup();

    return () => {
      unlistenTick?.();
      unlistenEnded?.();
      unlistenDeviceLost?.();
      unlistenDeviceRecovered?.();
    };
  }, []);

  // ── loadTrack ─────────────────────────────────────────────────────
  const loadTrack = useCallback(async (track: Track) => {
    // Self-healing: if we have a stale error from a previous device disconnect,
    // check if a device is available again before giving up.
    if (audioBackendError) {
      try {
        const available = await TauriAPI.isAudioDeviceAvailable();
        if (available) {
          log.info('[Audio] Device reappeared — clearing stale backend error');
          setAudioBackendError(null);
          // Fall through to normal load path
        } else {
          throw new Error('Audio device still unavailable. Please reconnect and try again.');
        }
      } catch (checkErr) {
        throw new Error('Audio system unavailable. Please reconnect your audio device.');
      }
    }

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= AUDIO_RETRY_CONFIG.MAX_RETRIES) {
      try {
        setIsLoading(true);
        // Timeout fix: prevent hanging forever
        await withTimeout(TauriAPI.loadTrack(track.path), BACKEND_TIMEOUT_MS);
        currentTrackRef.current = track;

        // Get real duration from backend and write to store
        // Timeout fix here too
        const realDuration = await withTimeout(TauriAPI.getDuration(), 2000).catch(() => 0);
        const dur = realDuration > 0 ? realDuration : track.duration || 0;
        useStore.getState().setDuration(dur);
        useStore.getState().setProgress(0);

        setIsLoading(false);
        retryCountRef.current = 0;
        return;
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt > AUDIO_RETRY_CONFIG.MAX_RETRIES) {
          setIsLoading(false);
          retryCountRef.current = 0;
          throw new Error(`Failed to load track: ${(err as Error).message || err}`);
        }
        const delay = Math.min(
          AUDIO_RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(AUDIO_RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1),
          AUDIO_RETRY_CONFIG.MAX_DELAY_MS,
        );
        console.warn(`Load attempt ${attempt} failed, retrying in ${delay}ms...`, err);
        await sleep(delay);
      }
    }

    setIsLoading(false);
    throw lastError || new Error('Failed to load track');
  }, [audioBackendError]);

  // ── play ──────────────────────────────────────────────────────────
  const play = useCallback(async () => {
    if (isRecoveringRef.current) return;

    isTogglingRef.current = true;
    try {
      const health = await TauriAPI.getAudioHealth();
      if (!health.device_available) {
        toast.showError('No audio device found. Please connect headphones or speakers.');
        setAudioBackendError('No audio device available');
        return;
      }

      // Self-healing: device is back — clear any previous error so we can proceed.
      if (audioBackendError) {
        log.info('[Audio] Device available again — clearing backend error on play');
        setAudioBackendError(null);
      }

      if (health.device_changed) {
        log.info('Audio device changed, backend will reinitialize...');
        toast.showInfo('Audio device changed, reconnecting...', 2000);
      } else if (health.inactive_duration > LONG_IDLE_THRESHOLD_SECONDS) {
        log.info(`Audio idle for ${Math.round(health.inactive_duration / 60)} min, reinitializing...`);
        toast.showInfo('Resuming playback...', 2000);
      }

      await withTimeout(TauriAPI.play(), BACKEND_TIMEOUT_MS);
      setAudioBackendError(null);
    } catch (err) {
      console.error('Failed to play:', err);
      try {
        isRecoveringRef.current = true;
        toast.showWarning('Reinitializing audio system...');
        const recovered = await TauriAPI.recoverAudio();
        if (recovered) {
          await withTimeout(TauriAPI.play(), BACKEND_TIMEOUT_MS);
          setAudioBackendError(null);
          toast.showSuccess('Audio resumed');
        } else {
          throw new Error('Audio recovery returned false');
        }
      } catch (recoveryErr) {
        console.error('Recovery failed:', recoveryErr);
        setAudioBackendError('Audio system unresponsive. Please restart the application.');
        toast.showError('Audio system error. Please restart the app.');
        useStore.getState().setPlaying(false);
      } finally {
        isRecoveringRef.current = false;
      }
    } finally {
      // Allow a small window for state to settle before syncing with backend again
      setTimeout(() => { isTogglingRef.current = false; }, 500);
    }
  }, [audioBackendError, toast]);

  // ── pause ─────────────────────────────────────────────────────────
  const pause = useCallback(async () => {
    if (audioBackendError) return;

    isTogglingRef.current = true;
    try {
      await withTimeout(TauriAPI.pause(), BACKEND_TIMEOUT_MS);
    } catch (err) {
      console.error('Failed to pause:', err);
      throw err;
    } finally {
      setTimeout(() => { isTogglingRef.current = false; }, 500);
    }
  }, [audioBackendError]);

  // ── stop ──────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (audioBackendError) return;
    try {
      await withTimeout(TauriAPI.stop(), BACKEND_TIMEOUT_MS);
      useStore.getState().setProgress(0);
    } catch (err) {
      console.error('Failed to stop:', err);
      throw err;
    }
  }, [audioBackendError]);

  // ── changeVolume ──────────────────────────────────────────────────
  const changeVolume = useCallback(async (newVolume: number) => {
    if (audioBackendError) {
      errorHandler.logOnly('Cannot change volume – audio backend unavailable', 'Audio Volume');
      return;
    }
    try {
      const clamped = Math.max(0, Math.min(1, newVolume));
      await withTimeout(TauriAPI.setVolume(clamped), 2000, 'Volume change timed out');
      // Volume state lives in the store (set by callers, e.g. usePlayer)
    } catch (err) {
      errorHandler.handle(err, 'Audio Volume');
      // Don't throw here? If volume fails, maybe just log it. 
      // User might spam volume keys. Throwing might be annoying.
      // But keeping original behavior of throwing for now to be safe.
      throw err;
    }
  }, [audioBackendError, errorHandler]);

  // ── seek ──────────────────────────────────────────────────────────
  const seek = useCallback(async (position: number) => {
    if (audioBackendError || isRecoveringRef.current) return;

    isSeekingRef.current = true;
    try {
      await withTimeout(TauriAPI.seekTo(position), 2000, 'Seek timed out');
      useStore.getState().setProgress(position);
    } catch (err) {
      console.error('Failed to seek:', err);
      if (typeof err === 'object' && err !== null && 'message' in err && (err as any).message.includes('timed out')) {
        toast.showWarning('Seek operation timed out');
      } else if (String(err).includes('No file loaded') || String(err).includes('error')) {
        toast.showWarning('Press play to resume playback');
      }
    } finally {
      setTimeout(() => { isSeekingRef.current = false; }, 50);
    }
  }, [audioBackendError, toast]);

  // ── Return AudioService – reads from store ────────────────────────
  return {
    isPlaying: storeIsPlaying,
    isLoading,
    progress: storeProgress,
    duration: storeDuration,
    volume: storeVolume,
    audioBackendError,
    loadTrack,
    play,
    pause,
    stop,
    changeVolume,
    seek,
  };
}
