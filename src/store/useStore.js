/**
 * VPlayer Zustand Store
 * 
 * Organized into domain slices:
 * - playerSlice: Playback state, queue management
 * - uiSlice: Windows, themes, layouts, visual settings
 * - settingsSlice: User preferences (playback, library, behavior, performance)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createPlayerSlice,
  playerPersistState,
  createUISlice,
  uiPersistState,
  createSettingsSlice,
  settingsPersistState
} from './slices';

export const useStore = create(
  persist(
    (set, get) => ({
      // Combine all slices
      ...createPlayerSlice(set, get),
      ...createUISlice(set, get),
      ...createSettingsSlice(set),
    }),
    {
      name: 'vplayer-storage',
      partialize: (state) => ({
        // Combine persisted state from all slices
        ...playerPersistState(state),
        ...uiPersistState(state),
        ...settingsPersistState(state),
      })
    }
  )
);
