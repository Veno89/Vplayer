import { useState, useCallback } from 'react';
import { TauriAPI } from '../services/TauriAPI';

interface PerformanceStats {
  trackCount: number;
  folderCount: number;
  playlistCount: number;
  totalPlayTime: number;
  avgTrackDuration: number;
  [key: string]: unknown;
}

export interface MaintenanceAPI {
  cacheSize: number;
  dbSize: number;
  perfStats: PerformanceStats | null;
  loadingStats: boolean;
  vacuuming: boolean;
  clearingCache: boolean;
  loadStats: (options?: { includePerf?: boolean }) => Promise<void>;
  vacuumDatabase: () => Promise<void>;
  clearCache: () => Promise<void>;
}

/**
 * Shared hook for database/cache maintenance actions.
 * Used by LibraryStatsWindow and AdvancedTab (options).
 * Eliminates duplicated TauriAPI calls for getCacheSize, getDatabaseSize,
 * vacuumDatabase, and clearAlbumArtCache.
 */
export function useMaintenanceActions(): MaintenanceAPI {
  const [cacheSize, setCacheSize] = useState(0);
  const [dbSize, setDbSize] = useState(0);
  const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [vacuuming, setVacuuming] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const loadStats = useCallback(async ({ includePerf = false } = {}) => {
    setLoadingStats(true);
    try {
      const [cache, db] = await Promise.all([
        TauriAPI.getCacheSize().catch(() => 0),
        TauriAPI.getDatabaseSize().catch(() => 0),
      ]);
      setCacheSize(cache || 0);
      setDbSize(db || 0);

      if (includePerf) {
        try {
          const perf = await TauriAPI.getPerformanceStats();
          setPerfStats(perf);
        } catch {
          setPerfStats(null);
        }
      }
    } catch (err) {
      console.error('Failed to load maintenance stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const vacuumDatabase = useCallback(async () => {
    setVacuuming(true);
    try {
      await TauriAPI.vacuumDatabase();
      await loadStats();
    } catch (err) {
      console.error('Failed to vacuum database:', err);
      throw err;
    } finally {
      setVacuuming(false);
    }
  }, [loadStats]);

  const clearCache = useCallback(async () => {
    setClearingCache(true);
    try {
      await TauriAPI.clearAlbumArtCache();
      await loadStats();
    } catch (err) {
      console.error('Failed to clear cache:', err);
      throw err;
    } finally {
      setClearingCache(false);
    }
  }, [loadStats]);

  return {
    cacheSize,
    dbSize,
    perfStats,
    loadingStats,
    vacuuming,
    clearingCache,
    loadStats,
    vacuumDatabase,
    clearCache,
  };
}
