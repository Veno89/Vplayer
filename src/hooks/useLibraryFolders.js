import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TauriAPI } from '../services/TauriAPI';

/**
 * Hook for managing library folders
 * Handles folder CRUD operations and folder watching
 */
export function useLibraryFolders({ 
  onTracksChange, 
  watchFolderChanges = true 
}) {
  const [libraryFolders, setLibraryFolders] = useState([]);

  const loadAllFolders = useCallback(async () => {
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
      return folders;
    } catch (err) {
      console.error('[Library - Load Folders] Error:', err);
      throw err;
    }
  }, []);

  const addFolder = useCallback(async () => {
    try {
      const selected = await TauriAPI.selectFolder();
      if (!selected) return null;

      const folderName = selected.split(/[\\/]/).pop();
      
      // Scan the folder
      await TauriAPI.scanFolder(selected);

      // Reload folders from database
      const folders = await loadAllFolders();
      
      // Start watching this folder for changes
      if (watchFolderChanges) {
        try {
          await invoke('start_folder_watch', { folderPath: selected });
          console.log(`Started watching folder: ${selected}`);
        } catch (err) {
          console.error('Failed to start folder watch:', err);
        }
      }

      // Notify parent to reload tracks
      if (onTracksChange) {
        await onTracksChange();
      }

      return { name: folderName, path: selected };
    } catch (err) {
      console.error('Failed to add folder:', err);
      throw err;
    }
  }, [loadAllFolders, watchFolderChanges, onTracksChange]);

  const removeFolder = useCallback(async (folderId, folderPath) => {
    try {
      // Stop watching this folder
      try {
        await invoke('stop_folder_watch', { folderPath });
        console.log(`Stopped watching folder: ${folderPath}`);
      } catch (err) {
        console.error('Failed to stop folder watch:', err);
      }
      
      await TauriAPI.removeFolder(folderId, folderPath);
      setLibraryFolders(prev => prev.filter(f => f.id !== folderId));
      
      // Notify parent to reload tracks
      if (onTracksChange) {
        await onTracksChange();
      }
    } catch (err) {
      console.error('Failed to remove folder:', err);
      throw err;
    }
  }, [onTracksChange]);

  const refreshFolders = useCallback(async () => {
    try {
      let totalNewTracks = 0;

      // Incrementally scan each folder
      for (const folder of libraryFolders) {
        const scannedTracks = await TauriAPI.scanFolderIncremental(folder.path);
        totalNewTracks += scannedTracks.length;
      }

      // Notify parent to reload tracks
      if (onTracksChange) {
        await onTracksChange();
      }
      
      return totalNewTracks;
    } catch (err) {
      console.error('Failed to refresh folders:', err);
      throw err;
    }
  }, [libraryFolders, onTracksChange]);

  const startWatchingAllFolders = useCallback(async () => {
    if (!watchFolderChanges) return;
    
    try {
      const dbFolders = await TauriAPI.getAllFolders();
      for (const [id, path, name, dateAdded] of dbFolders) {
        try {
          await invoke('start_folder_watch', { folderPath: path });
          console.log(`Started watching folder: ${path}`);
        } catch (err) {
          console.error(`Failed to start watching ${path}:`, err);
        }
      }
    } catch (err) {
      console.error('Failed to start folder watches:', err);
    }
  }, [watchFolderChanges]);

  return {
    libraryFolders,
    setLibraryFolders,
    loadAllFolders,
    addFolder,
    removeFolder,
    refreshFolders,
    startWatchingAllFolders,
  };
}

export default useLibraryFolders;
