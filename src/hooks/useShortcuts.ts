import { useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../store/useStore';
import type { KeyboardShortcut } from '../store/types';

// Default shortcuts - can be customized via ShortcutsWindow
const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
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
 * Parse a shortcut key string into components
 * e.g., "Ctrl+Shift+F" => { ctrl: true, shift: true, alt: false, key: "f" }
 */
interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parseShortcut(shortcutKey: string): ParsedShortcut {
  const parts = shortcutKey.split('+');
  const result = {
    ctrl: false,
    shift: false,
    alt: false,
    key: '',
  };
  
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') {
      result.ctrl = true;
    } else if (lower === 'shift') {
      result.shift = true;
    } else if (lower === 'alt') {
      result.alt = true;
    } else {
      // The actual key (normalize Space to ' ')
      result.key = part === 'Space' ? ' ' : part;
    }
  }
  
  return result;
}

/**
 * Check if keyboard event matches a shortcut
 */
function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  const parsed = parseShortcut(shortcut.key);
  
  // Check modifiers
  if (parsed.ctrl !== (event.ctrlKey || event.metaKey)) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;
  
  // Check key (case-insensitive for letters)
  const eventKey = event.key;
  const shortcutKey = parsed.key;
  
  if (shortcutKey === ' ' && eventKey === ' ') return true;
  if (eventKey.toLowerCase() === shortcutKey.toLowerCase()) return true;
  
  return false;
}

/**
 * Unified keyboard shortcuts hook
 * Handles both DOM keyboard events (in-app) and Tauri global events (OS media keys)
 * Reads customizable shortcuts from Zustand store
 */
export interface ShortcutsParams {
  togglePlay?: () => void;
  nextTrack?: () => void;
  prevTrack?: () => void;
  volumeUp?: () => void;
  volumeDown?: () => void;
  mute?: () => void;
  stop?: () => void;
  toggleShuffle?: () => void;
  toggleRepeat?: () => void;
  toggleWindow?: (id: string) => void;
  focusSearch?: () => void;
  audio?: { seek?: (pos: number) => void; pause?: () => void; currentTime?: number; duration?: number };
}

export function useShortcuts({
  togglePlay,
  nextTrack,
  prevTrack,
  volumeUp,
  volumeDown,
  mute,
  stop,
  toggleShuffle,
  toggleRepeat,
  toggleWindow,
  focusSearch,
  audio,
}: ShortcutsParams): void {
  // Load shortcuts from Zustand store (persisted); null means use defaults
  const storedShortcuts = useStore(state => state.keyboardShortcuts);
  const shortcuts = storedShortcuts || DEFAULT_SHORTCUTS;

  // Check if an input element is focused
  const isInputFocused = useCallback(() => {
    const active = document.activeElement;
    return active?.tagName === 'INPUT' || 
           active?.tagName === 'TEXTAREA' || 
           (active as HTMLElement)?.isContentEditable;
  }, []);

  // Action handlers map
  const actionHandlers = useCallback((): Record<string, (() => void) | undefined> => ({
    'play-pause': togglePlay,
    'next-track': nextTrack,
    'prev-track': prevTrack,
    'volume-up': volumeUp,
    'volume-down': volumeDown,
    'mute': mute,
    'stop': stop,
    'shuffle': toggleShuffle,
    'repeat': toggleRepeat,
    'seek-forward': () => audio?.seek?.(Math.min((audio.currentTime || 0) + 10, audio.duration || 0)),
    'seek-backward': () => audio?.seek?.(Math.max((audio.currentTime || 0) - 10, 0)),
    'seek-forward-small': () => audio?.seek?.(Math.min((audio.currentTime || 0) + 5, audio.duration || 0)),
    'seek-backward-small': () => audio?.seek?.(Math.max((audio.currentTime || 0) - 5, 0)),
    'search': focusSearch,
    'open-settings': () => toggleWindow?.('options'),
    'open-queue': () => toggleWindow?.('queue'),
    'open-library': () => toggleWindow?.('library'),
    'open-player': () => toggleWindow?.('player'),
    'open-equalizer': () => toggleWindow?.('equalizer'),
    'open-shortcuts': () => toggleWindow?.('shortcuts'),
  }), [togglePlay, nextTrack, prevTrack, volumeUp, volumeDown, mute, stop, toggleShuffle, toggleRepeat, audio, focusSearch, toggleWindow]);

  // DOM keyboard events (in-app shortcuts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in inputs (except for some shortcuts like Escape)
      if (isInputFocused() && e.key !== 'Escape') return;
      
      const handlers = actionHandlers();
      
      // Find matching shortcut
      for (const shortcut of shortcuts) {
        if (matchesShortcut(e, shortcut)) {
          const handler = handlers[shortcut.id];
          if (handler) {
            e.preventDefault();
            handler();
            return;
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isInputFocused, shortcuts, actionHandlers]);

  // Tauri global shortcuts (OS media keys)
  useEffect(() => {
    const unlisten = listen('global-shortcut', (event) => {
      const action = event.payload;

      switch (action) {
        case 'PLAY_PAUSE':
          togglePlay?.();
          break;
        case 'NEXT_TRACK':
          nextTrack?.();
          break;
        case 'PREV_TRACK':
          prevTrack?.();
          break;
        case 'STOP':
          if (stop) {
            stop();
          } else if (audio) {
            audio.pause?.();
          }
          break;
        case 'VOLUME_UP':
          volumeUp?.();
          break;
        case 'VOLUME_DOWN':
          volumeDown?.();
          break;
        case 'MUTE':
          mute?.();
          break;
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [togglePlay, nextTrack, prevTrack, stop, volumeUp, volumeDown, mute, audio]);
}

export default useShortcuts;
