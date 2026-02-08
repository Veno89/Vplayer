/**
 * Store Slices - Centralized exports
 */
export { createPlayerSlice, playerPersistState } from './playerSlice';
export { createUISlice, uiPersistState, getInitialWindows } from './uiSlice';
export { LAYOUT_TEMPLATES } from '../../utils/layoutTemplates';
export { createSettingsSlice, settingsPersistState } from './settingsSlice';
export { createMusicBrainzSlice, musicBrainzPersistState } from './musicBrainzSlice';
