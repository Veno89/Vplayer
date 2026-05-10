import { useEffect, useCallback, useRef } from 'react';
import { CROSSFADE_CONFIG } from '../utils/constants';
import { log } from '../utils/logger';
import { useStore } from '../store/useStore';

export interface CrossfadeParams {
  setVolume: (vol: number) => void;
  currentVolume: number;
  onMidpoint: () => void;
  onComplete: () => void;
}

export interface CrossfadeAPI {
  enabled: boolean;
  duration: number;
  toggleEnabled: () => void;
  setDuration: (ms: number) => void;
  shouldCrossfade: (currentProgress: number, trackDuration: number) => boolean;
  startCrossfade: (params: CrossfadeParams) => void;
  cancelCrossfade: (setVolume: (vol: number) => void) => void;
  readonly isFading: boolean;
  /** True after the midpoint callback has fired (track switch already triggered). */
  readonly midpointReached: boolean;
}

/**
 * Crossfade hook for smooth transitions between tracks
 * 
 * Implements volume-based crossfading by gradually reducing the volume
 * of the current track while the next track starts at increasing volume.
 * 
 * @returns {Object} Crossfade control interface
 */
export function useCrossfade(): CrossfadeAPI {
  // Read/write directly from Zustand store (persisted) — no local useState copy
  const enabled = useStore(state => state.crossfadeEnabled);
  const duration = useStore(state => state.crossfadeDuration);
  const setStoredEnabled = useStore(state => state.setCrossfadeEnabled);
  const setStoredDuration = useStore(state => state.setCrossfadeDuration);

  const fadeIntervalRef = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const isFadingRef = useRef<boolean>(false);
  const midpointReachedRef = useRef<boolean>(false);
  const originalVolumeRef = useRef<number>(1.0);
  const fadeStartTimeRef = useRef<number | null>(null);

  const toggleEnabled = useCallback(() => {
    setStoredEnabled(!enabled);
  }, [enabled, setStoredEnabled]);

  const setDurationMs = useCallback((ms: number) => {
    const clamped = Math.max(
      CROSSFADE_CONFIG.MIN_DURATION_MS,
      Math.min(CROSSFADE_CONFIG.MAX_DURATION_MS, ms)
    );
    setStoredDuration(clamped);
  }, [setStoredDuration]);

  /**
   * Check if crossfade should start based on current progress
   * Returns true when we're within the crossfade duration of the end
   */
  const shouldCrossfade = useCallback((currentProgress: number, trackDuration: number) => {
    if (!enabled || isFadingRef.current || trackDuration <= 0) return false;
    const timeRemaining = trackDuration - currentProgress;
    const crossfadeSecs = duration / 1000;
    // Start crossfade when remaining time equals crossfade duration
    return timeRemaining <= crossfadeSecs && timeRemaining > 0.1;
  }, [enabled, duration]);

  /**
   * Calculate the fade-out volume multiplier based on elapsed time
   * Uses smooth easing curve for natural sounding fade
   */
  const getFadeOutMultiplier = useCallback((elapsedMs: number): number => {
    const progress = Math.min(1, elapsedMs / duration);
    // Use ease-out curve: starts fast, slows down at end
    // This sounds more natural as volume drops quickly at first
    return Math.cos(progress * Math.PI * 0.5);
  }, [duration]);

  /**
   * Start the crossfade transition
   * 
   * @param {Object} params - Crossfade parameters
   * @param {Function} params.setVolume - Function to set audio volume
   * @param {number} params.currentVolume - Current volume level (0-1)
   * @param {Function} params.onMidpoint - Called at 50% through fade (time to switch tracks)
   * @param {Function} params.onComplete - Called when fade completes
   */
  const startCrossfade = useCallback(({ setVolume, currentVolume, onMidpoint, onComplete }: CrossfadeParams) => {
    if (!enabled || isFadingRef.current) {
      // If disabled, just call complete immediately
      if (onComplete) onComplete();
      return;
    }

    log.info('[Crossfade] Starting crossfade, duration:', duration, 'ms');
    isFadingRef.current = true;
    midpointReachedRef.current = false;
    originalVolumeRef.current = currentVolume;
    fadeStartTimeRef.current = Date.now();

    let midpointCalled = false;
    const halfDuration = duration * 0.5;

    // Use requestAnimationFrame instead of setInterval so the volume curve
    // updates are synchronised with the display refresh and are not throttled
    // by a busy main thread (which setInterval is subject to in WebView2).
    // The elapsed-time calculation uses Date.now() so timing accuracy is
    // preserved even when individual frames are dropped.
    const fadeStep = () => {
      const elapsed = Date.now() - (fadeStartTimeRef.current ?? Date.now());

      if (elapsed >= duration) {
        // Fade complete — restore volume and clean up.
        log.info('[Crossfade] Fade complete');
        fadeIntervalRef.current = null;
        isFadingRef.current = false;
        midpointReachedRef.current = false;
        setVolume(originalVolumeRef.current);
        if (onComplete) onComplete();
        return;
      }

      if (!midpointCalled && elapsed >= halfDuration) {
        midpointCalled = true;
        midpointReachedRef.current = true;
        log.info('[Crossfade] Midpoint reached, switching tracks');
        if (onMidpoint) onMidpoint();
      }

      let newVolume: number;
      if (midpointCalled) {
        // After midpoint: fade the NEW track back up to full volume
        const fadeInProgress = Math.min(1, (elapsed - halfDuration) / halfDuration);
        const midpointMultiplier = getFadeOutMultiplier(halfDuration);
        newVolume = originalVolumeRef.current * (midpointMultiplier + (1 - midpointMultiplier) * Math.sin(fadeInProgress * Math.PI * 0.5));
      } else {
        // Before midpoint: fade the OLD track's volume down
        newVolume = originalVolumeRef.current * getFadeOutMultiplier(elapsed);
      }
      setVolume(newVolume);

      // Schedule the next frame
      fadeIntervalRef.current = requestAnimationFrame(fadeStep);
    };

    fadeIntervalRef.current = requestAnimationFrame(fadeStep);
  }, [enabled, duration, getFadeOutMultiplier]);

  /**
   * Cancel any active crossfade and restore volume
   */
  const cancelCrossfade = useCallback((setVolume: (vol: number) => void) => {
    if (fadeIntervalRef.current) {
      cancelAnimationFrame(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    
    // Restore original volume if we were fading
    if (isFadingRef.current && setVolume && originalVolumeRef.current) {
      setVolume(originalVolumeRef.current);
    }
    
    isFadingRef.current = false;
    log.info('[Crossfade] Cancelled');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current) {
        cancelAnimationFrame(fadeIntervalRef.current);
      }
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, []);

  return {
    enabled,
    duration,
    toggleEnabled,
    setDuration: setDurationMs,
    shouldCrossfade,
    startCrossfade,
    cancelCrossfade,
    get isFading() { return isFadingRef.current; },
    get midpointReached() { return midpointReachedRef.current; },
  };
}
