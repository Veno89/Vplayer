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
export function useAudio({ onEnded, onTimeUpdate, initialVolume = 1.0 }: AudioHookParams): AudioService {
  const [isLoading, setIsLoading] = useState(false);
  const [audioBackendError, setAudioBackendError] = useState<string | null>(null);

  // Track if we're currently seeking / recovering to suppress events briefly
  const isSeekingRef = useRef(false);
  const isRecoveringRef = useRef(false);

  // Refs for callbacks – avoids stale closures in event listeners
  const onEndedRef = useRef(onEnded);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
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
        await TauriAPI.isPlaying();
        setAudioBackendError(null);
      } catch (err) {
        setAudioBackendError(`Audio system unavailable: ${err}`);
        errorHandler.handle(err, 'Audio Backend Initialization');
      }
    };
    checkAudioBackend();
  }, []);

  // ── Event listeners: playback-tick + track-ended ──────────────────
  useEffect(() => {
    let unlistenTick: UnlistenFn | undefined;
    let unlistenEnded: UnlistenFn | undefined;

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
        // Don't set playing=false here — let the onEnded callback decide.
        // If there's a next track, playing should stay true so useTrackLoading
        // auto-plays it. The onEnded handler in PlayerProvider sets playing=false
        // only when the playlist is truly exhausted (no repeat, last track).
        useStore.getState().setProgress(0);
        if (onEndedRef.current) onEndedRef.current();
      });
    };

    setup();

    return () => {
      unlistenTick?.();
      unlistenEnded?.();
    };
  }, []);

  // ── loadTrack ─────────────────────────────────────────────────────
  const loadTrack = useCallback(async (track: Track) => {
    if (audioBackendError) {
      throw new Error('Audio system unavailable. Please restart the application.');
    }

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= AUDIO_RETRY_CONFIG.MAX_RETRIES) {
      try {
        setIsLoading(true);
        await TauriAPI.loadTrack(track.path);
        currentTrackRef.current = track;

        // Get real duration from backend and write to store
        const realDuration = await TauriAPI.getDuration();
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
    if (audioBackendError || isRecoveringRef.current) return;

    try {
      const deviceAvailable = await TauriAPI.isAudioDeviceAvailable();
      if (!deviceAvailable) {
        toast.showError('No audio device found. Please connect headphones or speakers.');
        setAudioBackendError('No audio device available');
        return;
      }

      const deviceChanged = await TauriAPI.hasAudioDeviceChanged();
      const inactiveDuration = await TauriAPI.getInactiveDuration();

      if (deviceChanged) {
        log.info('Audio device changed, backend will reinitialize...');
        toast.showInfo('Audio device changed, reconnecting...', 2000);
      } else if (inactiveDuration > LONG_IDLE_THRESHOLD_SECONDS) {
        log.info(`Audio idle for ${Math.round(inactiveDuration / 60)} min, reinitializing...`);
        toast.showInfo('Resuming playback...', 2000);
      }

      await TauriAPI.play();
      setAudioBackendError(null);
    } catch (err) {
      console.error('Failed to play:', err);
      try {
        isRecoveringRef.current = true;
        toast.showWarning('Reinitializing audio system...');
        const recovered = await TauriAPI.recoverAudio();
        if (recovered) {
          await TauriAPI.play();
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
    }
  }, [audioBackendError, toast]);

  // ── pause ─────────────────────────────────────────────────────────
  const pause = useCallback(async () => {
    if (audioBackendError) return;
    try {
      await TauriAPI.pause();
    } catch (err) {
      console.error('Failed to pause:', err);
      throw err;
    }
  }, [audioBackendError]);

  // ── stop ──────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (audioBackendError) return;
    try {
      await TauriAPI.stop();
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
      await TauriAPI.setVolume(clamped);
      // Volume state lives in the store (set by callers, e.g. usePlayer)
    } catch (err) {
      errorHandler.handle(err, 'Audio Volume');
      throw err;
    }
  }, [audioBackendError, errorHandler]);

  // ── seek ──────────────────────────────────────────────────────────
  const seek = useCallback(async (position: number) => {
    if (audioBackendError || isRecoveringRef.current) return;

    isSeekingRef.current = true;
    try {
      await TauriAPI.seekTo(position);
      useStore.getState().setProgress(position);
    } catch (err) {
      console.error('Failed to seek:', err);
      if (String(err).includes('No file loaded') || String(err).includes('error')) {
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
