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
  // 1. Manage Data (Tracks & Folders)
  const {
    tracks,
    setTracks,
    libraryFolders,
    setLibraryFolders,
    loadAllTracks,
    loadAllFolders,
    addFolder,
    removeFolder,
    removeTrack
  } = useLibraryData();

  // 2. Manage Scanning (Passes data control to scanner)
  const {
    isScanning,
    scanProgress,
    scanCurrent,
    scanTotal,
    scanCurrentFile,
    refreshFolders
  } = useLibraryScanner({
    libraryFolders,
    loadAllTracks
  });

  // 3. Manage Filtering (Consumes raw tracks)
  const {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    advancedFilters,
    setAdvancedFilters,
    filteredTracks
  } = useLibraryFilters(tracks, libraryFolders);
  // Note: Updated useLibraryFilters signature to accept libraryFolders if needed later

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
    filteredTracks,

    // Actions
    setSearchQuery,
    setSortBy,
    setSortOrder,
    setAdvancedFilters,
    addFolder,
    removeFolder,
    refreshFolders,
    removeTrack,
    refreshTracks: loadAllTracks, // Alias for backward compatibility
  };
}