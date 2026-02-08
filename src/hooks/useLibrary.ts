import { useLibraryData } from './library/useLibraryData';
import { useLibraryScanner } from './library/useLibraryScanner';
import { useLibraryFilters } from './library/useLibraryFilters';

/**
 * Library management hook (Composed)
 * 
 * Manages the music library by composing focused sub-hooks:
 * - useLibraryData: CRUD operations (Tracks/Folders)
 * - useLibraryScanner: Scanning logic and events
 * - useLibraryFilters: Search, Sort, Filter
 * 
 * @returns {Object} Library management interface
 */
export function useLibrary() {
  // 1. Manage Filtering State (Must be first to provide params)
  const {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    advancedFilters,
    setAdvancedFilters,
    activeParams // Backend filter params
  } = useLibraryFilters();

  // 2. Manage Data (Tracks & Folders) - Depends on activeParams
  const {
    tracks,
    setTracks,
    libraryFolders,
    setLibraryFolders,
    loadTracks,
    loadAllFolders,
    addFolder,
    removeFolder,
    removeTrack
  } = useLibraryData(activeParams);

  // 3. Manage Scanning (Passes data control to scanner)
  const {
    isScanning,
    scanProgress,
    scanCurrent,
    scanTotal,
    scanCurrentFile,
    refreshFolders
  } = useLibraryScanner({
    libraryFolders,
    loadAllTracks: loadTracks, // Alias for scanner usage
    loadAllFolders // Pass full reload function
  });

  // 4. Expose Unified API
  return {
    // Data
    tracks,
    libraryFolders,

    // Scanning
    isScanning,
    scanProgress,
    scanCurrent,
    scanTotal,
    scanCurrentFile,

    // Filtering & Sorting
    searchQuery,
    sortBy,
    sortOrder,
    advancedFilters,
    filteredTracks: tracks, // Helper alias: 'tracks' IS the filtered view now

    // Actions
    setSearchQuery,
    setSortBy,
    setSortOrder,
    setAdvancedFilters,
    addFolder,
    removeFolder,
    refreshFolders,
    removeTrack,
    refreshTracks: loadTracks,
  };
}