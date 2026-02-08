import { useEffect, useRef, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/window';
import { useStore } from '../store/useStore';
import { createStore, useStore as useZustandStore } from 'zustand';
import type { WindowsState } from '../store/types';

const PADDING = 60;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const DEBOUNCE_MS = 200;
const INITIAL_SETTLE_MS = 2000;

// Zustand atom for drag/resize state — replaces module-level mutable globals
interface DragState {
  isDraggingOrResizing: boolean;
  dragEndTimer: ReturnType<typeof setTimeout> | null;
  notifyDragStart: () => void;
  notifyDragEnd: () => void;
}

const dragStore = createStore<DragState>((set, get) => ({
  isDraggingOrResizing: false,
  dragEndTimer: null,
  notifyDragStart: () => {
    const { dragEndTimer } = get();
    if (dragEndTimer) clearTimeout(dragEndTimer);
    set({ isDraggingOrResizing: true, dragEndTimer: null });
  },
  notifyDragEnd: () => {
    const timer = setTimeout(() => {
      set({ isDraggingOrResizing: false });
    }, 50);
    set({ dragEndTimer: timer });
  },
}));

/**
 * Notify auto-resize that dragging/resizing has started
 */
export function notifyDragStart(): void {
  dragStore.getState().notifyDragStart();
}

/**
 * Notify auto-resize that dragging/resizing has ended
 */
export function notifyDragEnd(): void {
  dragStore.getState().notifyDragEnd();
}

/**
 * Self-contained auto-resize hook.
 * Reads windows + autoResizeWindow from the store directly.
 * Manages Ctrl+R shortcut, initial resize timer, and debounced recalculation.
 *
 * Call this once at the app root (VPlayer).
 */
export function useAutoResize(): { recalculateSize: () => Promise<void>; isReady: boolean } {
  const windows = useStore(s => s.windows);
  const enabled = useStore(s => s.autoResizeWindow);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const lastResizeRef = useRef({ width: 0, height: 0 });

  const calculateAndResize = useCallback(async (force = false) => {
    // Skip resize while user is actively dragging or resizing
    if (!force && dragStore.getState().isDraggingOrResizing) {
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

  // Ctrl+R shortcut to recalculate
  useEffect(() => {
    if (!enabled || !isReady) return;
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'r') calculateAndResize(true);
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [enabled, isReady, calculateAndResize]);

  // Extra settle-resize after startup to catch late layout
  useEffect(() => {
    if (!enabled || !windows || !isReady) return;
    const timer = setTimeout(() => calculateAndResize(true), INITIAL_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [enabled, windows, isReady, calculateAndResize]);

  return { 
    recalculateSize: () => calculateAndResize(true),
    isReady 
  };
}