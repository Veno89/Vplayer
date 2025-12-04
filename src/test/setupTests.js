import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Tauri API modules
vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn().mockImplementation((cmd, args) => {
		// Return sensible defaults for common commands
		const defaults = {
			'get_all_tracks': [],
			'get_all_playlists': [],
			'get_all_folders': [],
			'is_playing': false,
			'get_position': 0,
			'get_duration': 0,
			'is_finished': false,
		};
		return Promise.resolve(defaults[cmd] ?? null);
	}),
}));

vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn().mockImplementation(() => {
		// Return a function to unlisten
		return Promise.resolve(() => {});
	}),
	emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
	open: vi.fn().mockResolvedValue(null),
}));

// Mock the IndexedDB helper during tests so tests don't require a browser IndexedDB implementation.
vi.mock('../storage/idb', () => {
	return {
		saveFolderHandle: async () => {},
		getAllFolderHandles: async () => [],
		removeFolderHandle: async () => {}
	}
});
