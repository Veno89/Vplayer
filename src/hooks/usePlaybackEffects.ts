import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { TauriAPI } from '../services/TauriAPI';
import type { AudioService, ToastService, Track } from '../types';

interface PlaybackEffectsParams {
  audio: AudioService;
  toast: ToastService;
  tracks: Track[];
}

/**
 * Encapsulates all side-effects that sync the audio engine with the Zustand
 * store.  Extracted from PlayerProvider to follow Single Responsibility.
 *
 * Responsibilities:
 *  - Set initial volume on mount
 *  - Sync audio.duration → store
 *  - Sync audio.progress → store + save position + A-B repeat looping
 *  - Translate store `playing` intent → audio.play() / audio.pause()
 *  - Increment play count when a track starts playing
 */
export function usePlaybackEffects({ audio, toast, tracks }: PlaybackEffectsParams): void {
  const prevPlayingRef = useRef<boolean | null>(null);

  // Read reactive values from store
  const playing = useStore(s => s.playing);
  const setPlaying = useStore(s => s.setPlaying);
  const setProgress = useStore(s => s.setProgress);
  const setDuration = useStore(s => s.setDuration);
  const currentTrack = useStore(s => s.currentTrack);
  const abRepeat = useStore(s => s.abRepeat);
  const volume = useStore(s => s.volume);

  // ── Set initial volume on mount ───────────────────────────────────
  useEffect(() => {
    audio.changeVolume(volume).catch(err =>
      console.error('Failed to set initial volume:', err),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync duration: audio → store ──────────────────────────────────
  useEffect(() => {
    setDuration(audio.duration);
  }, [audio.duration, setDuration]);

  // ── Sync progress: audio → store + save position + A-B repeat ─────
  useEffect(() => {
    setProgress(audio.progress);

    // Save position every ~5 s
    if (audio.progress > 0 && Math.floor(audio.progress) % 5 === 0) {
      useStore.getState().setLastPosition(audio.progress);
    }

    // A-B repeat loop
    if (abRepeat?.enabled && abRepeat?.pointA !== null && abRepeat?.pointB !== null) {
      if (audio.progress >= abRepeat.pointB) {
        audio.seek(abRepeat.pointA).catch(err => {
          console.error('Failed to seek for A-B repeat:', err);
        });
      }
    }
  }, [audio.progress, setProgress, abRepeat]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Translate store `playing` → audio.play() / audio.pause() ──────
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

  // ── Increment play count ──────────────────────────────────────────
  useEffect(() => {
    if (playing && currentTrack !== null && tracks?.[currentTrack]) {
      TauriAPI.incrementPlayCount(tracks[currentTrack].id)
        .catch(err => console.warn('Failed to increment play count:', err));
    }
  }, [playing, currentTrack, tracks]);
}
