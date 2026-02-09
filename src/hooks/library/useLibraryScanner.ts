import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { TauriAPI } from '../../services/TauriAPI';
import { EVENTS } from '../../utils/constants';
import { log } from '../../utils/logger';
import { useStore } from '../../store/useStore';

interface LibraryFolder {
  id: string;
  path: string;
  name: string;
  dateAdded: number;
}

interface LibraryScannerParams {
  libraryFolders: LibraryFolder[];
  loadAllTracks: () => Promise<void>;
  loadAllFolders?: () => Promise<void>;
}

export interface LibraryScannerAPI {
  isScanning: boolean;
  setIsScanning: React.Dispatch<React.SetStateAction<boolean>>;
  scanProgress: number;
  scanCurrent: number;
  scanTotal: number;
  scanCurrentFile: string;
  refreshFolders: () => Promise<number>;
  scanNewFolder: (path: string) => Promise<void>;
}

/**
 * Hook to manage library scanning and file watching
 * Handles background scanning processes and event listeners
 * 
 * @param {Object} libraryData - Data from useLibraryData hook
 * @param {Array} libraryData.libraryFolders - Current library folders
 * @param {Function} libraryData.loadAllTracks - Function to reload tracks
 */
export function useLibraryScanner({ libraryFolders, loadAllTracks, loadAllFolders }: LibraryScannerParams): LibraryScannerAPI {
    const autoScanOnStartup = useStore(state => state.autoScanOnStartup);
    const watchFolderChanges = useStore(state => state.watchFolderChanges);

    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanCurrent, setScanCurrent] = useState(0);
    const [scanTotal, setScanTotal] = useState(0);
    const [scanCurrentFile, setScanCurrentFile] = useState('');

    // Auto-scan state ref to avoid dependency issues
    const autoScanDoneRef = useRef(false);
    // Ref to always hold the latest refreshFolders callback (avoids stale closures in event listeners)
    const refreshFoldersRef = useRef<() => Promise<number>>(async () => 0);

    // Start folder watches and auto-scan when folders are loaded
    useEffect(() => {
        const setupWatchersAndScan = async () => {
            if (libraryFolders.length === 0) return;

            // Start watching all existing folders if enabled
            if (watchFolderChanges) {
                for (const folder of libraryFolders) {
                    try {
                        await TauriAPI.startFolderWatch(folder.path);
                        log.info(`Started watching folder: ${folder.path}`);
                    } catch (err) {
                        console.error(`Failed to start watching ${folder.path}:`, err);
                    }
                }
            }

            // Auto-scan on startup if enabled (only once)
            if (autoScanOnStartup && !autoScanDoneRef.current) {
                autoScanDoneRef.current = true;
                log.info('Auto-scanning library on startup...');
                refreshFolders();
            }
        };

        setupWatchersAndScan();
    }, [libraryFolders.length, autoScanOnStartup, watchFolderChanges]);

    // Listen for scan events
    useEffect(() => {
        const unlistenPromises: Promise<() => void>[] = [];

        // Listen for folder changes (file watcher)
        unlistenPromises.push(
            listen('folder-changed', async (event) => {
                log.info('File system change detected:', event.payload);
                // Use ref to call the latest refreshFolders (avoids stale closure)
                try {
                    const newTracksCount = await refreshFoldersRef.current();
                    if (newTracksCount > 0) {
                        log.info(`Auto-detected ${newTracksCount} new/modified track(s)`);
                    }
                } catch (err) {
                    console.error('Auto-scan failed:', err);
                }
            })
        );

        // Listen for total files count
        unlistenPromises.push(
            TauriAPI.onEvent<number>(EVENTS.SCAN_TOTAL, (event) => {
                setScanTotal(event.payload);
                setScanCurrent(0);
                setScanProgress(0);
            })
        );

        // Listen for progress updates
        unlistenPromises.push(
            TauriAPI.onEvent<{ current: number; total: number; current_file: string }>(EVENTS.SCAN_PROGRESS, (event) => {
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
            TauriAPI.onEvent<number>(EVENTS.SCAN_COMPLETE, (event) => {
                log.info(`Scan complete: ${event.payload} tracks found`);
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
            TauriAPI.onEvent<number>(EVENTS.SCAN_CANCELLED, (event) => {
                log.info(`Scan cancelled: ${event.payload} tracks processed`);
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
            TauriAPI.onEvent<string>(EVENTS.SCAN_ERROR, (event) => {
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

    // Keep the ref in sync with the latest refreshFolders callback
    useEffect(() => {
        refreshFoldersRef.current = refreshFolders;
    });

    const refreshFolders = useCallback(async (): Promise<number> => {
        try {
            setIsScanning(true);
            setScanProgress(0);
            setScanCurrent(0);
            setScanTotal(0);
            setScanCurrentFile('');

            let totalNewTracks = 0;

            // Incrementally scan each folder
            // Determine which folders to scan - if we call this during init, we might not have libraryFolders yet
            // so this relies on libraryData keeping them updated.
            for (const folder of libraryFolders) {
                const scannedTracks = await TauriAPI.scanFolderIncremental(folder.path);
                totalNewTracks += scannedTracks.length;
            }

            // Reload all tracks from database to reflect changes
            await loadAllTracks();

            return totalNewTracks;
        } catch (err) {
            console.error('Failed to refresh folders:', err);
            throw err;
        } finally {
            setIsScanning(false);
        }
    }, [libraryFolders, loadAllTracks]);

    // Manually scan a single new folder (used when adding a folder)
    const scanNewFolder = useCallback(async (path: string) => {
        try {
            setIsScanning(true);
            setScanProgress(0);
            setScanCurrent(0);
            setScanTotal(0);
            setScanCurrentFile('');

            await TauriAPI.scanFolder(path);

            // Start watching this folder
            try {
                await TauriAPI.startFolderWatch(path);
                log.info(`Started watching folder: ${path}`);
            } catch (err) {
                console.error('Failed to start folder watch:', err);
            }

            // Reload tracks AND folders to ensure UI update
            await loadAllTracks();
            if (loadAllFolders) await loadAllFolders();
        } catch (err) {
            console.error('Failed to scan new folder:', err);
        } finally {
            setIsScanning(false);
        }
    }, [loadAllTracks]);

    return {
        isScanning,
        setIsScanning, // Exposed if needed
        scanProgress,
        scanCurrent,
        scanTotal,
        scanCurrentFile,
        refreshFolders,
        scanNewFolder
    };
}
