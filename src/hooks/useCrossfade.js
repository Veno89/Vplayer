import { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEYS, CROSSFADE_CONFIG } from '../utils/constants';

export function useCrossfade() {
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CROSSFADE_ENABLED);
    return saved ? JSON.parse(saved) : CROSSFADE_CONFIG.DEFAULT_ENABLED;
  });

  const [duration, setDuration] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CROSSFADE_DURATION);
    return saved ? parseInt(saved, 10) : CROSSFADE_CONFIG.DEFAULT_DURATION_MS;
  });

  const fadeTimeoutRef = useRef(null);
  const isFadingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CROSSFADE_ENABLED, JSON.stringify(enabled));
  }, [enabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CROSSFADE_DURATION, duration.toString());
  }, [duration]);

  const toggleEnabled = useCallback(() => {
    setEnabled(prev => !prev);
  }, []);

  const setDurationMs = useCallback((ms) => {
    const clamped = Math.max(
      CROSSFADE_CONFIG.MIN_DURATION_MS,
      Math.min(CROSSFADE_CONFIG.MAX_DURATION_MS, ms)
    );
    setDuration(clamped);
  }, []);

  const shouldCrossfade = useCallback((currentProgress, trackDuration) => {
    if (!enabled || isFadingRef.current) return false;
    const timeRemaining = trackDuration - currentProgress;
    return timeRemaining <= (duration / 1000) && timeRemaining > 0;
  }, [enabled, duration]);

  const startCrossfade = useCallback((onComplete) => {
    if (!enabled || isFadingRef.current) {
      if (onComplete) onComplete();
      return;
    }

    isFadingRef.current = true;

    fadeTimeoutRef.current = setTimeout(() => {
      isFadingRef.current = false;
      if (onComplete) onComplete();
    }, duration);
  }, [enabled, duration]);

  const cancelCrossfade = useCallback(() => {
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    isFadingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
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
    isFading: isFadingRef.current,
  };
}
