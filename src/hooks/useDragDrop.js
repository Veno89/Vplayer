import { useState, useCallback, useEffect } from 'react';

/**
 * Drag and drop hook for track management
 * Handles both internal track dragging and external file drops
 * 
 * @param {Object} params
 * @param {Function} params.addFolder - Add folder callback
 * @param {Object} params.toast - Toast notification service
 * 
 * @returns {Object} Drag and drop handlers
 * @returns {boolean} returns.isDraggingTracks - Whether tracks are being dragged
 * @returns {any} returns.dragData - Current drag data
 * @returns {Function} returns.handleDrop - Drop event handler
 * @returns {Function} returns.handleDragOver - Drag over event handler
 * @returns {Function} returns.handleLibraryDragStart - Library drag start handler
 * @returns {Function} returns.handleLibraryDragEnd - Library drag end handler
 */
export function useDragDrop({ addFolder, toast }) {
  const [isDraggingTracks, setIsDraggingTracks] = useState(false);
  const [dragData, setDragData] = useState(null);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    
    const internalData = e.dataTransfer.getData('application/json');
    if (internalData) {
      window.dispatchEvent(new CustomEvent('vplayer-track-drop', { 
        detail: { data: internalData }
      }));
      return;
    }
    
    try {
      const files = e.dataTransfer.files;
      if (files.length === 0) return;
      
      for (let i = 0; i < files.length; i++) {
        try {
          await addFolder();
          toast.showSuccess('Folder added successfully');
        } catch (err) {
          console.error('Failed to add dropped folder:', err);
          toast.showError('Failed to add folder. Please use the Add Folder button.');
        }
      }
    } catch (err) {
      console.error('Drop error:', err);
      toast.showError('Failed to process dropped files');
    }
  }, [addFolder, toast]);

  const handleDragOver = useCallback((e) => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes('application/json')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      return;
    }
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
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
    dragData,
    handleDrop,
    handleDragOver,
    handleLibraryDragStart,
    handleLibraryDragEnd
  };
}
