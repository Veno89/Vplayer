import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const UIContext = createContext();

// Enhanced color schemes matching OptionsWindow
const COLOR_SCHEMES = {
  default: { name: 'default', label: 'Classic', accent: 'text-white', background: '#1e293b', primary: 'bg-cyan-500', color: '#06b6d4' },
  blue: { name: 'blue', label: 'Ocean Blue', accent: 'text-blue-400', background: '#1e3a8a', primary: 'bg-blue-500', color: '#3b82f6' },
  emerald: { name: 'emerald', label: 'Forest Green', accent: 'text-emerald-400', background: '#064e3b', primary: 'bg-emerald-500', color: '#10b981' },
  rose: { name: 'rose', label: 'Sunset Rose', accent: 'text-rose-400', background: '#881337', primary: 'bg-rose-500', color: '#f43f5e' },
  amber: { name: 'amber', label: 'Golden Amber', accent: 'text-amber-400', background: '#78350f', primary: 'bg-amber-500', color: '#f59e0b' },
  purple: { name: 'purple', label: 'Royal Purple', accent: 'text-purple-400', background: '#581c87', primary: 'bg-purple-500', color: '#a855f7' },
  pink: { name: 'pink', label: 'Bubblegum Pink', accent: 'text-pink-400', background: '#831843', primary: 'bg-pink-500', color: '#ec4899' },
  indigo: { name: 'indigo', label: 'Deep Indigo', accent: 'text-indigo-400', background: '#312e81', primary: 'bg-indigo-500', color: '#6366f1' },
  teal: { name: 'teal', label: 'Ocean Teal', accent: 'text-teal-400', background: '#134e4a', primary: 'bg-teal-500', color: '#14b8a6' },
  orange: { name: 'orange', label: 'Tangerine', accent: 'text-orange-400', background: '#7c2d12', primary: 'bg-orange-500', color: '#f97316' },
  slate: { name: 'slate', label: 'Midnight Slate', accent: 'text-slate-300', background: '#0f172a', primary: 'bg-slate-600', color: '#475569' },
  red: { name: 'red', label: 'Cherry Red', accent: 'text-red-400', background: '#7f1d1d', primary: 'bg-red-500', color: '#ef4444' },
};

// Layout templates for different viewing modes
const LAYOUT_TEMPLATES = {
  full: {
    name: 'full',
    label: 'Full Layout',
    description: 'All windows visible, non-overlapping grid',
    windows: {
      player: { x: 40, y: 40, width: 420, height: 400, visible: true, minimized: false },
      playlist: { x: 480, y: 40, width: 480, height: 520, visible: true, minimized: false },
      library: { x: 980, y: 40, width: 450, height: 520, visible: true, minimized: false },
      equalizer: { x: 40, y: 460, width: 420, height: 300, visible: true, minimized: false },
      visualizer: { x: 480, y: 580, width: 480, height: 180, visible: true, minimized: false }
    }
  },
  compact: {
    name: 'compact',
    label: 'Compact Layout',
    description: 'Player, playlist, and visualizer focused',
    windows: {
      player: { x: 40, y: 40, width: 420, height: 400, visible: true, minimized: false },
      playlist: { x: 480, y: 40, width: 540, height: 580, visible: true, minimized: false },
      visualizer: { x: 40, y: 460, width: 420, height: 160, visible: true, minimized: false },
      library: { x: 1040, y: 40, width: 450, height: 580, visible: false, minimized: false },
      equalizer: { x: 1040, y: 440, width: 420, height: 300, visible: false, minimized: false }
    }
  },
  mini: {
    name: 'mini',
    label: 'Mini Player',
    description: 'Player window only, minimal interface',
    windows: {
      player: { x: 40, y: 40, width: 420, height: 400, visible: true, minimized: false },
      playlist: { x: 480, y: 40, width: 480, height: 520, visible: false, minimized: false },
      library: { x: 980, y: 40, width: 450, height: 520, visible: false, minimized: false },
      equalizer: { x: 40, y: 460, width: 420, height: 300, visible: false, minimized: false },
      visualizer: { x: 480, y: 580, width: 480, height: 180, visible: false, minimized: false }
    }
  }
};

