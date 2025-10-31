import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock the IndexedDB helper during tests so tests don't require a browser IndexedDB implementation.
vi.mock('../storage/idb', () => {
	return {
		saveFolderHandle: async () => {},
		getAllFolderHandles: async () => [],
		removeFolderHandle: async () => {}
	}
})

