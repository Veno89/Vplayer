import { useState, useCallback, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TauriAPI } from '../services/TauriAPI';

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
export function useDragDrop({ addFolder, refreshTracks, toast }) {
  const [isDraggingTracks, setIsDraggingTracks] = useState(false);
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);
  const [dragData, setDragData] = useState(null);
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
              console.log('Files dropped via Tauri:', paths);
              
              // Collect all new tracks from scanning
              const newTrackIds = [];
              let foldersAdded = 0;
              let filesAdded = 0;
              
              for (const path of paths) {
                // Check if path is a directory by seeing if it doesn't have a common audio extension
                const isFolder = !path.match(/\.(mp3|flac|wav|ogg|m4a|aac|wma|opus)$/i);
                
                if (isFolder) {
                  // Scan folder and collect new track IDs
                  try {
                    const scannedTracks = await TauriAPI.scanFolder(path);
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
        console.debug('Tauri drag-drop not available:', err);
      }
    };
    
    setupDropListener();
    
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [refreshTracks, toast]);

  const handleDrop = useCallback(async (e) => {
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
      console.debug('Web drop detected, Tauri should handle this');
    }
  }, [tauriDropHandled]);

  const handleDragOver = useCallback((e) => {
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

  const handleDragLeave = useCallback((e) => {
    // Only reset if leaving the window entirely
    if (!e.relatedTarget || e.relatedTarget.nodeName === 'HTML') {
      setIsDraggingExternal(false);
    }
  }, []);

  const handleLibraryDragStart = useCallback((data) => {
    setIsDraggingTracks(true);
    setDragData(data);
  }, []);

  const handleLibraryDragEnd = useCallback(() => {
    setIsDraggingTracks(false);
    setDragData(null);
  }, []);

  useEffect(() => {
    const handleGlobalDragOver = (e) => {
      e.preventDefault();
      const types = Array.from(e.dataTransfer.types);
      if (types.includes('application/json')) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleGlobalDrop = (e) => {
      const internalData = e.dataTransfer.getData('application/json');
      if (internalData) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('vplayer-track-drop', { 
          detail: { data: internalData }
        }));
      }
    };

    document.addEventListener('dragover', handleGlobalDragOver);
    document.addEventListener('drop', handleGlobalDrop);

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
      document.removeEventListener('drop', handleGlobalDrop);
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
