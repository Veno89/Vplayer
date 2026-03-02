import { useState, useEffect, useCallback, useRef } from 'react';
import { TauriAPI } from '../../services/TauriAPI';
import { log } from '../../utils/logger';
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
export function useLibraryData(filterParams: TrackFilter | null = null): LibraryDataAPI {
    const toast = useToast();
    const errorHandler = useErrorHandler(toast);

    const [tracks, setTracks] = useState<Track[]>([]);
    const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>([]);
    const pageCacheRef = useRef<Map<string, Track[]>>(new Map());
    const totalCacheRef = useRef<Map<string, number>>(new Map());

    const getFilterKey = useCallback((params: TrackFilter | null): string => {
        return JSON.stringify(params || {});
    }, []);

    const getPageKey = useCallback((filterKey: string, offset: number, limit: number): string => {
        return `${filterKey}::${offset}::${limit}`;
    }, []);

    const clearPageCache = useCallback(() => {
        pageCacheRef.current.clear();
        totalCacheRef.current.clear();
    }, []);

    const normalizeTracks = useCallback((value: unknown): Track[] => {
        return Array.isArray(value) ? (value as Track[]) : [];
    }, []);

    const loadTracks = useCallback(async () => {
        try {
            // Transitional M3 step: fetch in pages to avoid one monolithic IPC payload
            // while keeping existing behavior (full filtered result in memory).
            const params = (filterParams || {}) as TrackFilter;
            const filterKey = getFilterKey(params);
            const pageSize = 1000;
            let offset = 0;
            let total = totalCacheRef.current.get(filterKey) ?? Number.POSITIVE_INFINITY;
            const allTracks: Track[] = [];
            let firstPageRendered = false;

            // Clear previous filtered view immediately so the UI reflects query changes.
            setTracks([]);

            while (offset < total) {
                const pageKey = getPageKey(filterKey, offset, pageSize);
                let pageTracks = pageCacheRef.current.get(pageKey);

                if (!pageTracks) {
                    const page = await TauriAPI.getTracksPage(offset, pageSize, params);
                    if (!page || !Array.isArray(page.tracks)) {
                        // Compatibility fallback during M3 transition: tests/mocks and
                        // older backends may not provide paged response shape.
                        log.warn('Paged track response invalid, falling back to non-paged track query');
                        const fallbackRaw = Object.keys(params).length > 0
                            ? await TauriAPI.getFilteredTracks(params)
                            : await TauriAPI.getAllTracks();
                        const fallbackTracks = normalizeTracks(fallbackRaw);
                        setTracks(fallbackTracks);
                        totalCacheRef.current.set(filterKey, fallbackTracks.length);
                        return;
                    }

                    pageTracks = page.tracks;
                    pageCacheRef.current.set(pageKey, pageTracks);
                    const pageTotal = typeof page.total === 'number' && page.total >= 0
                        ? page.total
                        : offset + pageTracks.length;
                    totalCacheRef.current.set(filterKey, pageTotal);
                    total = pageTotal;

                    // Keep cache bounded for long sessions.
                    if (pageCacheRef.current.size > 200) {
                        clearPageCache();
                    }
                }

                allTracks.push(...pageTracks);
                if (!firstPageRendered) {
                    setTracks([...allTracks]);
                    firstPageRendered = true;
                }
                offset += pageTracks.length;

                // Safety break for inconsistent backend responses.
                if (pageTracks.length === 0) break;
            }

            setTracks(allTracks);
        } catch (err) {
            errorHandler.handle(err, 'Library - Load Tracks');
        }
    }, [clearPageCache, errorHandler, filterParams, getFilterKey, getPageKey, normalizeTracks]);

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

            const folderName = selected.split(/[\\/]/).pop() ?? '';
            const newFolder: LibraryFolder = {
                id: `folder_${crypto.randomUUID()}`,
                name: folderName,
                path: selected,
                dateAdded: Date.now(),
            };

            // Add to state immediately for responsiveness
            setLibraryFolders(prev => [...prev, newFolder]);
            clearPageCache();

            // Return details for the scanner to use
            return { path: selected, newFolder };
        } catch (err) {
            console.error('Failed to add folder:', err);
            throw err;
        }
    }, [clearPageCache, libraryFolders, toast]);

    const removeFolder = useCallback(async (folderId: string, folderPath: string) => {
        try {
            // Stop watching this folder
            try {
                await TauriAPI.stopFolderWatch(folderPath);
                log.info(`Stopped watching folder: ${folderPath}`);
            } catch (err) {
                console.error('Failed to stop folder watch:', err);
            }

            await TauriAPI.removeFolder(folderId, folderPath);
            clearPageCache();
            setLibraryFolders(prev => prev.filter(f => f.id !== folderId));
            await loadTracks(); // Reload remaining tracks (filtered)
            await loadAllFolders(); // Reload folders to stay in sync
        } catch (err) {
            console.error('Failed to remove folder:', err);
            throw err;
        }
    }, [clearPageCache, loadTracks, loadAllFolders]);

    const removeTrack = useCallback(async (trackId: string) => {
        try {
            await TauriAPI.removeTrack(trackId);
            clearPageCache();
            setTracks(prev => prev.filter(t => t.id !== trackId));
        } catch (err) {
            console.error('Failed to remove track:', err);
            throw err;
        }
    }, [clearPageCache]);

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
