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

export const useStore = create(
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
      partialize: (state) => ({
        // Combine persisted state from all slices
        ...playerPersistState(state),
        ...uiPersistState(state),
        ...settingsPersistState(state),
        ...musicBrainzPersistState(state),
      }),
      // Merge persisted state with fresh defaults to add new windows
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...persistedState };
        
        // Ensure new windows from layouts are added to existing persisted windows
        if (persistedState?.windows) {
          const defaultWindows = getInitialWindows();
          merged.windows = { ...defaultWindows, ...persistedState.windows };
        }
        
        return merged;
      }
    }
  )
);
