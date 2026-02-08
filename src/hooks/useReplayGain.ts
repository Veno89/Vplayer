import { useCallback, useRef } from 'react';
import { TauriAPI } from '../services/TauriAPI';
import { log } from '../utils/logger';
import { useStore } from '../store/useStore';
import type { Track } from '../types';

interface ReplayGainData {
  track_gain: number;
  loudness: number;
}

export interface ReplayGainAPI {
  applyReplayGain: (track: Track) => Promise<boolean>;
  analyzeTrack: (track: Track) => Promise<ReplayGainData | null>;
  clearReplayGain: () => Promise<void>;
  isEnabled: boolean;
  mode: 'off' | 'track' | 'album';
  preamp: number;
}

/**
 * ReplayGain hook for volume normalization
 * 
 * Applies loudness normalization based on EBU R128 analysis.
 * Supports track gain mode (normalize each track) and off mode.
 * Album gain mode is reserved for future implementation.
 */
export function useReplayGain(): ReplayGainAPI {
  const replayGainMode = useStore(state => state.replayGainMode);
  const replayGainPreamp = useStore(state => state.replayGainPreamp);
  const lastAppliedTrackRef = useRef<string | null>(null);

  /**
   * Apply ReplayGain for a track
   * Fetches stored ReplayGain data and applies it to playback
   * 
   * @param {Object} track - Track object with path property
   * @returns {Promise<boolean>} - True if ReplayGain was applied
   */
  const applyReplayGain = useCallback(async (track: Track): Promise<boolean> => {
    if (!track?.path) return false;

    // If ReplayGain is disabled, clear any existing adjustment
    if (replayGainMode === 'off') {
      if (lastAppliedTrackRef.current !== null) {
        await TauriAPI.clearReplayGain();
        lastAppliedTrackRef.current = null;
      }
      return false;
    }

    try {
      // Get stored ReplayGain data
      const rgData = await TauriAPI.getTrackReplayGain(track.path);
      
      if (rgData && rgData.track_gain !== undefined) {
        // Apply the gain with user's preamp setting
        await TauriAPI.setReplayGain(rgData.track_gain, replayGainPreamp);
        lastAppliedTrackRef.current = track.id;
        log.info(`[ReplayGain] Applied ${rgData.track_gain.toFixed(1)}dB + ${replayGainPreamp}dB preamp for: ${track.title || track.name}`);
        return true;
      } else {
        // No ReplayGain data - clear any existing adjustment
        await TauriAPI.clearReplayGain();
        lastAppliedTrackRef.current = null;
        log.info(`[ReplayGain] No data for: ${track.title || track.name}`);
        return false;
      }
    } catch (err) {
      console.error('[ReplayGain] Failed to apply:', err);
      // On error, ensure we don't leave stale gain applied
      try {
        await TauriAPI.clearReplayGain();
      } catch {}
      return false;
    }
  }, [replayGainMode, replayGainPreamp]);

  /**
   * Analyze a track for ReplayGain data
   * This is a CPU-intensive operation
   * 
   * @param {Object} track - Track object with path property
   * @returns {Promise<Object|null>} - ReplayGain data or null on error
   */
  const analyzeTrack = useCallback(async (track: Track): Promise<ReplayGainData | null> => {
    if (!track?.path) return null;

    try {
      log.info(`[ReplayGain] Analyzing: ${track.title || track.name}`);
      const rgData = await TauriAPI.analyzeReplayGain(track.path);
      log.info(`[ReplayGain] Analysis complete: ${rgData.loudness.toFixed(1)} LUFS, gain: ${rgData.track_gain.toFixed(1)}dB`);
      return rgData;
    } catch (err) {
      console.error('[ReplayGain] Analysis failed:', err);
      return null;
    }
  }, []);

  /**
   * Clear ReplayGain adjustment
   */
  const clearReplayGain = useCallback(async () => {
    try {
      await TauriAPI.clearReplayGain();
      lastAppliedTrackRef.current = null;
    } catch (err) {
      console.error('[ReplayGain] Failed to clear:', err);
    }
  }, []);

  return {
    applyReplayGain,
    analyzeTrack,
    clearReplayGain,
    isEnabled: replayGainMode !== 'off',
    mode: replayGainMode,
    preamp: replayGainPreamp,
  };
}
