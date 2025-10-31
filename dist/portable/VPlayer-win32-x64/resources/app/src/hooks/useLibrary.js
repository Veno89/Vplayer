import { useState, useEffect, useCallback } from 'react';
import { saveFolderHandle, getAllFolderHandles, removeFolderHandle } from '../storage/idb';

/**
 * useLibrary manages tracks, folders, orphaned tracks, scanning, and persistence.
 */
export function useLibrary({ colorScheme, windows, setWindows, setCurrentTrack }) {
  const [tracks, setTracks] = useState([]);
  const [libraryFolders, setLibraryFolders] = useState([]);
  const [orphanedTracks, setOrphanedTracks] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('vplayer_state');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.tracks) setTracks(parsed.tracks || []);
        if (parsed.orphanedTracks) setOrphanedTracks(parsed.orphanedTracks || []);
        if (parsed.libraryFolders) setLibraryFolders(parsed.libraryFolders || []);
        if (parsed.windows && setWindows) setWindows(parsed.windows);
        if (parsed.currentTrack !== undefined && setCurrentTrack) setCurrentTrack(parsed.currentTrack);
      }
    } catch (err) {
      console.warn('Failed to load persisted state', err);
    }
  }, [setWindows, setCurrentTrack]);

  // Persist tracks and folders (exclude `file` objects)
  useEffect(() => {
    const serializableTracks = tracks.map(t => {
      const { file, ...rest } = t;
      return rest;
    });
    const state = {
      tracks: serializableTracks,
      orphanedTracks: orphanedTracks.map(t => {
        const { file, ...rest } = t; return rest;
      }),
      libraryFolders,
      colorScheme,
      windows,
    };
    try {
      localStorage.setItem('vplayer_state', JSON.stringify(state));
    } catch (err) {
      console.warn('Failed to persist state', err);
    }
  }, [tracks, orphanedTracks, libraryFolders, colorScheme, windows]);

  // Add more logic as needed (handleAddFolder, handleRemoveFolder, scanHandleAndMerge, etc.)

  return {
    tracks,
    setTracks,
    libraryFolders,
    setLibraryFolders,
    orphanedTracks,
    setOrphanedTracks,
    isScanning,
    setIsScanning,
    scanProgress,
    setScanProgress,
    // TODO: Export folder/track management functions here
  };
}
