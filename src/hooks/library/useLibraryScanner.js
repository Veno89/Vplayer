import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TauriAPI } from '../../services/TauriAPI';
import { EVENTS } from '../../utils/constants';
import { useStore } from '../../store/useStore';

/**
 * Hook to manage library scanning and file watching
 * Handles background scanning processes and event listeners
 * 
 * @param {Object} libraryData - Data from useLibraryData hook
 * @param {Array} libraryData.libraryFolders - Current library folders
 * @param {Function} libraryData.loadAllTracks - Function to reload tracks
 */
export function useLibraryScanner({ libraryFolders, loadAllTracks, loadAllFolders }) {
    const autoScanOnStartup = useStore(state => state.autoScanOnStartup);
    const watchFolderChanges = useStore(state => state.watchFolderChanges);

    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanCurrent, setScanCurrent] = useState(0);
    const [scanTotal, setScanTotal] = useState(0);
    const [scanCurrentFile, setScanCurrentFile] = useState('');

    // Auto-scan state ref to avoid dependency issues
    const autoScanDoneRef = useRef(false);

    // Start folder watches and auto-scan when folders are loaded
    useEffect(() => {
        const setupWatchersAndScan = async () => {
            if (libraryFolders.length === 0) return;

            // Start watching all existing folders if enabled
            if (watchFolderChanges) {
                for (const folder of libraryFolders) {
                    try {
                        await invoke('start_folder_watch', { folderPath: folder.path });
                        console.log(`Started watching folder: ${folder.path}`);
                    } catch (err) {
                        console.error(`Failed to start watching ${folder.path}:`, err);
                    }
                }
            }

            // Auto-scan on startup if enabled (only once)
            if (autoScanOnStartup && !autoScanDoneRef.current) {
                autoScanDoneRef.current = true;
                console.log('Auto-scanning library on startup...');
                refreshFolders();
            }
        };

        setupWatchersAndScan();
    }, [libraryFolders.length, autoScanOnStartup, watchFolderChanges]);

    // Listen for scan events
    useEffect(() => {
        const unlistenPromises = [];

        // Listen for folder changes (file watcher)
        unlistenPromises.push(
            listen('folder-changed', async (event) => {
                console.log('File system change detected:', event.payload);
                // Trigger incremental scan for all folders
                try {
                    const newTracksCount = await refreshFolders();
                    if (newTracksCount > 0) {
                        console.log(`Auto-detected ${newTracksCount} new/modified track(s)`);
                    }
                } catch (err) {
                    console.error('Auto-scan failed:', err);
                }
            })
        );

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

    const refreshFolders = useCallback(async () => {
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
    const scanNewFolder = useCallback(async (path) => {
        try {
            setIsScanning(true);
            setScanProgress(0);
            setScanCurrent(0);
            setScanTotal(0);
            setScanCurrentFile('');

            await TauriAPI.scanFolder(path);

            // Start watching this folder
            try {
                await invoke('start_folder_watch', { folderPath: path });
                console.log(`Started watching folder: ${path}`);
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
