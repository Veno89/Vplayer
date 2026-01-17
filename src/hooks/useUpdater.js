import { useState, useEffect, useCallback } from 'react';

// Conditional imports for updater functionality
let check, relaunch;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const updater = require('@tauri-apps/plugin-updater');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const process = require('@tauri-apps/plugin-process');
  check = updater.check;
  relaunch = process.relaunch;
} catch (e) {
  // Updater not available, functions will remain undefined
  console.warn('Updater plugin not available, updates disabled');
  check = null;
  relaunch = null;
}

/**
 * Hook for managing app updates
 * 
 * @returns {Object} Update state and controls
 */
export function useUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  const checkForUpdates = useCallback(async (silent = false) => {
    try {
      setChecking(true);
      setError(null);

      // Check if updater is available
      if (!check) {
        if (!silent) {
          console.info('Update checking disabled - updater plugin not available');
        }
        return false;
      }

      const update = await check();

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
      if (!silent && !errorMessage.includes('Could not fetch a valid release JSON')) {
        setError(errorMessage);
      }
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    try {
      setDownloading(true);
      setError(null);
      setDownloadProgress(0);

      // Check if updater is available
      if (!check || !relaunch) {
        throw new Error('Updater not available');
      }

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

  const dismissUpdate = useCallback(() => {
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
