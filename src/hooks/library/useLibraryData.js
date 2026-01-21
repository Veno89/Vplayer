import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TauriAPI } from '../../services/TauriAPI';
import { useErrorHandler } from '../../services/ErrorHandler';
import { useToast } from '../useToast';

/**
 * Hook to manage raw library data (tracks and folders)
 * Handles CRUD operations and database interactions
 */
export function useLibraryData() {
    const toast = useToast();
    const errorHandler = useErrorHandler(toast);

    const [tracks, setTracks] = useState([]);
    const [libraryFolders, setLibraryFolders] = useState([]);

    const loadAllTracks = useCallback(async () => {
        try {
            const dbTracks = await TauriAPI.getAllTracks();
            setTracks(dbTracks);
        } catch (err) {
            errorHandler.handle(err, 'Library - Load Tracks');
        }
    }, [errorHandler]);

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
        } catch (err) {
            errorHandler.handle(err, 'Library - Load Folders');
        }
    }, [errorHandler]);

    // Initial load
    useEffect(() => {
        const initLibrary = async () => {
            await loadAllTracks();
            await loadAllFolders();
        };
        initLibrary();
    }, [loadAllTracks, loadAllFolders]);

    const addFolder = useCallback(async () => {
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
            await loadAllTracks(); // Reload remaining tracks
            await loadAllFolders(); // Reload folders to stay in sync
        } catch (err) {
            console.error('Failed to remove folder:', err);
            throw err;
        }
    }, [loadAllTracks, loadAllFolders]);

    const removeTrack = useCallback(async (trackId) => {
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
        loadAllTracks,
        loadAllFolders,
        addFolder,
        removeFolder,
        removeTrack
    };
}
