/**
 * VPlayer Zustand Store
 * 
 * Organized into domain slices:
 * - playerSlice: Playback state, queue management
 * - uiSlice: Windows, themes, layouts, visual settings
 * - settingsSlice: User preferences (playback, library, behavior, performance)
 * - musicBrainzSlice: MusicBrainz integration and discography matching
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppStore } from './types';
import {
  createPlayerSlice,
  playerPersistState,
  createUISlice,
  uiPersistState,
  createSettingsSlice,
  settingsPersistState,
  createMusicBrainzSlice,
  musicBrainzPersistState,
  getInitialWindows
} from './slices';
import { pruneExpiredDiscographyData } from './slices/musicBrainzSlice';

export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Combine all slices
      ...createPlayerSlice(set, get),
      ...createUISlice(set, get),
      ...createSettingsSlice(set),
      ...createMusicBrainzSlice(set, get),
    }),
    {
      name: 'vplayer-storage',
      partialize: (state) => {
        const persisted = {
          // Combine persisted state from all slices
          ...playerPersistState(state),
          ...uiPersistState(state),
          ...settingsPersistState(state),
          ...musicBrainzPersistState(state),
        };
        // If rememberQueue is disabled, strip queue data from persistence
        if (!state.rememberQueue) {
          (persisted as Record<string, unknown>).queue = [];
          (persisted as Record<string, unknown>).queueHistory = [];
        }
        return persisted;
      },
      // Merge persisted state with fresh defaults to add new windows
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppStore>;
        const merged = { ...currentState, ...persisted };
        
        // If rememberWindowPositions was disabled, discard persisted window positions
        if (persisted?.rememberWindowPositions === false) {
          merged.windows = getInitialWindows();
        } else if (persisted?.windows) {
          // Ensure new windows from layouts are added to existing persisted windows
          const defaultWindows = getInitialWindows();
          merged.windows = { ...defaultWindows, ...persisted.windows };
        }

        // Prune expired discography cache entries on hydration
        const pruned = pruneExpiredDiscographyData(merged);
        Object.assign(merged, pruned);
        
        return merged as AppStore;
      }
    }
  )
);

// One-time migration: remove legacy MusicBrainz localStorage key (now in Zustand persist)
try { localStorage.removeItem('vplayer_discography_data'); } catch { /* ignore */ }
