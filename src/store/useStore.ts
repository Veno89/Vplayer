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
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import type { AppStore, WindowPosition, WindowsState } from './types';
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
import { WINDOW_MIN_SIZES } from '../utils/constants';
import { LAYOUT_TEMPLATES } from '../utils/layoutTemplates';

export const STORE_RESET_PENDING_KEY = 'vplayer-reset-pending';

try {
  if (localStorage.getItem(STORE_RESET_PENDING_KEY) === '1') {
    localStorage.removeItem('vplayer-storage');
    localStorage.removeItem(STORE_RESET_PENDING_KEY);
  }
} catch { /* storage can be unavailable in hardened WebViews */ }

type PersistedAppState = Partial<AppStore>;

let lastPersistedValue: string | null = null;
let lastPersistedSnapshot: PersistedAppState | null = null;
const deduplicatingStorage: PersistStorage<PersistedAppState> = {
  getItem(name) {
    const value = localStorage.getItem(name);
    lastPersistedValue = value;
    return value ? JSON.parse(value) as StorageValue<PersistedAppState> : null;
  },
  setItem(name, value) {
    if (localStorage.getItem(STORE_RESET_PENDING_KEY) === '1' || value.state === lastPersistedSnapshot) {
      return;
    }
    const serialized = JSON.stringify(value);
    if (serialized === lastPersistedValue) {
      lastPersistedSnapshot = value.state;
      return;
    }
    localStorage.setItem(name, serialized);
    lastPersistedValue = serialized;
    lastPersistedSnapshot = value.state;
  },
  removeItem(name) {
    localStorage.removeItem(name);
    lastPersistedValue = null;
    lastPersistedSnapshot = null;
  },
};

let lastSelectedState: PersistedAppState | null = null;

function equalPersistedValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => Object.is(item, right[index]));
}

function equalPersistedState(left: PersistedAppState, right: PersistedAppState): boolean {
  const leftEntries = Object.entries(left);
  const rightKeys = Object.keys(right);
  return leftEntries.length === rightKeys.length
    && leftEntries.every(([key, value]) =>
      equalPersistedValue(value, (right as Record<string, unknown>)[key])
    );
}

export function selectPersistedState(state: AppStore): PersistedAppState {
  const persisted: PersistedAppState = {
    ...playerPersistState(state),
    ...uiPersistState(state),
    ...settingsPersistState(state),
    ...musicBrainzPersistState(state),
  };

  if (!state.rememberQueue) {
    persisted.queue = [];
    persisted.queueIndex = 0;
    persisted.queueHistory = [];
  }

  if (lastSelectedState && equalPersistedState(lastSelectedState, persisted)) {
    return lastSelectedState;
  }
  lastSelectedState = persisted;
  return persisted;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function compatiblePersistedValue(value: unknown, fallback: unknown): boolean {
  if (fallback === null) {
    return value === null || typeof value === 'string' || isPlainObject(value);
  }
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (typeof fallback === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (typeof fallback === 'object') return isPlainObject(value);
  return typeof value === typeof fallback;
}

function sanitizePersistedState(value: unknown, current: AppStore): Partial<AppStore> {
  if (!isPlainObject(value)) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!(key in current)) continue;
    const fallback = (current as unknown as Record<string, unknown>)[key];
    if (typeof fallback === 'function' || !compatiblePersistedValue(candidate, fallback)) continue;
    if (key === 'queue') {
      safe[key] = (candidate as unknown[]).filter(item =>
        isPlainObject(item) && typeof item.id === 'string' && typeof item.path === 'string'
      ).slice(0, 5000);
    } else {
      safe[key] = candidate;
    }
  }
  return safe as Partial<AppStore>;
}

