import { useCallback, useRef, useEffect } from 'react';
import { SEEK_THRESHOLD_SECONDS } from '../utils/constants';
import type {
    Track,
    PlayerState,
    AudioService,
    ToastService,
    CrossfadeService,
    StoreState,
    RepeatMode,
    PlayerHookReturn
} from '../types';

interface UsePlayerParams {
    audio: AudioService;
    player: PlayerState;
    tracks: Track[];
    toast: ToastService;
    crossfade?: CrossfadeService;
    store?: StoreState;
}

/**
 * Unified player hook combining playback controls and volume management
 * 
 * Handles:
 * - Track navigation (next/previous)
 * - Seeking within tracks
 * - Volume control (up/down/mute)
 * - Track preloading for seamless transitions
 * - Crossfade support between tracks
 */
export function usePlayer({
    audio,
    player,
    tracks,
    toast,
    crossfade,
    store
}: UsePlayerParams): PlayerHookReturn {
    const {
        currentTrack, setCurrentTrack,
        shuffle,
        repeatMode,
        progress,
        duration,
        volume,
        setVolume
    } = player;

    const nextTrackPreloadedRef = useRef<boolean>(false);
    const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
    const crossfadeStartedRef = useRef<boolean>(false);
    const crossfadeInProgressRef = useRef<boolean>(false);
    const previousVolumeRef = useRef<number>(0.7);
    const userVolumeRef = useRef<number>(volume);
    const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSeekTimeRef = useRef<number>(0);

    // Keep user volume in sync
    useEffect(() => {
        if (!crossfadeInProgressRef.current) {
            userVolumeRef.current = volume;
        }
    }, [volume]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (seekTimeoutRef.current) {
                clearTimeout(seekTimeoutRef.current);
            }
        };
    }, []);

    /**
     * Calculate the next track index based on playback mode
     * Prioritizes queue over shuffle/normal playback
     */
    const getNextTrackIndex = useCallback((
        current: number,
        totalTracks: number,
        isShuffled: boolean,
        repeat: RepeatMode
    ): number | null => {
        console.log('[getNextTrackIndex] shuffle:', isShuffled, 'current:', current, 'total:', totalTracks);

        // Check queue first - queue always takes priority
        if (store && store.queue && store.queue.length > 0) {
            const nextQueueTrack = store.peekNextInQueue();
            if (nextQueueTrack) {
                // Find the track in the tracks array
                const queueTrackIndex = tracks.findIndex(t => t.id === nextQueueTrack.id);
                if (queueTrackIndex !== -1) {
                    store.nextInQueue();
                    console.log('[getNextTrackIndex] Using queue, index:', queueTrackIndex);
                    return queueTrackIndex;
                } else {
                    console.warn('[getNextTrackIndex] Queue track not found in library, skipping:', nextQueueTrack.id);
                    store.nextInQueue();
                    return getNextTrackIndex(current, totalTracks, isShuffled, repeat);
                }
            }
        }

        // No queue or queue exhausted - use normal playback logic
        if (isShuffled) {
            let nextIdx: number;
            do {
                nextIdx = Math.floor(Math.random() * totalTracks);
            } while (nextIdx === current && totalTracks > 1);
            console.log('[getNextTrackIndex] Shuffled to:', nextIdx);
            return nextIdx;
        } else {
            const nextIdx = current + 1;
            if (nextIdx < totalTracks) {
                console.log('[getNextTrackIndex] Sequential to:', nextIdx);
                return nextIdx;
            } else if (repeat === 'all') {
                console.log('[getNextTrackIndex] Repeat all, going to 0');
                return 0;
            }
            console.log('[getNextTrackIndex] No next track');
            return null;
        }
    }, [store, tracks]);

    // Crossfade monitoring effect
    useEffect(() => {
        if (!tracks.length || currentTrack === null || !duration) return;
        if (!crossfade || !crossfade.enabled) return;

        // Check if we should start crossfade
        if (crossfade.shouldCrossfade(progress, duration) && !crossfadeStartedRef.current) {
            const nextIdx = getNextTrackIndex(currentTrack, tracks.length, shuffle, repeatMode);

            if (nextIdx !== null && nextIdx !== currentTrack) {
                crossfadeStartedRef.current = true;
                crossfadeInProgressRef.current = true;
                console.log('[Crossfade] Initiating crossfade to track:', nextIdx);

                crossfade.startCrossfade({
                    setVolume: (vol: number) => {
                        audio.changeVolume(vol).catch(err => console.error('Volume change failed:', err));
                    },
                    currentVolume: userVolumeRef.current,
                    onMidpoint: () => {
                        setCurrentTrack(nextIdx);
                    },
                    onComplete: () => {
                        crossfadeStartedRef.current = false;
                        crossfadeInProgressRef.current = false;
                        nextTrackPreloadedRef.current = false;
                        audio.changeVolume(userVolumeRef.current).catch(err =>
                            console.error('Failed to restore volume:', err)
                        );
                    }
                });
            }
        }

        // Reset crossfade state when near start of track
        if (progress < 1) {
            crossfadeStartedRef.current = false;
        }
    }, [progress, duration, currentTrack, tracks, shuffle, repeatMode, crossfade, setCurrentTrack, audio, getNextTrackIndex]);

    // Pre-load next track for gapless playback (when crossfade disabled)
    useEffect(() => {
        if (!tracks.length || currentTrack === null || !duration) return;
        if (crossfade?.enabled) return;

        const timeRemaining = duration - progress;

        if (timeRemaining <= 5 && timeRemaining > 0 && !nextTrackPreloadedRef.current) {
            const nextIdx = getNextTrackIndex(currentTrack, tracks.length, shuffle, repeatMode);

            if (nextIdx !== null && nextIdx !== currentTrack) {
                const nextTrack = tracks[nextIdx];
                if (nextTrack) {
                    console.log(`[Gapless] Preloading next track: ${nextTrack.title || nextTrack.name}`);
                    nextTrackPreloadedRef.current = true;
                }
            }
        }

        if (progress < 1) {
            nextTrackPreloadedRef.current = false;
        }
    }, [progress, duration, currentTrack, tracks, shuffle, repeatMode, crossfade, getNextTrackIndex]);

    /**
     * Skip to the next track
     * Respects shuffle and repeat modes
     * Cancels any active crossfade
     */
    const handleNextTrack = useCallback(() => {
        if (!tracks.length) return;

        // Cancel any in-progress crossfade
        if (crossfade && crossfadeInProgressRef.current) {
            crossfade.cancelCrossfade((vol: number) => {
                audio.changeVolume(vol).catch(err => console.error('Volume restore failed:', err));
            });
            crossfadeInProgressRef.current = false;
        }

        const nextIdx = getNextTrackIndex(currentTrack ?? 0, tracks.length, shuffle, repeatMode);
        if (nextIdx !== null) {
            setCurrentTrack(nextIdx);
            nextTrackPreloadedRef.current = false;
            crossfadeStartedRef.current = false;
        }
    }, [currentTrack, tracks, shuffle, repeatMode, setCurrentTrack, crossfade, audio, getNextTrackIndex]);

    /**
     * Go to previous track or restart current track
     * If progress > threshold (3s), restarts current track
     * Otherwise goes to previous track
     */
    const handlePrevTrack = useCallback(() => {
        if (!tracks.length) return;

        // Cancel any in-progress crossfade
        if (crossfade && crossfadeInProgressRef.current) {
            crossfade.cancelCrossfade((vol: number) => {
                audio.changeVolume(vol).catch(err => console.error('Volume restore failed:', err));
            });
            crossfadeInProgressRef.current = false;
        }

        if (progress > SEEK_THRESHOLD_SECONDS) {
            audio.seek(0).catch(err => {
                console.error('Failed to seek:', err);
                toast.showError('Failed to seek to beginning');
            });
            return;
        }

        if (shuffle) {
            let prevIdx: number;
            do {
                prevIdx = Math.floor(Math.random() * tracks.length);
            } while (prevIdx === currentTrack && tracks.length > 1);
            setCurrentTrack(prevIdx);
        } else {
            const current = currentTrack ?? 0;
            const prevIdx = current - 1;
            if (prevIdx >= 0) {
                setCurrentTrack(prevIdx);
            } else if (repeatMode === 'all') {
                setCurrentTrack(tracks.length - 1);
            }
        }
        nextTrackPreloadedRef.current = false;
        crossfadeStartedRef.current = false;
    }, [currentTrack, tracks, shuffle, repeatMode, progress, audio, setCurrentTrack, toast, crossfade]);

    /**
     * Seek to a position in the current track
     * @param percent - Position as percentage (0-100)
     */
    const handleSeek = useCallback((percent: number) => {
        if (duration > 0) {
            const time = (percent / 100) * duration;
            const now = Date.now();

            // Clear any pending seek
            if (seekTimeoutRef.current) {
                clearTimeout(seekTimeoutRef.current);
            }

            // Throttle backend seeks to max once per 100ms
            const timeSinceLastSeek = now - lastSeekTimeRef.current;
            const delay = timeSinceLastSeek < 100 ? 100 - timeSinceLastSeek : 0;

            seekTimeoutRef.current = setTimeout(() => {
                lastSeekTimeRef.current = Date.now();
                audio.seek(time).catch(err => {
                    console.error('Failed to seek:', err);
                    toast.showWarning('Seeking may not be supported for this file format');
                });
            }, delay);
        }
    }, [duration, audio, toast]);

    /**
     * Set volume to specific level
     * @param newVolume - Volume level (0-1)
     */
    const handleVolumeChange = useCallback((newVolume: number) => {
        userVolumeRef.current = newVolume;
        setVolume(newVolume);
        audio.changeVolume(newVolume).catch(err => {
            console.error('Failed to change volume:', err);
            toast.showError('Failed to change volume');
        });
    }, [audio, setVolume, toast]);

    /**
     * Increase volume by step
     * @param step - Amount to increase (default 0.05)
     */
    const handleVolumeUp = useCallback((step: number = 0.05) => {
        const newVolume = Math.min(1, userVolumeRef.current + step);
        handleVolumeChange(newVolume);
    }, [handleVolumeChange]);

    /**
     * Decrease volume by step
     * @param step - Amount to decrease (default 0.05)
     */
    const handleVolumeDown = useCallback((step: number = 0.05) => {
        const newVolume = Math.max(0, userVolumeRef.current - step);
        handleVolumeChange(newVolume);
    }, [handleVolumeChange]);

    /**
     * Toggle mute state
     * Mutes to 0, unmutes to previous volume
     */
    const handleToggleMute = useCallback(() => {
        if (volume > 0) {
            previousVolumeRef.current = userVolumeRef.current;
            handleVolumeChange(0);
        } else {
            handleVolumeChange(previousVolumeRef.current || 0.7);
        }
    }, [volume, handleVolumeChange]);

    return {
        handleNextTrack,
        handlePrevTrack,
        handleSeek,
        handleVolumeChange,
        handleVolumeUp,
        handleVolumeDown,
        handleToggleMute
    };
}
