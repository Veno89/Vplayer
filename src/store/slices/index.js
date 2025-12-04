/**
 * Store Slices - Centralized exports
 */
export { createPlayerSlice, playerPersistState } from './playerSlice';
export { createUISlice, uiPersistState, LAYOUT_TEMPLATES, getInitialWindows } from './uiSlice';
export { createSettingsSlice, settingsPersistState } from './settingsSlice';
