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

export interface FadeInParams {
  setVolume: (vol: number) => void;
  targetVolume: number;
  onComplete?: () => void;
}

export interface CrossfadeAPI {
  enabled: boolean;
  duration: number;
  toggleEnabled: () => void;
  setDuration: (ms: number) => void;
  shouldCrossfade: (currentProgress: number, trackDuration: number) => boolean;
  startCrossfade: (params: CrossfadeParams) => void;
  startFadeIn: (params: FadeInParams) => (() => void) | undefined;
  cancelCrossfade: (setVolume: (vol: number) => void) => void;
  getFadeOutMultiplier: (elapsedMs: number) => number;
  getFadeInMultiplier: (elapsedMs: number) => number;
  readonly isFading: boolean;
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
   * Calculate the fade-in volume multiplier for the next track
   * Inverse of fade-out for smooth crossover
   */
  const getFadeInMultiplier = useCallback((elapsedMs: number): number => {
    const progress = Math.min(1, elapsedMs / duration);
    // Use ease-in curve: starts slow, speeds up
    return Math.sin(progress * Math.PI * 0.5);
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
    originalVolumeRef.current = currentVolume;
    fadeStartTimeRef.current = Date.now();

    let midpointCalled = false;
    const FADE_INTERVAL_MS = 50; // Update volume every 50ms for smooth fade

    // Volume fade animation
    const fadeCallback = () => {
      const elapsed = Date.now() - (fadeStartTimeRef.current ?? Date.now());
      const fadeMultiplier = getFadeOutMultiplier(elapsed);
      
      // Apply faded volume
      const newVolume = originalVolumeRef.current * fadeMultiplier;
      setVolume(newVolume);

      // Call midpoint when we're halfway through (for track switch)
      if (!midpointCalled && elapsed >= duration * 0.5) {
        midpointCalled = true;
        log.info('[Crossfade] Midpoint reached, switching tracks');
        if (onMidpoint) onMidpoint();
      }
    };
    fadeIntervalRef.current = window.setInterval(fadeCallback, FADE_INTERVAL_MS);

    // Complete the fade after duration
    fadeTimeoutRef.current = window.setTimeout(() => {
      log.info('[Crossfade] Fade complete');
      if (fadeIntervalRef.current !== null) clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
      isFadingRef.current = false;
      
      // Restore original volume
      setVolume(originalVolumeRef.current);
      
      if (onComplete) onComplete();
    }, duration);
  }, [enabled, duration, getFadeOutMultiplier]);

  /**
   * Start fade-in for the new track (called after track switch)
   * 
   * @param {Object} params - Fade-in parameters
   * @param {Function} params.setVolume - Function to set audio volume
   * @param {number} params.targetVolume - Target volume to reach
   * @param {Function} params.onComplete - Called when fade-in completes
   */
  const startFadeIn = useCallback(({ setVolume, targetVolume, onComplete }: FadeInParams): (() => void) | undefined => {
    if (!enabled) {
      setVolume(targetVolume);
      if (onComplete) onComplete();
      return;
    }

    log.info('[Crossfade] Starting fade-in to volume:', targetVolume);
    const startTime = Date.now();
    const fadeInDuration = duration * 0.5; // Fade in takes half the duration
    const FADE_INTERVAL_MS = 50;

    // Start at 0 volume
    setVolume(0);

    const fadeInInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / fadeInDuration);
      const fadeMultiplier = Math.sin(progress * Math.PI * 0.5); // Ease-in
      
      setVolume(targetVolume * fadeMultiplier);

      if (progress >= 1) {
        clearInterval(fadeInInterval);
        setVolume(targetVolume);
        log.info('[Crossfade] Fade-in complete');
        if (onComplete) onComplete();
      }
    }, FADE_INTERVAL_MS);

    return () => clearInterval(fadeInInterval);
  }, [enabled, duration]);

  /**
   * Cancel any active crossfade and restore volume
   */
  const cancelCrossfade = useCallback((setVolume: (vol: number) => void) => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
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
        clearInterval(fadeIntervalRef.current);
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
    startFadeIn,
    cancelCrossfade,
    getFadeOutMultiplier,
    getFadeInMultiplier,
    get isFading() { return isFadingRef.current; },
  };
}