export function UIProvider({ children }) {
  // Load persisted UI state
  const persisted = (() => {
    try {
      const raw = localStorage.getItem('vplayer_ui');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();

  // Initialize with full layout on first run, otherwise use persisted
  const isFirstRun = !persisted.currentLayout;
  const initialLayout = isFirstRun ? 'full' : persisted.currentLayout;
  const initialWindows = isFirstRun 
    ? (() => {
        const fullLayout = LAYOUT_TEMPLATES.full.windows;
        const windowsWithZIndex = {};
        let zIndex = 10;
        Object.keys(fullLayout).forEach(key => {
          windowsWithZIndex[key] = { ...fullLayout[key], zIndex: zIndex++ };
        });
        return windowsWithZIndex;
      })()
    : persisted.windows || {
        player: { x: 40, y: 40, width: 420, height: 400, zIndex: 15, visible: true, minimized: false },
        playlist: { x: 480, y: 40, width: 480, height: 520, zIndex: 10, visible: true, minimized: false },
        library: { x: 980, y: 40, width: 450, height: 520, zIndex: 11, visible: true, minimized: false },
        equalizer: { x: 40, y: 460, width: 420, height: 300, zIndex: 12, visible: true, minimized: false },
        visualizer: { x: 480, y: 580, width: 480, height: 180, zIndex: 13, visible: true, minimized: false },
        options: { x: 980, y: 580, width: 480, height: 420, zIndex: 14, visible: true, minimized: false },
        queue: { x: 500, y: 60, width: 500, height: 500, zIndex: 16, visible: false, minimized: false },
        history: { x: 520, y: 80, width: 520, height: 520, zIndex: 17, visible: false, minimized: false },
        albums: { x: 540, y: 100, width: 700, height: 600, zIndex: 18, visible: false, minimized: false },
        smartPlaylists: { x: 560, y: 120, width: 680, height: 580, zIndex: 19, visible: false, minimized: false }
      };

  const [windows, setWindows] = useState(initialWindows);
  const [maxZIndex, setMaxZIndex] = useState(persisted.maxZIndex || 15);
  const [colorScheme, setColorScheme] = useState(persisted.colorScheme || 'default');
  const [customThemes, setCustomThemes] = useState(persisted.customThemes || {});
  const [debugVisible, setDebugVisible] = useState(persisted.debugVisible || false);
  const [currentLayout, setCurrentLayout] = useState(initialLayout);
  
  // Background image and window appearance settings
  const [backgroundImage, setBackgroundImage] = useState(persisted.backgroundImage || null);
  const [backgroundBlur, setBackgroundBlur] = useState(persisted.backgroundBlur || 10);
  const [backgroundOpacity, setBackgroundOpacity] = useState(persisted.backgroundOpacity || 0.3);
  const [windowOpacity, setWindowOpacity] = useState(persisted.windowOpacity || 0.95);
  const [fontSize, setFontSize] = useState(persisted.fontSize || 14);

  // Get current colors based on scheme (check custom themes first)
  const currentColors = customThemes[colorScheme] || COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.default;
  const colorSchemes = { ...COLOR_SCHEMES, ...customThemes };

  const saveTimeoutRef = useRef(null);

  // Update color scheme and persist
  const updateColorScheme = (schemeName) => {
    if (COLOR_SCHEMES[schemeName]) {
      setColorScheme(schemeName);
    }
  };

  // Apply layout template
  const applyLayout = (layoutName) => {
    const template = LAYOUT_TEMPLATES[layoutName];
    if (!template) return;

    setWindows(prevWindows => {
      const newWindows = { ...prevWindows };
      let highestZ = maxZIndex;

      // Apply template positions and visibility (excluding options window)
      Object.keys(template.windows).forEach((windowId) => {
        const templateWindow = template.windows[windowId];
        if (newWindows[windowId]) {
          newWindows[windowId] = {
            ...newWindows[windowId],
            ...templateWindow,
            zIndex: templateWindow.visible ? ++highestZ : newWindows[windowId].zIndex
          };
        }
      });

      // Ensure options window maintains its position and size
      if (newWindows.options) {
        newWindows.options = {
          ...newWindows.options,
          width: Math.max(newWindows.options.width, 480),
          height: Math.max(newWindows.options.height, 420)
        };
      }

      setMaxZIndex(highestZ);
      return newWindows;
    });

    setCurrentLayout(layoutName);
  };

  // Debounced persist UI state
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem('vplayer_ui', JSON.stringify({
          windows,
          maxZIndex,
          colorScheme,
          customThemes,
          debugVisible,
          currentLayout,
          backgroundImage,
          backgroundBlur,
          backgroundOpacity,
          windowOpacity,
          fontSize
        }));
      } catch (err) {
        console.warn('Failed to persist UI state:', err);
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [windows, maxZIndex, colorScheme, customThemes, debugVisible, currentLayout, backgroundImage, backgroundBlur, backgroundOpacity, windowOpacity, fontSize]);

  // Custom theme management
  const saveCustomTheme = (theme) => {
    const themeKey = theme.name.toLowerCase().replace(/\s+/g, '-');
    setCustomThemes(prev => ({
      ...prev,
      [themeKey]: theme
    }));
  };

  const deleteCustomTheme = (themeName) => {
    const themeKey = themeName.toLowerCase().replace(/\s+/g, '-');
    setCustomThemes(prev => {
      const newThemes = { ...prev };
      delete newThemes[themeKey];
      return newThemes;
    });
    // If currently using deleted theme, switch to default
    if (colorScheme === themeKey) {
      setColorScheme('default');
    }
  };

  const applyCustomTheme = (theme) => {
    const themeKey = theme.name.toLowerCase().replace(/\s+/g, '-');
    setColorScheme(themeKey);
  };

  const value = {
    windows, setWindows,
    maxZIndex, setMaxZIndex,
    colorScheme, setColorScheme: updateColorScheme,
    currentColors,
    colorSchemes,
    customThemes,
    saveCustomTheme,
    deleteCustomTheme,
    applyCustomTheme,
    debugVisible, setDebugVisible,
    currentLayout,
    layouts: Object.values(LAYOUT_TEMPLATES),
    applyLayout,
    backgroundImage, setBackgroundImage,
    backgroundBlur, setBackgroundBlur,
    backgroundOpacity, setBackgroundOpacity,
    windowOpacity, setWindowOpacity,
    fontSize, setFontSize
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUIContext() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUIContext must be used within a UIProvider');
  }
  return context;
}