/**
 * Settings Slice - All user preferences and settings
 *
 * DRY pattern:
 * - Default values defined once in SETTINGS_DEFAULTS
 * - Individual setters auto-generated from the defaults keys
 * - Persist function picks all state keys from SETTINGS_DEFAULTS
 * - Generic `updateSetting(key, value)` for new code
 */
import type { AppStore, SettingsSlice, SettingsSliceState } from '../types';

type SetFn = (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;

// ─── Single source of truth for default values ──────────────────────────────
export const SETTINGS_DEFAULTS: SettingsSliceState = {
  // Playback Settings
  gaplessPlayback: true,
  autoPlayOnStartup: false,
  resumeLastTrack: true,
  replayGainMode: 'off',
  replayGainPreamp: 0,
  playbackSpeed: 1.0,
  fadeOnPause: true,
  fadeDuration: 200,
  defaultVolume: 80,
  rememberTrackPosition: true,

  // Library Settings
  autoScanOnStartup: true,
  watchFolderChanges: true,
  duplicateSensitivity: 'medium',
  autoFetchAlbumArt: true,

  // Behavior Settings
  minimizeToTray: true,
  closeToTray: false,
  startMinimized: false,
  rememberWindowPositions: true,
  playlistAutoScroll: true,
  autoResizeWindow: true,
  confirmBeforeDelete: true,
  showNotifications: true,
  snapToGrid: true,
  gridSize: 10,

  // Playback Behavior
  stopAfterCurrent: false,
  sleepTimerMinutes: 0,
  seekStepSize: 10,
  volumeStep: 5,
  rememberQueue: true,
  doubleClickAction: 'play' as const,
  trackChangeNotification: false,
  titleBarFormat: '{artist} — {title}',

  // Performance Settings
  cacheSizeLimit: 500,

  // EQ Settings
  eqBands: [
    { freq: "60Hz", value: 50 },
    { freq: "170Hz", value: 50 },
    { freq: "310Hz", value: 50 },
    { freq: "600Hz", value: 50 },
    { freq: "1kHz", value: 50 },
    { freq: "3kHz", value: 50 },
    { freq: "6kHz", value: 50 },
    { freq: "12kHz", value: 50 },
    { freq: "14kHz", value: 50 },
    { freq: "16kHz", value: 50 },
  ],

  // Crossfade Settings
  crossfadeEnabled: false,
  crossfadeDuration: 3000,

  // Keyboard Shortcuts
  keyboardShortcuts: null,

  // Onboarding
  onboardingComplete: false,
};

/** All keys of SettingsSliceState — used by persist and setter generation */
const SETTINGS_KEYS = Object.keys(SETTINGS_DEFAULTS) as Array<keyof SettingsSliceState>;

// ─── Helper: generate "setFoo" name from "foo" ─────────────────────────────
function setterName(key: string): string {
  return `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

// ─── Slice creator ──────────────────────────────────────────────────────────
export const createSettingsSlice = (set: SetFn): SettingsSlice => {
  // Generic setter — the primary way to update settings going forward
  const updateSetting = <K extends keyof SettingsSliceState>(
    key: K,
    value: SettingsSliceState[K],
  ) => set({ [key]: value } as Partial<AppStore>);

  // Auto-generate individual setters for backward compatibility
  // e.g. setGaplessPlayback: (v) => set({ gaplessPlayback: v })
  const setters: Record<string, (value: any) => void> = {};
  for (const key of SETTINGS_KEYS) {
    setters[setterName(key)] = (value: any) => set({ [key]: value } as Partial<AppStore>);
  }

  return {
    // Spread all default state values
    ...SETTINGS_DEFAULTS,

    // Generic setter
    updateSetting,

    // Spread all auto-generated individual setters (setGaplessPlayback, setAutoPlayOnStartup, …)
    ...setters,
  } as SettingsSlice;
};

// ─── Persist: auto-pick all settings state keys ─────────────────────────────
export const settingsPersistState = (state: SettingsSliceState): Partial<SettingsSliceState> => {
  const persisted: Partial<SettingsSliceState> = {};
  for (const key of SETTINGS_KEYS) {
    (persisted as any)[key] = state[key];
  }
  return persisted;
};
