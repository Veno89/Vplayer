import { useCallback, useRef } from 'react';
import { TauriAPI } from '../services/TauriAPI';
import { log } from '../utils/logger';
import { useStore } from '../store/useStore';
import type { Track } from '../types';

interface ReplayGainData {
  track_gain: number;
  track_peak: number;
  loudness: number;
}

interface AlbumGainData {
  gain: number;
  tracksAnalyzed: number;
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
 * Supports track gain mode (normalize each track), album gain mode
 * (shared gain computed from tracks with the same artist+album in the
 * active playback set), and off mode.
 */
export function useReplayGain(): ReplayGainAPI {
  const replayGainMode = useStore(state => state.replayGainMode);
  const replayGainPreamp = useStore(state => state.replayGainPreamp);
  const activePlaybackTracks = useStore(state => state.activePlaybackTracks);
  const lastAppliedTrackRef = useRef<string | null>(null);
  const albumGainCacheRef = useRef<Map<string, AlbumGainData>>(new Map());

  const getAlbumKey = useCallback((track: Track): string | null => {
    const artist = (track.artist || '').trim().toLowerCase();
    const album = (track.album || '').trim().toLowerCase();
    if (!artist || !album) return null;
    return `${artist}::${album}`;
  }, []);

  const getAlbumGain = useCallback(async (track: Track): Promise<AlbumGainData | null> => {
    const albumKey = getAlbumKey(track);
    if (!albumKey) return null;

    const cached = albumGainCacheRef.current.get(albumKey);
    if (cached) return cached;

    const artist = (track.artist || '').trim();
    const album = (track.album || '').trim();
    if (!artist || !album) return null;

    // Prefer persisted backend album ReplayGain cache.
    let albumRg = await TauriAPI.getAlbumReplayGain(artist, album);
    if (!albumRg) {
      // Derive from existing track ReplayGain rows and cache in backend.
      albumRg = await TauriAPI.analyzeAlbumReplayGain(artist, album);
    }

    if (!albumRg || typeof albumRg.album_gain !== 'number') {
      return null;
    }

    const albumGain = {
      gain: albumRg.album_gain,
      tracksAnalyzed: albumRg.track_count,
    };

    albumGainCacheRef.current.set(albumKey, albumGain);
    return albumGain;
  }, [getAlbumKey]);

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
      // Album mode: compute shared album gain for tracks with same artist+album.
      if (replayGainMode === 'album') {
        const albumGain = await getAlbumGain(track);
        if (albumGain) {
          await TauriAPI.setReplayGain(albumGain.gain, replayGainPreamp);
          lastAppliedTrackRef.current = track.id;
          log.info(
            `[ReplayGain] Applied album gain ${albumGain.gain.toFixed(1)}dB + ${replayGainPreamp}dB preamp ` +
            `(${albumGain.tracksAnalyzed} tracks) for: ${track.album || 'Unknown Album'}`
          );
          return true;
        }

        // Fall back to track mode behavior if album metadata/data is incomplete.
        log.info('[ReplayGain] Album gain unavailable, falling back to track gain');
      }

      // Track mode (or album fallback): use per-track ReplayGain.
      const rgData = await TauriAPI.getTrackReplayGain(track.path);

      if (rgData && rgData.track_gain !== undefined) {
        await TauriAPI.setReplayGain(rgData.track_gain, replayGainPreamp);
        lastAppliedTrackRef.current = track.id;
        log.info(`[ReplayGain] Applied ${rgData.track_gain.toFixed(1)}dB + ${replayGainPreamp}dB preamp for: ${track.title || track.name}`);
        return true;
      }

      // No ReplayGain data - clear any existing adjustment
      await TauriAPI.clearReplayGain();
      lastAppliedTrackRef.current = null;
      log.info(`[ReplayGain] No data for: ${track.title || track.name}`);
      return false;
    } catch (err) {
      console.error('[ReplayGain] Failed to apply:', err);
      // On error, ensure we don't leave stale gain applied
      try {
        await TauriAPI.clearReplayGain();
      } catch {}
      return false;
    }
  }, [getAlbumGain, replayGainMode, replayGainPreamp]);

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
      albumGainCacheRef.current.clear();
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
