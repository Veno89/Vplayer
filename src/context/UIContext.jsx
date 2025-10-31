import React, { createContext, useContext, useState } from 'react';

const UIContext = createContext();


export function UIProvider({ children }) {
  // Load persisted UI state
  const persisted = (() => {
    try {
      const raw = localStorage.getItem('vplayer_ui');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();

  const [windows, setWindows] = useState(persisted.windows || {
    player: { x: 40, y: 40, width: 420, height: 380, zIndex: 15, visible: true, minimized: false },
    playlist: { x: 480, y: 40, width: 400, height: 350, zIndex: 10, visible: true, minimized: false },
    library: { x: 40, y: 440, width: 400, height: 350, zIndex: 11, visible: true, minimized: false },
    equalizer: { x: 480, y: 440, width: 350, height: 220, zIndex: 12, visible: true, minimized: false },
    visualizer: { x: 850, y: 40, width: 350, height: 220, zIndex: 13, visible: true, minimized: false },
    options: { x: 850, y: 300, width: 300, height: 300, zIndex: 14, visible: true, minimized: false }
  });
  const [maxZIndex, setMaxZIndex] = useState(persisted.maxZIndex || 10);
  const [colorScheme, setColorScheme] = useState(persisted.colorScheme || 'default');
  const [currentColors, setCurrentColors] = useState(persisted.currentColors || { accent: '#fff', background: '#222' });
  const [colorSchemes, setColorSchemes] = useState(persisted.colorSchemes || [
    { name: 'default', accent: '#fff', background: '#222', primary: 'bg-cyan-500' },
    { name: 'blue', accent: '#3b82f6', background: '#1e293b', primary: 'bg-blue-500' },
    { name: 'emerald', accent: '#10b981', background: '#064e3b', primary: 'bg-emerald-500' },
    { name: 'rose', accent: '#f43f5e', background: '#881337', primary: 'bg-rose-500' },
    { name: 'amber', accent: '#f59e42', background: '#78350f', primary: 'bg-amber-500' }
  ]);
  const [debugVisible, setDebugVisible] = useState(persisted.debugVisible || false);

  // Persist UI state on change
  React.useEffect(() => {
    localStorage.setItem('vplayer_ui', JSON.stringify({
      windows,
      maxZIndex,
      colorScheme,
      currentColors,
      colorSchemes,
      debugVisible
    }));
  }, [windows, maxZIndex, colorScheme, currentColors, colorSchemes, debugVisible]);

  const value = {
    windows, setWindows,
    maxZIndex, setMaxZIndex,
    colorScheme, setColorScheme,
    currentColors, setCurrentColors,
    colorSchemes, setColorSchemes,
    debugVisible, setDebugVisible
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUIContext() {
  return useContext(UIContext);
}
