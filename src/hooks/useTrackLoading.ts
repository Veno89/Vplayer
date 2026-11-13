import { useState, useEffect, useRef, useCallback } from 'react';
import { useReplayGain } from './useReplayGain';
import { useStore } from '../store/useStore';
import { devCounters } from '../utils/devCounters';
import type { Track, AudioService, ToastService } from '../types';

export const MAX_CONSECUTIVE_LOAD_FAILURES = 5;

export function describeLoadFailure(err: unknown): string {
  const message = String((err as Error)?.message ?? err);
  if (/audio (system|device)|no audio device/i.test(message)) return 'Audio output unavailable. Reconnect your headphones or speakers, then retry.';
  if (/not found|no such file|cannot find|failed to open|\bio error\b/i.test(message)) return 'Music file not found or not readable. Reconnect the music drive or check the file location, then retry.';
  if (/decode error|corrupted|unsupported format/i.test(message)) return 'Unsupported or damaged file.';
  if (/permission denied/i.test(message)) return 'No permission to read the file.';
  if (/timed out/i.test(message)) return 'Opening the track timed out. Check the music drive, then retry.';
  return 'The track could not be loaded. Try again or choose another track.';
}

export interface TrackLoadingParams {
  audio: AudioService;
  tracks: Track[];
  currentTrack: number | null;
  playing: boolean;
  setLoadingTrackIndex: (i: number | null) => void;
  progress: number;
  toast: ToastService;
  removeTrack: (id: string) => Promise<void>;
  setCurrentTrack: (i: number | null) => void;
  handleNextTrack: () => void;
}

export interface TrackLoadingReturn {
  loadedTrackId: string | null;
  trackLoadError: string | null;
  retryCurrentTrack: () => void;
  hasRestoredTrack: boolean;
  setHasRestoredTrack: (v: boolean) => void;
}

export function useTrackLoading(params: TrackLoadingParams): TrackLoadingReturn {
  const { tracks, currentTrack } = params;
  const selectedId = useStore(s => s.currentTrackId) ?? tracks[currentTrack ?? -1]?.id ?? null;
  const [loadedTrackId, setLoadedTrackId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const [hasRestoredTrack, setHasRestoredTrack] = useState(false);
  const loadedRef = useRef<string | null>(null);
  const shouldRestorePosition = useRef(true);
  const retryIntent = useRef<{ id: string; position: number } | null>(null);
  const consecutiveFailures = useRef(0);
  const replayGain = useReplayGain();
  const latest = useRef({ ...params, replayGain });
  latest.current = { ...params, replayGain };

  const retryCurrentTrack = useCallback(() => {
    const state = useStore.getState();
    const track = state.activePlaybackTracks[state.currentTrack ?? -1];
    if (!track) return;
    retryIntent.current = { id: track.id, position: state.progress };
    loadedRef.current = null;
    consecutiveFailures.current = 0;
    setRetryRevision(value => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const { audio, toast, setLoadingTrackIndex, handleNextTrack } = latest.current;
    const state = useStore.getState();
    const source = state.activePlaybackTracks?.length ? state.activePlaybackTracks : tracks;
    const track = source.find(item => item.id === selectedId);
    if (!track) {
      loadedRef.current = null;
      setLoadedTrackId(null);
      setFailure(null);
      setLoadingTrackIndex(null);
      return;
    }
    if (loadedRef.current === track.id) return;
    const isCurrent = () => {
      const fresh = useStore.getState();
      const freshTracks = fresh.activePlaybackTracks?.length ? fresh.activePlaybackTracks : latest.current.tracks;
      return !cancelled && freshTracks[fresh.currentTrack ?? -1]?.id === track.id;
    };
    const retry = retryIntent.current?.id === track.id ? retryIntent.current : null;
    retryIntent.current = null;
    const savedPosition = retry?.position ?? (shouldRestorePosition.current && state.lastTrackId === track.id ? state.lastPosition : 0);
    loadedRef.current = null;
    setLoadedTrackId(null);
    setFailure(null);
    setLoadingTrackIndex(state.currentTrack);
    state.setLastTrackId(track.id);
    devCounters.setAudioValue('pendingPlaybackStartTime', Date.now());

    const load = async () => {
      try {
        if (!track.path) throw new Error('File not found: invalid file path');
        // Rust atomically matches the preload and rejects superseded loads.
        await audio.loadTrack(track);
        if (!isCurrent()) {
          devCounters.incAudio('stalePlaybackRequestsIgnored');
          return;
        }
        await latest.current.replayGain.applyReplayGain(track).catch(error => console.warn('ReplayGain unavailable:', error));
        if (!isCurrent()) return;
        const duration = useStore.getState().duration || track.duration;
        if (savedPosition > 0 && savedPosition < duration) await audio.seek(savedPosition);
        if (!isCurrent()) return;
        shouldRestorePosition.current = false;
        consecutiveFailures.current = 0;
        loadedRef.current = track.id;
        setLoadedTrackId(track.id);
        setLoadingTrackIndex(null);
        if (retry && !useStore.getState().playing) {
          useStore.getState().setPlaying(true);
        } else if (useStore.getState().playing ?? latest.current.playing) {
          await audio.play();
        }
      } catch (error) {
        if (!isCurrent() || String(error).includes('Stale load request')) return;
        loadedRef.current = null;
        setLoadedTrackId(null);
        setLoadingTrackIndex(null);
        const reason = describeLoadFailure(error);
        setFailure({ id: track.id, message: reason });
        const title = track.title || track.name;
        consecutiveFailures.current++;
        const playing = useStore.getState().playing;
        if (!playing || retry || /audio (system|device)|no audio device/i.test(String(error))) {
          if (playing) useStore.getState().setPlaying(false);
          toast.showError(`Couldn't load "${title}": ${reason}`);
          return;
        }
        if (consecutiveFailures.current >= Math.min(MAX_CONSECUTIVE_LOAD_FAILURES, Math.max(1, source.length))) {
          consecutiveFailures.current = 0;
          useStore.getState().setPlaying(false);
          toast.showError(`Couldn't play "${title}". Several tracks in a row failed, so playback stopped.`);
          return;
        }
        toast.showWarning(`Couldn't play "${title}" (${reason}) Skipping to the next track.`, 4000);
        handleNextTrack();
        if (isCurrent()) useStore.getState().setPlaying(false);
      }
    };
    void load();
    return () => { cancelled = true; };
    // Identity changes even when a source switch keeps the same row number.
  }, [selectedId, retryRevision]);

  return {
    loadedTrackId,
    trackLoadError: failure?.id === selectedId ? failure.message : null,
    retryCurrentTrack,
    hasRestoredTrack,
    setHasRestoredTrack,
  };
}
