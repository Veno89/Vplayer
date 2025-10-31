import { useState, useEffect, useCallback, useRef } from 'react';
import { saveFolderHandle, getAllFolderHandles, removeFolderHandle } from '../storage/idb';

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.opus', '.aac'];

/**
 * useLibrary manages tracks, folders, scanning, and persistence.
 */
export function useLibrary() {
  const [tracks, setTracks] = useState([]);
  const [libraryFolders, setLibraryFolders] = useState([]);
  const [orphanedTracks, setOrphanedTracks] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('title'); // title, artist, album, dateAdded
  const [sortOrder, setSortOrder] = useState('asc'); // asc, desc
  
  const scanAbortRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // Debounced save to localStorage
  const debouncedSave = useCallback((data) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem('vplayer_library', JSON.stringify(data));
      } catch (err) {
        console.warn('Failed to persist library', err);
      }
    }, 500);
  }, []);

  // Load persisted library on mount
  useEffect(() => {
    const loadLibrary = async () => {
      try {
        const raw = localStorage.getItem('vplayer_library');
        if (raw) {
          const parsed = JSON.parse(raw);
          setTracks(parsed.tracks || []);
          setOrphanedTracks(parsed.orphanedTracks || []);
          setLibraryFolders(parsed.libraryFolders || []);
        }

        // Restore folder handles from IndexedDB
        const handles = await getAllFolderHandles();
        if (handles.length > 0) {
          setLibraryFolders(prev => {
            const merged = [...prev];
            handles.forEach(h => {
              if (!merged.find(f => f.id === h.id)) {
                merged.push(h);
              }
            });
            return merged;
          });
        }
      } catch (err) {
        console.warn('Failed to load persisted library', err);
      }
    };
    loadLibrary();
  }, []);

  // Persist library (debounced)
  useEffect(() => {
    const serializableTracks = tracks.map(({ file, ...rest }) => rest);
    const serializableOrphaned = orphanedTracks.map(({ file, ...rest }) => rest);
    
    debouncedSave({
      tracks: serializableTracks,
      orphanedTracks: serializableOrphaned,
      libraryFolders: libraryFolders.map(({ handle, ...rest }) => rest),
    });

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [tracks, orphanedTracks, libraryFolders, debouncedSave]);

  // Extract metadata from audio file
  const extractMetadata = useCallback(async (file) => {
    // Basic metadata - you'd want to use a library like jsmediatags for ID3
    return {
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      duration: 0,
      year: null,
      genre: null,
    };
  }, []);

  // Scan a folder recursively
  const scanFolder = useCallback(async (folderHandle, folderId) => {
    const foundTracks = [];
    let processedFiles = 0;
    let totalFiles = 0;

    // Count files first
    const countFiles = async (dirHandle) => {
      for await (const entry of dirHandle.values()) {
        if (scanAbortRef.current?.aborted) return;
        if (entry.kind === 'file') {
          const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
          if (AUDIO_EXTENSIONS.includes(ext)) totalFiles++;
        } else if (entry.kind === 'directory') {
          await countFiles(entry);
        }
      }
    };

    // Scan files
    const scanDir = async (dirHandle, relativePath = '') => {
      for await (const entry of dirHandle.values()) {
        if (scanAbortRef.current?.aborted) return;

        if (entry.kind === 'file') {
          const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
          if (AUDIO_EXTENSIONS.includes(ext)) {
            try {
              const file = await entry.getFile();
              const metadata = await extractMetadata(file);
              const path = relativePath ? `${relativePath}/${entry.name}` : entry.name;
              
              foundTracks.push({
                id: `${folderId}-${path}`,
                folderId,
                path,
                name: entry.name,
                file,
                url: URL.createObjectURL(file),
                dateAdded: Date.now(),
                ...metadata,
              });

              processedFiles++;
              setScanProgress(Math.round((processedFiles / totalFiles) * 100));
            } catch (err) {
              console.warn(`Failed to process ${entry.name}:`, err);
            }
          }
        } else if (entry.kind === 'directory') {
          const newPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          await scanDir(entry, newPath);
        }
      }
    };

    try {
      await countFiles(folderHandle);
      await scanDir(folderHandle);
    } catch (err) {
      console.error('Scan error:', err);
      throw err;
    }

    return foundTracks;
  }, [extractMetadata]);

  // Add folder to library
  const addFolder = useCallback(async () => {
    try {
      const folderHandle = await window.showDirectoryPicker({
        mode: 'read',
      });

      const folderId = `folder_${Date.now()}`;
      const folderData = {
        id: folderId,
        name: folderHandle.name,
        dateAdded: Date.now(),
      };

      // Save handle to IndexedDB
      await saveFolderHandle(folderId, folderHandle);

      setLibraryFolders(prev => [...prev, { ...folderData, handle: folderHandle }]);

      // Start scanning
      setIsScanning(true);
      setScanProgress(0);
      scanAbortRef.current = new AbortController();

      const foundTracks = await scanFolder(folderHandle, folderId);

      setTracks(prev => {
        // Remove duplicates
        const existing = new Set(prev.map(t => t.id));
        const newTracks = foundTracks.filter(t => !existing.has(t.id));
        return [...prev, ...newTracks];
      });

      setIsScanning(false);
      setScanProgress(0);

      return foundTracks.length;
    } catch (err) {
      setIsScanning(false);
      setScanProgress(0);
      if (err.name !== 'AbortError') {
        console.error('Failed to add folder:', err);
        throw err;
      }
      return 0;
    }
  }, [scanFolder]);

  // Remove folder and its tracks
  const removeFolder = useCallback(async (folderId) => {
    try {
      await removeFolderHandle(folderId);
      
      setLibraryFolders(prev => prev.filter(f => f.id !== folderId));
      
      const removedTracks = tracks.filter(t => t.folderId === folderId);
      setTracks(prev => prev.filter(t => t.folderId !== folderId));
      
      // Revoke object URLs
      removedTracks.forEach(t => {
        if (t.url?.startsWith('blob:')) {
          URL.revokeObjectURL(t.url);
        }
      });

      return removedTracks.length;
    } catch (err) {
      console.error('Failed to remove folder:', err);
      throw err;
    }
  }, [tracks]);

  // Rescan a specific folder
  const rescanFolder = useCallback(async (folderId) => {
    const folder = libraryFolders.find(f => f.id === folderId);
    if (!folder?.handle) {
      throw new Error('Folder handle not found');
    }

    try {
      // Verify permission
      const permission = await folder.handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted') {
        const newPermission = await folder.handle.requestPermission({ mode: 'read' });
        if (newPermission !== 'granted') {
          throw new Error('Permission denied');
        }
      }

      // Remove old tracks from this folder
      const oldTracks = tracks.filter(t => t.folderId === folderId);
      setTracks(prev => prev.filter(t => t.folderId !== folderId));
      
      // Revoke old URLs
      oldTracks.forEach(t => {
        if (t.url?.startsWith('blob:')) {
          URL.revokeObjectURL(t.url);
        }
      });

      // Rescan
      setIsScanning(true);
      setScanProgress(0);
      scanAbortRef.current = new AbortController();

      const foundTracks = await scanFolder(folder.handle, folderId);
      setTracks(prev => [...prev, ...foundTracks]);

      setIsScanning(false);
      setScanProgress(0);

      return foundTracks.length;
    } catch (err) {
      setIsScanning(false);
      setScanProgress(0);
      console.error('Failed to rescan folder:', err);
      throw err;
    }
  }, [libraryFolders, tracks, scanFolder]);

  // Rescan all folders
  const rescanAll = useCallback(async () => {
    for (const folder of libraryFolders) {
      if (scanAbortRef.current?.aborted) break;
      try {
        await rescanFolder(folder.id);
      } catch (err) {
        console.error(`Failed to rescan ${folder.name}:`, err);
      }
    }
  }, [libraryFolders, rescanFolder]);

  // Cancel ongoing scan
  const cancelScan = useCallback(() => {
    if (scanAbortRef.current) {
      scanAbortRef.current.abort();
      setIsScanning(false);
      setScanProgress(0);
    }
  }, []);

  // Remove individual track
  const removeTrack = useCallback((trackId) => {
    const track = tracks.find(t => t.id === trackId);
    if (track?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(track.url);
    }
    setTracks(prev => prev.filter(t => t.id !== trackId));
  }, [tracks]);

  // Add orphaned track (drag & drop, file picker)
  const addOrphanedTrack = useCallback(async (file) => {
    try {
      const metadata = await extractMetadata(file);
      const track = {
        id: `orphan_${Date.now()}_${file.name}`,
        folderId: null,
        path: file.name,
        name: file.name,
        file,
        url: URL.createObjectURL(file),
        dateAdded: Date.now(),
        ...metadata,
      };
      
      setOrphanedTracks(prev => [...prev, track]);
      return track;
    } catch (err) {
      console.error('Failed to add orphaned track:', err);
      throw err;
    }
  }, [extractMetadata]);

  // Filter and sort tracks
  const filteredTracks = useCallback(() => {
    let result = [...tracks];

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(query) ||
        t.artist?.toLowerCase().includes(query) ||
        t.album?.toLowerCase().includes(query) ||
        t.name?.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [tracks, searchQuery, sortBy, sortOrder]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Revoke all blob URLs
      [...tracks, ...orphanedTracks].forEach(t => {
        if (t.url?.startsWith('blob:')) {
          URL.revokeObjectURL(t.url);
        }
      });
    };
  }, []);

  return {
    // State
    tracks,
    libraryFolders,
    orphanedTracks,
    isScanning,
    scanProgress,
    searchQuery,
    sortBy,
    sortOrder,
    
    // Folder management
    addFolder,
    removeFolder,
    rescanFolder,
    rescanAll,
    cancelScan,
    
    // Track management
    removeTrack,
    addOrphanedTrack,
    
    // Search & sort
    setSearchQuery,
    setSortBy,
    setSortOrder,
    filteredTracks: filteredTracks(),
  };
}