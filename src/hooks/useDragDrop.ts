import { useState, useCallback, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { log } from '../utils/logger';
import { TauriAPI } from '../services/TauriAPI';
import { useStore } from '../store/useStore';
import type { ToastService, Track } from '../types';

interface DragDropParams {
  addFolder?: () => Promise<{ path: string } | null>;
  refreshTracks?: () => Promise<void>;
  toast?: ToastService;
}

export interface DragDropAPI {
  isDraggingTracks: boolean;
  isDraggingExternal: boolean;
  dragData: unknown;
  handleDrop: (e: React.DragEvent) => Promise<void>;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleLibraryDragStart: (data: unknown) => void;
  handleLibraryDragEnd: () => void;
}

/**
 * Drag and drop hook for track management
 * Handles both internal track dragging and external file drops
 * 
 * Supported external drops:
 * - Audio files (.mp3, .flac, .wav, .ogg, .m4a, .aac, .wma)
 * - Folders containing audio files
 * 
 * @param {Object} params
 * @param {Function} params.addFolder - Add folder callback
 * @param {Function} params.refreshTracks - Refresh tracks after import
 * @param {Object} params.toast - Toast notification service
 * 
 * @returns {Object} Drag and drop handlers
 * @returns {boolean} returns.isDraggingTracks - Whether tracks are being dragged
 * @returns {boolean} returns.isDraggingExternal - Whether external files are being dragged over
 * @returns {any} returns.dragData - Current drag data
 * @returns {Function} returns.handleDrop - Drop event handler
 * @returns {Function} returns.handleDragOver - Drag over event handler
 * @returns {Function} returns.handleLibraryDragStart - Library drag start handler
 * @returns {Function} returns.handleLibraryDragEnd - Library drag end handler
 */
export function useDragDrop({ addFolder, refreshTracks, toast }: DragDropParams): DragDropAPI {
  const isDraggingTracks = useStore(s => s.isDraggingTracks);
  const setIsDraggingTracks = useStore(s => s.setIsDraggingTracks);
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);
  const [dragData, setDragData] = useState<unknown>(null);
  const [tauriDropHandled, setTauriDropHandled] = useState(false);

  // Listen for Tauri file drop events
  useEffect(() => {
    let unlisten;

    const setupDropListener = async () => {
      try {
        const currentWindow = getCurrentWindow();
        unlisten = await currentWindow.onDragDropEvent(async (event) => {
          if (event.payload.type === 'hover') {
            setIsDraggingExternal(true);
          } else if (event.payload.type === 'drop') {
            setIsDraggingExternal(false);
            setTauriDropHandled(true);
            // Reset the flag after a short delay
            setTimeout(() => setTauriDropHandled(false), 500);

            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              log.info('Files dropped via Tauri:', paths);

              // Collect all new tracks from scanning
              const newTrackIds = [];
              let foldersAdded = 0;
              let filesAdded = 0;

              // Use Set to avoid duplicate paths
              const uniquePaths = new Set(paths);

              for (const path of uniquePaths) {
                // Check if path is a directory by seeing if it doesn't have a common audio extension
                const isFolder = !path.match(/\.(mp3|flac|wav|ogg|m4a|aac|wma|opus)$/i);

                if (isFolder) {
                  // Scan folder incrementally and collect new track IDs
                  try {
                    const scannedTracks = await TauriAPI.scanFolderIncremental(path);
                    if (scannedTracks && Array.isArray(scannedTracks)) {
                      scannedTracks.forEach(track => {
                        if (track.id) newTrackIds.push(track.id);
                      });
                    }
                    foldersAdded++;
                  } catch (err) {
                    console.error('Failed to scan folder:', path, err);
                  }
                } else {
                  // For individual files, we could add them to library
                  // For now just count them - full implementation would require single file import
                  filesAdded++;
                }
              }

              // Limit the number of tracks to prevent freezing
              const MAX_TRACKS_PER_DROP = 100;
              if (newTrackIds.length > MAX_TRACKS_PER_DROP) {
                toast?.showError(`Too many tracks (${newTrackIds.length}). Maximum ${MAX_TRACKS_PER_DROP} tracks per drop.`);
                return;
              }

              // Refresh library to get all tracks
              if (refreshTracks) {
                await refreshTracks();
              }

              // Emit event with new track IDs for playlist to handle
              if (newTrackIds.length > 0) {
                window.dispatchEvent(new CustomEvent('vplayer-external-tracks-added', {
                  detail: { trackIds: newTrackIds }
                }));
              }

              // Show notification
              if (foldersAdded > 0) {
                toast?.showSuccess(`Added ${foldersAdded} folder(s) to library`);
              } else if (filesAdded > 0) {
                toast?.showInfo(`Dropped ${filesAdded} file(s). Use "Add Folder" for best results.`);
              }
            }
          } else if (event.payload.type === 'cancel') {
            setIsDraggingExternal(false);
          }
        });
      } catch (err) {
        log.debug('Tauri drag-drop not available:', err);
      }
    };

    setupDropListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [refreshTracks, toast]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingExternal(false);

    // If Tauri already handled this drop, don't show the message
    if (tauriDropHandled) {
      return;
    }

    const internalData = e.dataTransfer.getData('application/json');
    if (internalData) {
      window.dispatchEvent(new CustomEvent('vplayer-track-drop', {
        detail: { data: internalData }
      }));
      return;
    }

    // For web file drops (non-Tauri), the Tauri handler should have picked it up
    // Only show this if we're somehow in a browser-only context
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // Don't show confusing message - Tauri should handle it
      log.debug('Web drop detected, Tauri should handle this');
    }
  }, [tauriDropHandled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes('application/json')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      return;
    }

    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingExternal(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only reset if leaving the window entirely
    if (!e.relatedTarget || e.relatedTarget.nodeName === 'HTML') {
      setIsDraggingExternal(false);
    }
  }, []);

  const handleLibraryDragStart = useCallback((data: unknown) => {
    // Defer state updates to avoid re-render during drag initialization
    setTimeout(() => {
      setIsDraggingTracks(true);
      setDragData(data);
    }, 0);
  }, []);

  const handleLibraryDragEnd = useCallback(() => {
    setIsDraggingTracks(false);
    setDragData(null);
  }, []);

  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      log.info('[useDragDrop] Global dragover fired');
      e.preventDefault();
      const types = Array.from(e.dataTransfer.types);
      if (types.includes('application/json')) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    document.addEventListener('dragover', handleGlobalDragOver);

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
    };
  }, []);

  return {
    isDraggingTracks,
    isDraggingExternal,
    dragData,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleLibraryDragStart,
    handleLibraryDragEnd
  };
}