export function migratePersistedState(value: unknown, persistedVersion: number): PersistedAppState {
  if (!isPlainObject(value) || persistedVersion >= 4) return value as PersistedAppState;

  const migrated: Record<string, unknown> = { ...value };

  if (persistedVersion < 3 && value.currentLayout === 'full' && isPlainObject(value.windows)) {
    const windows = value.windows as Record<string, unknown>;
    const player = windows.player;
    const equalizer = windows.equalizer;
    const playlist = windows.playlist;
    const library = windows.library;
    const usesLegacyFullAnchors = isPlainObject(player) && player.x === 40
      && isPlainObject(equalizer) && equalizer.x === 40
      && isPlainObject(playlist) && playlist.x === 480
      && isPlainObject(library) && library.x === 1180;

    if (usesLegacyFullAnchors) {
      const migratedWindows: Record<string, unknown> = { ...windows };
      for (const [id, layoutWindow] of Object.entries(LAYOUT_TEMPLATES.full.windows)) {
        const existing = windows[id];
        migratedWindows[id] = isPlainObject(existing)
          ? {
              ...existing,
              x: layoutWindow.x,
              y: layoutWindow.y,
              width: layoutWindow.width,
              height: layoutWindow.height,
            }
          : layoutWindow;
      }
      migrated.windows = migratedWindows;
    }
  }

  // Runtime playback pointers are only valid together with their in-memory
  // source list. Keep the resume bookmark instead and rebuild these on startup.
  delete migrated.currentTrack;
  delete migrated.currentTrackId;
  delete migrated.activePlaybackTracks;

  return migrated as PersistedAppState;
}

/**
 * Bring persisted windows forward when a release raises a content-safe minimum.
 * Windows stacked directly below a growing panel keep their existing gap instead
 * of being overlapped by the larger panel.
 */
export function normalizeWindowLayout(windows: WindowsState): WindowsState {
  const original = Object.fromEntries(
    Object.entries(windows).map(([id, window]) => [id, { ...window }]),
  ) as WindowsState;
  const normalized = Object.fromEntries(
    Object.entries(windows).map(([id, window]) => {
      const minimum = (WINDOW_MIN_SIZES as Record<string, { width: number; height: number }>)[id]
        ?? { width: 250, height: 150 };
      return [id, {
        ...window,
        width: Math.max(minimum.width, window.width),
        height: Math.max(minimum.height, window.height),
      }];
    }),
  ) as WindowsState;

  const verticallyOrdered = Object.entries(original)
    .sort(([, left], [, right]) => left.y - right.y);

  for (const [sourceId, oldSource] of verticallyOrdered) {
    const source = normalized[sourceId];
    if (!source) continue;
    const oldBottom = oldSource.y + oldSource.height;
    const bottomShift = source.y + source.height - oldBottom;
    if (bottomShift <= 0) continue;

    for (const [targetId, oldTarget] of verticallyOrdered) {
      if (targetId === sourceId) continue;
      const oldGap = oldTarget.y - oldBottom;
      if (oldGap < 0 || oldGap > 24) continue;

      const overlapsHorizontally = Math.max(oldSource.x, oldTarget.x)
        < Math.min(oldSource.x + oldSource.width, oldTarget.x + oldTarget.width);
      if (!overlapsHorizontally) continue;

      const target = normalized[targetId];
      if (target) {
        target.y = Math.max(target.y, oldTarget.y + bottomShift);
      }
    }
  }

  return normalized;
}

export const useStore = create<AppStore>()(
  persist<AppStore, [], [], PersistedAppState>(
    (set, get) => ({
      // Combine all slices
      ...createPlayerSlice(set, get),
      ...createUISlice(set, get),
      ...createSettingsSlice(set),
      ...createMusicBrainzSlice(set, get),
    }),
    {
      name: 'vplayer-storage',
      version: 4,
      storage: deduplicatingStorage,
      migrate: migratePersistedState,
      partialize: selectPersistedState,
      // Merge persisted state with fresh defaults to add new windows
      merge: (persistedState, currentState) => {
        const persisted = sanitizePersistedState(persistedState, currentState);
        const merged = { ...currentState, ...persisted };

        // Shuffle order/history are session-only and should never survive restarts.
        merged.shuffleOrder = [];
        merged.shuffleSignature = '';
        merged.shuffleHistory = [];
        merged.currentTrack = null;
        merged.currentTrackId = null;
        merged.activePlaybackTracks = [];
        
        // If rememberWindowPositions was disabled, discard persisted window positions
        if (persisted?.rememberWindowPositions === false) {
          merged.windows = normalizeWindowLayout(getInitialWindows());
        } else if (isPlainObject(persisted?.windows)) {
          // Ensure new windows from layouts are added to existing persisted windows
          const defaultWindows = getInitialWindows();
          const safeWindows = Object.fromEntries(Object.entries(defaultWindows).map(([id, fallback]) => {
            const candidate = persisted.windows?.[id];
            return [id, isPlainObject(candidate)
              ? { ...fallback, ...candidate } as WindowPosition
              : fallback];
          })) as WindowsState;
          merged.windows = normalizeWindowLayout(safeWindows);
        } else {
          merged.windows = normalizeWindowLayout(merged.windows);
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
