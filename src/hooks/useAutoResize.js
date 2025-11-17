import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/window';

const PADDING = 60; // Extra padding around windows
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const DEBOUNCE_MS = 100;

/**
 * Auto-resize main window to fit all visible windows
 * @param {Object} windows - Windows state object
 * @param {boolean} enabled - Whether auto-resize is enabled
 */
export function useAutoResize(windows, enabled) {
  const debounceTimer = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const lastResizeRef = useRef({ width: 0, height: 0 });
  const resizeAttempts = useRef(0);

  const calculateAndResize = async (force = false) => {
    if (!enabled || !windows) {
      console.log('Auto-resize skipped: enabled=', enabled, 'windows=', !!windows);
      return;
    }

    try {
      // Log all window states for debugging
      console.log('=== AUTO-RESIZE CALCULATION ===');
      console.log('Visible windows:', 
        Object.entries(windows)
          .filter(([_, w]) => w.visible && !w.minimized)
          .map(([id, w]) => ({
            id,
            x: w.x,
            y: w.y,
            width: w.width,
            height: w.height,
            right: w.x + w.width,
            bottom: w.y + w.height
          }))
      );

      const visibleWindows = Object.entries(windows).filter(
        ([_, win]) => win.visible && !win.minimized
      );

      if (visibleWindows.length === 0) {
        console.log('No visible windows, setting minimum size');
        const mainWindow = getCurrentWindow();
        await mainWindow.setSize(new LogicalSize(MIN_WIDTH, MIN_HEIGHT));
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
        
        console.log(`Window ${id}: right=${right}, bottom=${bottom}`);
      });

      // Calculate required size with padding
      const requiredWidth = Math.max(MIN_WIDTH, maxRight + PADDING);
      const requiredHeight = Math.max(MIN_HEIGHT, maxBottom + PADDING);

      console.log(`Required size: ${requiredWidth}x${requiredHeight}`);

      // Get current window instance
      const mainWindow = getCurrentWindow();
      
      // Get current size
      let currentSize;
      try {
        currentSize = await mainWindow.innerSize();
        console.log(`Current inner size: ${currentSize.width}x${currentSize.height}`);
      } catch (e) {
        console.warn('Could not get inner size, trying outer size');
        currentSize = await mainWindow.outerSize();
        console.log(`Current outer size: ${currentSize.width}x${currentSize.height}`);
      }
      
      // Check if we need to resize (always resize if force is true)
      const needsResize = force ||
        currentSize.width < requiredWidth ||
        currentSize.height < requiredHeight ||
        Math.abs(lastResizeRef.current.width - requiredWidth) > 10 ||
        Math.abs(lastResizeRef.current.height - requiredHeight) > 10;

      if (needsResize) {
        console.log(`Resizing window from ${currentSize.width}x${currentSize.height} to ${requiredWidth}x${requiredHeight}`);
        
        // Use LogicalSize for consistent sizing across different DPI scales
        const newSize = new LogicalSize(requiredWidth, requiredHeight);
        
        try {
          await mainWindow.setSize(newSize);
          lastResizeRef.current = { width: requiredWidth, height: requiredHeight };
          console.log(`✅ Successfully resized window to ${requiredWidth}x${requiredHeight}`);
          
          // Verify the resize worked
          setTimeout(async () => {
            try {
              const verifySize = await mainWindow.innerSize();
              console.log(`Verified size after resize: ${verifySize.width}x${verifySize.height}`);
              
              // If it didn't resize properly, try again (up to 3 times)
              if ((verifySize.width < requiredWidth - 10 || verifySize.height < requiredHeight - 10) && resizeAttempts.current < 3) {
                resizeAttempts.current++;
                console.log(`Resize verification failed, attempting again (attempt ${resizeAttempts.current}/3)`);
                calculateAndResize(true);
              } else {
                resizeAttempts.current = 0;
              }
            } catch (e) {
              console.warn('Could not verify resize:', e);
            }
          }, 100);
        } catch (err) {
          console.error('Failed to resize window:', err);
          
          // Try alternative approach - set min size first, then size
          try {
            console.log('Trying alternative resize approach...');
            await mainWindow.setMinSize(new LogicalSize(requiredWidth, requiredHeight));
            await mainWindow.setSize(new LogicalSize(requiredWidth, requiredHeight));
            console.log('Alternative resize succeeded');
          } catch (altErr) {
            console.error('Alternative resize also failed:', altErr);
          }
        }
      } else {
        console.log('No resize needed');
      }
      
      console.log('=== END AUTO-RESIZE ===');
    } catch (err) {
      console.error('Failed in auto-resize calculation:', err);
    }
  };

  // Initial setup - wait for windows to be fully loaded
  useEffect(() => {
    if (!enabled || !windows || isReady) return;

    // Check if windows have real data (not just defaults)
    const hasRealData = Object.values(windows).some(w => 
      w.x > 0 || w.y > 0 || w.width !== 400 || w.height !== 300
    );

    if (hasRealData) {
      console.log('Windows have real data, marking as ready');
      setIsReady(true);
    }
  }, [windows, enabled, isReady]);

  // Perform initial resize when ready
  useEffect(() => {
    if (isReady && enabled) {
      console.log('🚀 Performing initial auto-resize');
      // Multiple attempts with increasing delays to ensure everything is loaded
      const delays = [250, 1000, 2000];
      delays.forEach(delay => {
        setTimeout(() => {
          console.log(`Initial resize attempt at ${delay}ms`);
          calculateAndResize(true);
        }, delay);
      });
    }
  }, [isReady, enabled]);

  // Handle subsequent window changes
  useEffect(() => {
    if (!enabled || !isReady) return;

    // Clear any existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Debounce resize calculations for changes after initial load
    debounceTimer.current = setTimeout(() => {
      console.log('Window state changed, recalculating size');
      calculateAndResize();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [windows, enabled, isReady]);

  return { 
    recalculateSize: () => {
      resizeAttempts.current = 0;
      calculateAndResize(true);
    },
    isReady 
  };
}