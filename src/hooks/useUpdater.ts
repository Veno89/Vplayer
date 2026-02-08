import { create } from 'zustand';
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
  _initialized: boolean;
  checkForUpdates: (silent?: boolean) => Promise<boolean>;
  downloadAndInstall: () => Promise<void>;
  dismissUpdate: () => void;
}

/**
 * Global updater store — singleton.
 * Replaces the old pattern of `window.updater = useUpdater()`.
 * Any component can call `useUpdater()` to get the same shared state.
 */
const useUpdaterStore = create<UpdaterAPI>((set, get) => ({
  updateAvailable: false,
  updateInfo: null,
  downloading: false,
  downloadProgress: 0,
  checking: false,
  error: null,
  _initialized: false,

  checkForUpdates: async (silent = false): Promise<boolean> => {
    try {
      set({ checking: true, error: null });

      const update = await check();

      console.log('[useUpdater] check() result:', update);
      console.log('[useUpdater] update available:', !!update);
      if (update) {
        console.log('[useUpdater] new version:', update.version);
        console.log('[useUpdater] current version:', update.currentVersion);
      }

      if (update) {
        set({
          updateAvailable: true,
          updateInfo: {
            version: update.version,
            currentVersion: update.currentVersion,
            body: update.body,
            date: update.date,
          },
        });
        return true;
      } else {
        set({ updateAvailable: false, updateInfo: null });
        return false;
      }
    } catch (err: any) {
      console.error('Failed to check for updates:', err);
      const errorMessage = err.message || 'Failed to check for updates';
      if (!silent) {
        set({ error: errorMessage });
      }
      return false;
    } finally {
      set({ checking: false });
    }
  },

  downloadAndInstall: async (): Promise<void> => {
    try {
      set({ downloading: true, error: null, downloadProgress: 0 });

      const update = await check();
      if (!update) throw new Error('No update available');

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            set({ downloadProgress: 0 });
            break;
          case 'Progress':
            const progress = event.data.chunkLength / event.data.contentLength * 100;
            set({ downloadProgress: Math.round(progress) });
            break;
          case 'Finished':
            set({ downloadProgress: 100 });
            break;
        }
      });

      await relaunch();
    } catch (err: any) {
      console.error('Failed to download/install update:', err);
      set({ error: err.message || 'Failed to install update', downloading: false });
    }
  },

  dismissUpdate: () => {
    set({ updateAvailable: false, updateInfo: null });
  },
}));

// Kick off the initial silent update check once (on first import)
setTimeout(() => {
  const store = useUpdaterStore.getState();
  if (!store._initialized) {
    useUpdaterStore.setState({ _initialized: true });
    store.checkForUpdates(true);
  }
}, 5000);

/**
 * Hook returning the global updater API.
 * Safe to call from any component — all share the same state.
 */
export function useUpdater(): UpdaterAPI {
  return useUpdaterStore();
}
