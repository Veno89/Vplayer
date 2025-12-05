import { useEffect, useRef, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/window';

const PADDING = 60; // Extra padding around windows
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const DEBOUNCE_MS = 200; // Increased for stability - resize happens after drag/resize ends

// Global drag state tracker - shared across all components
let isDraggingOrResizing = false;
let dragEndTimer = null;

/**
 * Notify auto-resize that dragging/resizing has started
 */
export function notifyDragStart() {
  isDraggingOrResizing = true;
  if (dragEndTimer) {
    clearTimeout(dragEndTimer);
    dragEndTimer = null;
  }
}

/**
 * Notify auto-resize that dragging/resizing has ended
 */
export function notifyDragEnd() {
  // Small delay to ensure window state is updated
  dragEndTimer = setTimeout(() => {
    isDraggingOrResizing = false;
  }, 50);
}

/**
 * Auto-resize main window to fit all visible windows
 * @param {Object} windows - Windows state object
 * @param {boolean} enabled - Whether auto-resize is enabled
 */
export function useAutoResize(windows, enabled) {
  const debounceTimer = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const lastResizeRef = useRef({ width: 0, height: 0 });

  const calculateAndResize = useCallback(async (force = false) => {
    // Skip resize while user is actively dragging or resizing
    if (!force && isDraggingOrResizing) {
      return;
    }

    if (!enabled || !windows) {
      return;
    }

    try {
      const visibleWindows = Object.entries(windows).filter(
        ([_, win]) => win.visible && !win.minimized
      );

      if (visibleWindows.length === 0) {
        const mainWindow = getCurrentWindow();
        await mainWindow.setSize(new LogicalSize(MIN_WIDTH, MIN_HEIGHT));
        lastResizeRef.current = { width: MIN_WIDTH, height: MIN_HEIGHT };
        return;
      }

      // Calculate bounding box for all visible windows
      let maxRight = 0;
      let maxBottom = 0;

      visibleWindows.forEach(([id, win]) => {
        const right = (win.x || 0) + (win.width || 400);
        const bottom = (win.y || 0) + (win.height || 300);
        
        maxRight = Math.max(maxRight, right);
        maxBottom = Math.max(maxBottom, bottom);
      });

      // Calculate required size with padding
      const requiredWidth = Math.max(MIN_WIDTH, maxRight + PADDING);
      const requiredHeight = Math.max(MIN_HEIGHT, maxBottom + PADDING);

      // Get current window instance
      const mainWindow = getCurrentWindow();
      
      // Check if we need to resize
      const widthDiff = Math.abs(lastResizeRef.current.width - requiredWidth);
      const heightDiff = Math.abs(lastResizeRef.current.height - requiredHeight);
      
      // Resize if forced, or if size changed by more than 5 pixels
      const needsResize = force || widthDiff > 5 || heightDiff > 5;

      if (needsResize) {
        const newSize = new LogicalSize(requiredWidth, requiredHeight);
        
        try {
          await mainWindow.setSize(newSize);
          lastResizeRef.current = { width: requiredWidth, height: requiredHeight };
        } catch (err) {
          console.error('Failed to resize window:', err);
        }
      }
    } catch (err) {
      console.error('Failed in auto-resize calculation:', err);
    }
  }, [enabled, windows]);

  // Initial setup - wait for windows to be fully loaded
  useEffect(() => {
    if (!enabled || !windows || isReady) return;

    // Check if windows have real data (not just defaults)
    const hasRealData = Object.values(windows).some(w => 
      w.x > 0 || w.y > 0 || w.width !== 400 || w.height !== 300
    );

    if (hasRealData) {
      setIsReady(true);
    }
  }, [windows, enabled, isReady]);

  // Perform initial resize when ready
  useEffect(() => {
    if (isReady && enabled) {
      // Initial resize attempts with increasing delays
      const delays = [100, 500, 1500];
      const timers = delays.map(delay => 
        setTimeout(() => calculateAndResize(true), delay)
      );
      
      return () => timers.forEach(t => clearTimeout(t));
    }
  }, [isReady, enabled, calculateAndResize]);

  // Handle subsequent window changes with debouncing
  useEffect(() => {
    if (!enabled || !isReady) return;

    // Clear any existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Debounce resize calculations
    debounceTimer.current = setTimeout(() => {
      calculateAndResize();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [windows, enabled, isReady, calculateAndResize]);

  return { 
    recalculateSize: () => calculateAndResize(true),
    isReady 
  };
}