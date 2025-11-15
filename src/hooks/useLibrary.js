import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { useDebounce } from './useDebounce';
import { SEARCH_DEBOUNCE_MS, EVENTS } from '../utils/constants';
import { TauriAPI } from '../services/TauriAPI';

export function useLibrary() {
  const [tracks, setTracks] = useState([]);
  const [libraryFolders, setLibraryFolders] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanCurrent, setScanCurrent] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [scanCurrentFile, setScanCurrentFile] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc');
  const [advancedFilters, setAdvancedFilters] = useState({
    genre: '',
    yearFrom: '',
    yearTo: '',
    minRating: 0,
    durationFrom: '',
    durationTo: '',
    folderId: '' // Filter by specific folder
  });

  // Debounce search query to reduce filtering operations
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  // Load tracks from database on mount
  useEffect(() => {
    loadAllTracks();
    loadAllFolders();
  }, []);

  // Listen for scan events
  useEffect(() => {
    const unlistenPromises = [];

    // Listen for total files count
    unlistenPromises.push(
      TauriAPI.onEvent(EVENTS.SCAN_TOTAL, (event) => {
        setScanTotal(event.payload);
        setScanCurrent(0);
        setScanProgress(0);
      })
    );

    // Listen for progress updates
    unlistenPromises.push(
      TauriAPI.onEvent(EVENTS.SCAN_PROGRESS, (event) => {
        const { current, total, current_file } = event.payload;
        setScanCurrent(current);
        setScanTotal(total);
        setScanCurrentFile(current_file);
        
        // Calculate percentage
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        setScanProgress(percent);
      })
    );

    // Listen for scan completion
    unlistenPromises.push(
      TauriAPI.onEvent(EVENTS.SCAN_COMPLETE, (event) => {
        console.log(`Scan complete: ${event.payload} tracks found`);
        setScanProgress(100);
        setScanCurrentFile('');
        
        // Reset scanning state after a short delay
        setTimeout(() => {
          setIsScanning(false);
          setScanProgress(0);
          setScanCurrent(0);
          setScanTotal(0);
        }, 1000);
      })
    );

    // Listen for scan cancellation
    unlistenPromises.push(
      TauriAPI.onEvent(EVENTS.SCAN_CANCELLED, (event) => {
        console.log(`Scan cancelled: ${event.payload} tracks processed`);
        setScanCurrentFile('Cancelled');
        
        // Reset scanning state
        setTimeout(() => {
          setIsScanning(false);
          setScanProgress(0);
          setScanCurrent(0);
          setScanTotal(0);
          setScanCurrentFile('');
        }, 1000);
      })
    );

    // Listen for scan errors
    unlistenPromises.push(
      TauriAPI.onEvent(EVENTS.SCAN_ERROR, (event) => {
        console.warn('Scan error:', event.payload);
      })
    );

    // Cleanup listeners on unmount
    return () => {
      Promise.all(unlistenPromises).then((unlistenFns) => {
        unlistenFns.forEach((fn) => fn());
      }).catch(err => {
        console.warn('Failed to cleanup event listeners:', err);
      });
    };
  }, []);

  const loadAllTracks = async () => {
    try {
      const dbTracks = await TauriAPI.getAllTracks();
      setTracks(dbTracks);
    } catch (err) {
      console.error('Failed to load tracks:', err);
    }
  };

  const loadAllFolders = async () => {
    try {
      const dbFolders = await TauriAPI.getAllFolders();
      // Transform from database format: (id, path, name, dateAdded)
      const folders = dbFolders.map(([id, path, name, dateAdded]) => ({
        id,
        path,
        name,
        dateAdded
      }));
      setLibraryFolders(folders);
    } catch (err) {
      console.error('Failed to load folders:', err);
    }
  };

  const addFolder = useCallback(async () => {
    try {
      const selected = await TauriAPI.selectFolder();

      if (!selected) return;

      setIsScanning(true);
      setScanProgress(0);
      setScanCurrent(0);
      setScanTotal(0);
      setScanCurrentFile('');

      const scannedTracks = await TauriAPI.scanFolder(selected);

      const folderName = selected.split(/[\\/]/).pop();
      const newFolder = {
        id: `folder_${Date.now()}`,
        name: folderName,
        path: selected,
        dateAdded: Date.now(),
      };

      setLibraryFolders(prev => [...prev, newFolder]);
      await loadAllTracks(); // Reload all tracks from database
      await loadAllFolders(); // Reload folders to get correct data from DB
    } catch (err) {
      console.error('Failed to add folder:', err);
      setIsScanning(false);
      throw err;
    }
  }, []);

  const removeFolder = useCallback(async (folderId, folderPath) => {
    try {
      await TauriAPI.removeFolder(folderId, folderPath);
      setLibraryFolders(prev => prev.filter(f => f.id !== folderId));
      await loadAllTracks(); // Reload remaining tracks
      await loadAllFolders(); // Reload folders
    } catch (err) {
      console.error('Failed to remove folder:', err);
      throw err;
    }
  }, []);

  const refreshFolders = useCallback(async () => {
    try {
      setIsScanning(true);
      setScanProgress(0);
      setScanCurrent(0);
      setScanTotal(0);
      setScanCurrentFile('');

      let totalNewTracks = 0;

      // Incrementally scan each folder
      for (const folder of libraryFolders) {
        const scannedTracks = await TauriAPI.scanFolderIncremental(folder.path);
        totalNewTracks += scannedTracks.length;
      }

      // Reload all tracks from database
      await loadAllTracks();
      
      return totalNewTracks;
    } catch (err) {
      console.error('Failed to refresh folders:', err);
      throw err;
    } finally {
      setIsScanning(false);
    }
  }, [libraryFolders]);

  const removeTrack = useCallback(async (trackId) => {
    try {
      await TauriAPI.removeTrack(trackId);
      setTracks(prev => prev.filter(t => t.id !== trackId));
    } catch (err) {
      console.error('Failed to remove track:', err);
      throw err;
    }
  }, []);

  // Filter and sort tracks - memoized for performance
  const filteredTracks = useMemo(() => {
    let filtered = [...tracks];

    // Basic text search
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(track =>
        (track.title || track.name || '').toLowerCase().includes(query) ||
        (track.artist || '').toLowerCase().includes(query) ||
        (track.album || '').toLowerCase().includes(query)
      );
    }

    // Advanced filters
    if (advancedFilters.genre) {
      const genreQuery = advancedFilters.genre.toLowerCase();
      filtered = filtered.filter(track =>
        (track.genre || '').toLowerCase().includes(genreQuery)
      );
    }

    if (advancedFilters.yearFrom) {
      const yearFrom = parseInt(advancedFilters.yearFrom);
      filtered = filtered.filter(track => {
        const trackYear = track.year ? parseInt(track.year) : 0;
        return trackYear >= yearFrom;
      });
    }

    if (advancedFilters.yearTo) {
      const yearTo = parseInt(advancedFilters.yearTo);
      filtered = filtered.filter(track => {
        const trackYear = track.year ? parseInt(track.year) : 9999;
        return trackYear <= yearTo;
      });
    }

    if (advancedFilters.minRating > 0) {
      filtered = filtered.filter(track => 
        (track.rating || 0) >= advancedFilters.minRating
      );
    }

    if (advancedFilters.durationFrom) {
      const durationFrom = parseFloat(advancedFilters.durationFrom) * 60; // Convert to seconds
      filtered = filtered.filter(track => 
        (track.duration || 0) >= durationFrom
      );
    }

    if (advancedFilters.durationTo) {
      const durationTo = parseFloat(advancedFilters.durationTo) * 60; // Convert to seconds
      filtered = filtered.filter(track => 
        (track.duration || 0) <= durationTo
      );
    }

    // Filter by folder
    if (advancedFilters.folderId) {
      filtered = filtered.filter(track => {
        // Match tracks from the selected folder by comparing paths
        const folder = libraryFolders.find(f => f.id === advancedFilters.folderId);
        if (folder) {
          return track.path.startsWith(folder.path);
        }
        return true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortBy] || '';
      let bVal = b[sortBy] || '';
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [tracks, debouncedSearchQuery, sortBy, sortOrder, advancedFilters, libraryFolders]);

  return {
    tracks,
    libraryFolders,
    isScanning,
    scanProgress,
    scanCurrent,
    scanTotal,
    scanCurrentFile,
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
    filteredTracks,
    refreshTracks: loadAllTracks,
  };
}