import { useState, useEffect, useCallback } from 'react';
import { TauriAPI } from '../../services/TauriAPI';
import { useErrorHandler } from '../../services/ErrorHandler';
import { useToast } from '../useToast';
import type { Track, TrackFilter } from '../../types';

interface LibraryFolder {
  id: string;
  path: string;
  name: string;
  dateAdded: number;
}

interface AddFolderResult {
  path: string;
  newFolder: LibraryFolder;
}

export interface LibraryDataAPI {
  tracks: Track[];
  setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
  libraryFolders: LibraryFolder[];
  setLibraryFolders: React.Dispatch<React.SetStateAction<LibraryFolder[]>>;
  loadTracks: () => Promise<void>;
  loadAllTracks: () => Promise<void>;
  loadAllFolders: () => Promise<void>;
  addFolder: () => Promise<AddFolderResult | null>;
  removeFolder: (folderId: string, folderPath: string) => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;
}

/**
 * Hook to manage raw library data (tracks and folders)
 * Handles CRUD operations and database interactions
 */
export function useLibraryData(filterParams: Record<string, unknown> | null = null): LibraryDataAPI {
    const toast = useToast();
    const errorHandler = useErrorHandler(toast);

    const [tracks, setTracks] = useState<Track[]>([]);
    const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>([]);

    const loadTracks = useCallback(async () => {
        try {
            // Use filtered query if params exist, otherwise get all (though getFilteredTracks handles empty/default too)
            // We favor getFilteredTracks now to support sorting/filtering at DB level
            const params = filterParams || {};
            const dbTracks = await TauriAPI.getFilteredTracks(params);
            setTracks(dbTracks);
        } catch (err) {
            errorHandler.handle(err, 'Library - Load Tracks');
        }
    }, [errorHandler, filterParams]);

    const loadAllFolders = useCallback(async () => {
        try {
            const dbFolders = await TauriAPI.getAllFolders();
            // Transform from database format: (id, path, name, dateAdded)
            const folders = dbFolders.map(([id, path, name, dateAdded]: [string, string, string, number]) => ({
                id,
                path,
                name,
                dateAdded
            }));
            setLibraryFolders(folders);
        } catch (err) {
            errorHandler.handle(err, 'Library - Load Folders');
        }
    }, [errorHandler]);

    // Initial load and re-load when filters change
    useEffect(() => {
        const initLibrary = async () => {
            await loadTracks();
            await loadAllFolders(); // We might want to separate this from filter changes?
            // If filters change, we only need to reload tracks, not folders.
            // But useEffect runs on any dependency change.
            // We can split effects if optimal.
        };
        initLibrary();
    }, [loadTracks]); // loadTracks depends on filterParams

    // Separate effect for folders if we want to avoid reloading folders on filter change?
    // Current loadAllFolders is stable (depends only on errorHandler).
    // But initLibrary calls both.
    // Ideally:
    /*
    useEffect(() => { loadAllFolders(); }, [loadAllFolders]);
    useEffect(() => { loadTracks(); }, [loadTracks]);
    */
    // But `initLibrary` pattern is simple. Loading folders is cheap (few folders).

    const addFolder = useCallback(async (): Promise<AddFolderResult | null> => {
        try {
            const selected = await TauriAPI.selectFolder();

            if (!selected) return null;

            // Check if folder already exists
            const exists = libraryFolders.some(f => f.path === selected);
            if (exists) {
                toast.showInfo('Folder already in library');
                return null;
            }

            // We return the selected path so the scanner can start scanning immediately
            // The actual DB add happens after scan in the original logic, but here we likely want
            // to add it to state first or return it to the caller (useLibraryScanner)

            const folderName = selected.split(/[\\/]/).pop();
            const newFolder = {
                id: `folder_${Date.now()}`,
                name: folderName,
                path: selected,
                dateAdded: Date.now(),
            };

            // Add to state immediately for responsiveness
            setLibraryFolders(prev => [...prev, newFolder]);

            // Return details for the scanner to use
            return { path: selected, newFolder };
        } catch (err) {
            console.error('Failed to add folder:', err);
            throw err;
        }
    }, [libraryFolders, toast]);

    const removeFolder = useCallback(async (folderId: string, folderPath: string) => {
        try {
            // Stop watching this folder
            try {
                await TauriAPI.stopFolderWatch(folderPath);
                console.log(`Stopped watching folder: ${folderPath}`);
            } catch (err) {
                console.error('Failed to stop folder watch:', err);
            }

            await TauriAPI.removeFolder(folderId, folderPath);
            setLibraryFolders(prev => prev.filter(f => f.id !== folderId));
            await loadTracks(); // Reload remaining tracks (filtered)
            await loadAllFolders(); // Reload folders to stay in sync
        } catch (err) {
            console.error('Failed to remove folder:', err);
            throw err;
        }
    }, [loadTracks, loadAllFolders]);

    const removeTrack = useCallback(async (trackId: string) => {
        try {
            await TauriAPI.removeTrack(trackId);
            setTracks(prev => prev.filter(t => t.id !== trackId));
        } catch (err) {
            console.error('Failed to remove track:', err);
            throw err;
        }
    }, []);

    return {
        tracks,
        setTracks, // Exposed for scanner updates
        libraryFolders,
        setLibraryFolders, // Exposed for updates
        loadTracks,
        loadAllTracks: loadTracks, // Alias for backward compatibility
        loadAllFolders,
        addFolder,
        removeFolder,
        removeTrack
    };
}
