import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const PADDING = 20; // Padding around windows
const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const DEBOUNCE_MS = 500;

/**
 * Auto-resize main window to fit all visible windows
 * @param {Object} windows - Windows state object
 * @param {boolean} enabled - Whether auto-resize is enabled
 */
export function useAutoResize(windows, enabled) {
  const debounceTimer = useRef(null);

  useEffect(() => {
    if (!enabled || !windows) return;

    // Debounce resize calculations
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const visibleWindows = Object.entries(windows).filter(
          ([_, win]) => win.visible && !win.minimized
        );

        if (visibleWindows.length === 0) return;

        // Calculate bounding box
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        visibleWindows.forEach(([_, win]) => {
          minX = Math.min(minX, win.x);
          minY = Math.min(minY, win.y);
          maxX = Math.max(maxX, win.x + win.width);
          maxY = Math.max(maxY, win.y + win.height);
        });

        // Add padding
        const requiredWidth = Math.max(MIN_WIDTH, maxX - minX + PADDING * 2);
        const requiredHeight = Math.max(MIN_HEIGHT, maxY - minY + PADDING * 2);

        // Get current window
        const mainWindow = getCurrentWindow();
        const currentSize = await mainWindow.outerSize();

        // Only resize if difference is significant (>50px)
        const widthDiff = Math.abs(currentSize.width - requiredWidth);
        const heightDiff = Math.abs(currentSize.height - requiredHeight);

        if (widthDiff > 50 || heightDiff > 50) {
          await mainWindow.setSize({
            width: requiredWidth,
            height: requiredHeight,
          });
        }
      } catch (err) {
        console.warn('Failed to auto-resize window:', err);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [windows, enabled]);
}
