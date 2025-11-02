import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export function useLibraryTauri() {
  const [tracks, setTracks] = useState([]);
  const [libraryFolders, setLibraryFolders] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc');

  // Load tracks from database on mount
  useEffect(() => {
    loadAllTracks();
  }, []);

  const loadAllTracks = async () => {
    try {
      const dbTracks = await invoke('get_all_tracks');
      setTracks(dbTracks);
    } catch (err) {
      console.error('Failed to load tracks:', err);
    }
  };

  const addFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Music Folder',
      });

      if (!selected) return;

      setIsScanning(true);
      setScanProgress(0);

      const scannedTracks = await invoke('scan_folder', { 
        folderPath: selected 
      });

      const folderName = selected.split(/[\\/]/).pop();
      const newFolder = {
        id: `folder_${Date.now()}`,
        name: folderName,
        path: selected,
        dateAdded: Date.now(),
      };

      setLibraryFolders(prev => [...prev, newFolder]);
      await loadAllTracks(); // Reload all tracks from database
      setIsScanning(false);
      setScanProgress(100);
    } catch (err) {
      console.error('Failed to add folder:', err);
      setIsScanning(false);
    }
  }, []);

  const removeFolder = useCallback(async (folderId, folderPath) => {
    try {
      await invoke('remove_folder', { folderId, folderPath });
      setLibraryFolders(prev => prev.filter(f => f.id !== folderId));
      await loadAllTracks(); // Reload remaining tracks
    } catch (err) {
      console.error('Failed to remove folder:', err);
    }
  }, []);

  const removeTrack = useCallback((trackId) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
  }, []);

  // Filter and sort tracks
  let filteredTracks = [...tracks];

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredTracks = filteredTracks.filter(track =>
      (track.title || track.name || '').toLowerCase().includes(query) ||
      (track.artist || '').toLowerCase().includes(query) ||
      (track.album || '').toLowerCase().includes(query)
    );
  }

  filteredTracks.sort((a, b) => {
    let aVal = a[sortBy] || '';
    let bVal = b[sortBy] || '';
    
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }
    
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return {
    tracks,
    libraryFolders,
    isScanning,
    scanProgress,
    searchQuery,
    sortBy,
    sortOrder,
    setSearchQuery,
    setSortBy,
    setSortOrder,
    addFolder,
    removeFolder,
    removeTrack,
    filteredTracks,
  };
}
