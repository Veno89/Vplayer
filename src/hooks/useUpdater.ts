import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body: string | null;
  date: string | null;
}

export interface UpdaterAPI {
  updateAvailable: boolean;
  updateInfo: UpdateInfo | null;
  downloading: boolean;
  downloadProgress: number;
  checking: boolean;
  error: string | null;
  checkForUpdates: (silent?: boolean) => Promise<boolean>;
  downloadAndInstall: () => Promise<void>;
  dismissUpdate: () => void;
}

export function useUpdater(): UpdaterAPI {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const checkForUpdates = useCallback(async (silent = false): Promise<boolean> => {
    try {
      setChecking(true);
      setError(null);

      const update = await check();

      // Debug logging
      console.log('[useUpdater] check() result:', update);
      console.log('[useUpdater] update available:', !!update);
      if (update) {
        console.log('[useUpdater] new version:', update.version);
        console.log('[useUpdater] current version:', update.currentVersion);
      }

      if (update) {
        setUpdateAvailable(true);
        setUpdateInfo({
          version: update.version,
          currentVersion: update.currentVersion,
          body: update.body,
          date: update.date,
        });
        return true;
      } else {
        setUpdateAvailable(false);
        setUpdateInfo(null);
        return false;
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      // Only show error if it's not a network/remote configuration issue
      const errorMessage = err.message || 'Failed to check for updates';
      if (!silent) {
        setError(errorMessage);
      }
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async (): Promise<void> => {
    try {
      setDownloading(true);
      setError(null);
      setDownloadProgress(0);

      const update = await check();

      if (!update) {
        throw new Error('No update available');
      }

      // Download with progress tracking
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setDownloadProgress(0);
            break;
          case 'Progress':
            const progress = event.data.chunkLength / event.data.contentLength * 100;
            setDownloadProgress(Math.round(progress));
            break;
          case 'Finished':
            setDownloadProgress(100);
            break;
        }
      });

      // Prompt to restart
      await relaunch();
    } catch (err) {
      console.error('Failed to download/install update:', err);
      setError(err.message || 'Failed to install update');
      setDownloading(false);
    }
  }, []);

  const dismissUpdate = useCallback((): void => {
    setUpdateAvailable(false);
    setUpdateInfo(null);
  }, []);

  // Check for updates on mount (silently)
  useEffect(() => {
    // Delay initial check to not slow down app startup
    const timer = setTimeout(() => {
      checkForUpdates(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  return {
    updateAvailable,
    updateInfo,
    downloading,
    downloadProgress,
    checking,
    error,
    checkForUpdates,
    downloadAndInstall,
    dismissUpdate,
  };
}
