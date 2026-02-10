import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

/**
 * Sleep timer hook.
 *
 * When `sleepTimerMinutes` > 0, starts a countdown. When it hits zero,
 * pauses playback and resets the timer setting to 0.
 *
 * The countdown is driven by a 1-second interval. The remaining time
 * is tracked via a ref so the interval doesn't re-create on every tick.
 *
 * Mount this once in VPlayer.tsx.
 */
export function useSleepTimer(): void {
  const sleepTimerMinutes = useStore(s => s.sleepTimerMinutes);
  const setSleepTimerMinutes = useStore(s => s.setSleepTimerMinutes);
  const setPlaying = useStore(s => s.setPlaying);

  const remainingRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When the user sets a new timer value, (re)start the countdown
  useEffect(() => {
    // Clear any existing timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (sleepTimerMinutes <= 0) {
      remainingRef.current = 0;
      return;
    }

    remainingRef.current = sleepTimerMinutes * 60; // convert to seconds

    intervalRef.current = setInterval(() => {
      remainingRef.current -= 1;

      if (remainingRef.current <= 0) {
        // Time's up — pause playback and reset timer
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        // Read fresh state to check if actually playing
        const state = useStore.getState();
        if (state.playing) {
          state.setPlaying(false);
        }
        state.setSleepTimerMinutes(0);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sleepTimerMinutes, setSleepTimerMinutes, setPlaying]);
}
