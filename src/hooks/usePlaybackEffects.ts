import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { TauriAPI } from '../services/TauriAPI';
import type { AudioService, ToastService, Track } from '../types';

interface PlaybackEffectsParams {
  audio: AudioService;
  toast: ToastService;
  tracks: Track[];
}

/**
 * Encapsulates side-effects that sync the audio engine with the Zustand store.
 * Extracted from PlayerProvider to follow Single Responsibility.
 *
 * After #1 + #4, position/duration sync is handled by Rust events in useAudio.
 * This hook now only handles:
 *  - Set initial volume on mount
 *  - Translate store `playing` intent → audio.play() / audio.pause()
 *  - A-B repeat looping
 *  - Save position periodically
 *  - Increment play count when a track starts playing
 */
export function usePlaybackEffects({ audio, toast, tracks }: PlaybackEffectsParams): void {
  const prevPlayingRef = useRef<boolean | null>(null);
  const lastIncrementedTrackIdRef = useRef<string | null>(null);

  // Store selectors
  const playing = useStore(s => s.playing);
  const setPlaying = useStore(s => s.setPlaying);
  const currentTrack = useStore(s => s.currentTrack);
  const abRepeat = useStore(s => s.abRepeat);
  const volume = useStore(s => s.volume);

  // ── Set initial volume on mount ───────────────────────────────────
  // Uses the store volume if already set, otherwise falls back to defaultVolume setting
  useEffect(() => {
    const initialVolume = volume > 0 ? volume : (useStore.getState().defaultVolume / 100);
    audio.changeVolume(initialVolume).catch(err =>
      console.error('Failed to set initial volume:', err),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── A-B repeat looping + periodic position save ───────────────────
  // Uses an interval (1 Hz) instead of reacting to every progress tick (~10 Hz).
  // This avoids 10 React effect runs/sec when only 1/sec of work is needed.
  const abRepeatRef = useRef(abRepeat);
  abRepeatRef.current = abRepeat;

  const positionSaveAndABRepeat = useCallback(() => {
    const state = useStore.getState();
    const currentProgress = state.progress;

    // Save position at most once per second — only if rememberTrackPosition is on
    if (state.rememberTrackPosition && currentProgress > 0) {
      state.setLastPosition(currentProgress);
    }

    // A-B repeat loop
    const ab = abRepeatRef.current;
    if (ab?.enabled && ab?.pointA !== null && ab?.pointB !== null) {
      if (currentProgress >= ab.pointB) {
        audio.seek(ab.pointA).catch(err => {
          console.error('Failed to seek for A-B repeat:', err);
        });
      }
    }
  }, [audio]);

  useEffect(() => {
    const id = setInterval(positionSaveAndABRepeat, 1000);
    return () => clearInterval(id);
  }, [positionSaveAndABRepeat]);

  // ── Translate store `playing` → audio.play() / audio.pause() ──────
  // Supports fadeOnPause: ramp volume smoothly instead of abrupt stop/start
  useEffect(() => {
    if (prevPlayingRef.current === null) {
      prevPlayingRef.current = playing;
      return;
    }
    if (prevPlayingRef.current === playing) return;

    const wasPlaying = prevPlayingRef.current;
    prevPlayingRef.current = playing;

    const { fadeOnPause: shouldFade, fadeDuration: duration } = useStore.getState();
    const currentVolume = useStore.getState().volume;

    if (playing && !wasPlaying) {
      if (shouldFade && duration > 0) {
        // Fade in: set volume to 0, play, then ramp up
        audio.changeVolume(0).then(() =>
          audio.play().then(() => {
            const steps = 10;
            const stepTime = duration / steps;
            let step = 0;
            const interval = setInterval(() => {
              step++;
              const vol = currentVolume * (step / steps);
              audio.changeVolume(vol).catch(() => {});
              if (step >= steps) clearInterval(interval);
            }, stepTime);
          })
        ).catch(err => {
          console.error('Failed to play with fade:', err);
          toast.showError('Failed to play track');
          setPlaying(false);
        });
      } else {
        audio.play().catch(err => {
          console.error('Failed to play:', err);
          toast.showError('Failed to play track');
          setPlaying(false);
        });
      }
    } else if (!playing && wasPlaying) {
      if (shouldFade && duration > 0) {
        // Fade out: ramp volume down, then pause, then restore volume
        const steps = 10;
        const stepTime = duration / steps;
        let step = 0;
        const interval = setInterval(() => {
          step++;
          const vol = currentVolume * (1 - step / steps);
          audio.changeVolume(Math.max(0, vol)).catch(() => {});
          if (step >= steps) {
            clearInterval(interval);
            audio.pause().then(() => {
              // Restore volume so next play starts at correct level
              audio.changeVolume(currentVolume).catch(() => {});
            }).catch(err => {
              console.error('Failed to pause:', err);
              toast.showError('Failed to pause');
              setPlaying(true);
            });
          }
        }, stepTime);
      } else {
        audio.pause().catch(err => {
          console.error('Failed to pause:', err);
          toast.showError('Failed to pause');
          setPlaying(true);
        });
      }
    }
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Increment play count + track change notification ────────────────
  useEffect(() => {
    if (playing && currentTrack !== null && tracks?.[currentTrack]) {
      const trackId = tracks[currentTrack].id;
      // Skip if we already incremented for this track (prevents double-increment
      // when the tracks array identity changes, e.g., during a library refresh)
      if (lastIncrementedTrackIdRef.current === trackId) return;
      lastIncrementedTrackIdRef.current = trackId;
      TauriAPI.incrementPlayCount(trackId)
        .catch(err => console.warn('Failed to increment play count:', err));

      // Show in-app toast notification for track change if enabled
      const { trackChangeNotification } = useStore.getState();
      if (trackChangeNotification) {
        const track = tracks[currentTrack];
        const title = track.title || track.name || 'Unknown';
        const artist = track.artist || 'Unknown Artist';
        toast.showInfo(`Now playing: ${title} — ${artist}`);
      }
    }
  }, [playing, currentTrack, tracks]);
}
