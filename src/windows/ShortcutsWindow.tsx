import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import type { KeyboardShortcut } from '../store/types';

// Default shortcuts - shared with useShortcuts.js
const defaultShortcuts: KeyboardShortcut[] = [
  { id: 'play-pause', name: 'Play/Pause', key: 'Space', category: 'Playback' },
  { id: 'next-track', name: 'Next Track', key: 'ArrowRight', category: 'Playback' },
  { id: 'prev-track', name: 'Previous Track', key: 'ArrowLeft', category: 'Playback' },
  { id: 'volume-up', name: 'Volume Up', key: 'ArrowUp', category: 'Volume' },
  { id: 'volume-down', name: 'Volume Down', key: 'ArrowDown', category: 'Volume' },
  { id: 'mute', name: 'Mute', key: 'M', category: 'Volume' },
  { id: 'shuffle', name: 'Toggle Shuffle', key: 'S', category: 'Playback' },
  { id: 'repeat', name: 'Toggle Repeat', key: 'R', category: 'Playback' },
  { id: 'seek-forward', name: 'Seek Forward 10s', key: 'Shift+ArrowRight', category: 'Playback' },
  { id: 'seek-backward', name: 'Seek Backward 10s', key: 'Shift+ArrowLeft', category: 'Playback' },
  { id: 'seek-forward-small', name: 'Seek Forward 5s', key: 'L', category: 'Playback' },
  { id: 'seek-backward-small', name: 'Seek Backward 5s', key: 'J', category: 'Playback' },
  { id: 'search', name: 'Focus Search', key: 'Ctrl+F', category: 'Navigation' },
  { id: 'open-settings', name: 'Open Settings', key: 'Ctrl+O', category: 'Navigation' },
  { id: 'open-queue', name: 'Open Queue', key: 'Ctrl+Q', category: 'Navigation' },
  { id: 'open-library', name: 'Open Library', key: 'Ctrl+L', category: 'Navigation' },
  { id: 'open-player', name: 'Open Player', key: 'Ctrl+P', category: 'Navigation' },
  { id: 'open-equalizer', name: 'Open Equalizer', key: 'Ctrl+E', category: 'Navigation' },
  { id: 'open-shortcuts', name: 'Show Shortcuts', key: '?', category: 'Navigation' },
  { id: 'stop', name: 'Stop Playback', key: 'Escape', category: 'Playback' },
];

/**
 * ShortcutsWindow - Configure keyboard shortcuts
 * 
 * Allows users to customize keyboard shortcuts for all actions
 * with conflict detection and restore defaults.
 * Changes are synced with useShortcuts.js via Zustand store.
 */
export default function ShortcutsWindow() {
  const storedShortcuts = useStore(state => state.keyboardShortcuts);
  const setStoredShortcuts = useStore(state => state.setKeyboardShortcuts);
  const toggleWindow = useStore(state => state.toggleWindow);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    // Load shortcuts from store or use defaults
    setShortcuts(storedShortcuts || defaultShortcuts);
  }, []);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!listening) return;
    
    e.preventDefault();
    e.stopPropagation();

    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    
    if (e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt') {
      parts.push(e.key);
    }

    if (parts.length > 0) {
      const newKey = parts.join('+');
      
      // Check for conflicts
      const conflict = shortcuts.find(
        s => s.key === newKey && s.id !== editing
      );

      if (conflict) {
        addToast(`Shortcut already used by "${conflict.name}"`, 'error');
        setListening(false);
        setEditing(null);
        return;
      }

      // Update shortcut
      const updated = shortcuts.map(s =>
        s.id === editing ? { ...s, key: newKey } : s
      );
      
      setShortcuts(updated);
      setStoredShortcuts(updated);
      setListening(false);
      setEditing(null);
      addToast('Shortcut updated', 'success');
    }
  };

  useEffect(() => {
    if (listening) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [listening, editing, shortcuts]);

  const startEditing = (shortcut: KeyboardShortcut) => {
    setEditing(shortcut.id);
    setListening(true);
  };

  const cancelEditing = () => {
    setEditing(null);
    setListening(false);
  };

  const resetToDefaults = () => {
    setShortcuts(defaultShortcuts);
    setStoredShortcuts(null); // null means "use defaults"
    addToast('Shortcuts reset to defaults', 'success');
  };

  const resetSingle = (shortcutId: string) => {
    const defaultShortcut = defaultShortcuts.find((s: KeyboardShortcut) => s.id === shortcutId);
    if (!defaultShortcut) return;

    const updated = shortcuts.map(s =>
      s.id === shortcutId ? defaultShortcut : s
    );
    
    setShortcuts(updated);
    setStoredShortcuts(updated);
    addToast('Shortcut reset', 'success');
  };

  const categories = [...new Set(shortcuts.map((s: KeyboardShortcut) => s.category))];

  return (
    <div className="flex flex-col h-full p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-white">Configure Shortcuts</h2>
            <p className="text-sm text-gray-400 mt-1">
              Click on a shortcut to edit it, then press the desired keys
            </p>
          </div>
          <button
            onClick={resetToDefaults}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
          >
            Reset All
          </button>
        </div>

        {/* Listening indicator */}
        {listening && (
          <div className="mb-4 p-4 bg-blue-900/30 border border-blue-700 rounded">
            <p className="text-blue-300 text-sm">
              Press any key combination... (ESC to cancel)
            </p>
          </div>
        )}

        {/* Shortcuts by category */}
        <div className="flex-1 overflow-y-auto space-y-6">
          {categories.map((category: string) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">
                {category}
              </h3>
              <div className="space-y-2">
                {shortcuts
                  .filter((s: KeyboardShortcut) => s.category === category)
                  .map((shortcut: KeyboardShortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between p-3 bg-gray-800/50 rounded hover:bg-gray-800 transition-colors"
                    >
                      <span className="text-white">{shortcut.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditing(shortcut)}
                          disabled={listening && editing !== shortcut.id}
                          className={`px-3 py-1 rounded text-sm font-mono transition-colors ${
                            editing === shortcut.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          } ${listening && editing !== shortcut.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {editing === shortcut.id ? 'Listening...' : shortcut.key}
                        </button>
                        {editing === shortcut.id ? (
                          <button
                            onClick={cancelEditing}
                            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm"
                          >
                            Cancel
                          </button>
                        ) : (
                          <button
                            onClick={() => resetSingle(shortcut.id)}
                            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                            title="Reset to default"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-500">
            Shortcuts are saved locally and will persist across sessions
          </p>
        </div>
      </div>
  );
}
