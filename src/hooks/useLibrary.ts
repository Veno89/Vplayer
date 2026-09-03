import { useCallback, useMemo } from 'react';
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
    refreshTracks: refreshTrackData,
    loadAllFolders,
    addFolder: addFolderData,
    removeFolder,
    removeTrack
  } = useLibraryData(activeParams);

  const refreshLibraryData = useCallback(async () => {
    await Promise.all([refreshTrackData(), loadAllFolders()]);
  }, [loadAllFolders, refreshTrackData]);

  // 3. Manage Scanning (Passes data control to scanner)
  const {
    isScanning,
    scanProgress,
    scanCurrent,
    scanTotal,
    scanCurrentFile,
    refreshFolders,
    scanNewFolder,
    cancelScan
  } = useLibraryScanner({
    libraryFolders,
    loadAllTracks: refreshTrackData,
    loadAllFolders // Pass full reload function
  });

  // 4. Composed addFolder: select folder → add to state → scan → persist
  const addFolder = useCallback(async (selectedPath?: string) => {
    const result = await addFolderData(selectedPath);
    if (result) {
      // Trigger scan which also adds the folder to DB and loads tracks
      await scanNewFolder(result.path);
    }
    return result;
  }, [addFolderData, scanNewFolder]);

  // Keep the aggregate stable when an ancestor rerenders for playback ticks.
  return useMemo(() => ({
    // Data
    tracks,
    libraryFolders,

    // Scanning
    isScanning,
    scanProgress,
    scanCurrent,
    scanTotal,
    scanCurrentFile,
    cancelScan,

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
    refreshTracks: refreshLibraryData,
  }), [
    tracks,
    libraryFolders,
    isScanning,
    scanProgress,
    scanCurrent,
    scanTotal,
    scanCurrentFile,
    cancelScan,
    searchQuery,
    sortBy,
    sortOrder,
    advancedFilters,
    setSearchQuery,
    setSortBy,
    setSortOrder,
    setAdvancedFilters,
    addFolder,
    removeFolder,
    refreshFolders,
    removeTrack,
    refreshLibraryData,
  ]);
}
