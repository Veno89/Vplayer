import { useState } from 'react';

/**
 * useWindows manages window state, z-index, visibility, drag, and resize logic.
 */
export function useWindows(initialWindows) {
  const [windows, setWindows] = useState(initialWindows);
  const [maxZIndex, setMaxZIndex] = useState(
    Math.max(...Object.values(initialWindows).map(w => w.zIndex || 0))
  );

  const toggleWindow = (windowId) => {
    setWindows((prev) => ({
      ...prev,
      [windowId]: { ...prev[windowId], visible: !prev[windowId].visible }
    }));
  };

  const bringToFront = (windowId) => {
    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);
    setWindows((prev) => ({
      ...prev,
      [windowId]: { ...prev[windowId], zIndex: newZIndex }
    }));
  };

  const setWindowState = (windowId, newState) => {
    setWindows((prev) => ({
      ...prev,
      [windowId]: { ...prev[windowId], ...newState }
    }));
  };

  return {
    windows,
    setWindows,
    maxZIndex,
    setMaxZIndex,
    toggleWindow,
    bringToFront,
    setWindowState,
  };
}
