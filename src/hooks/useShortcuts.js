import { useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';

/**
 * Unified keyboard shortcuts hook
 * Handles both DOM keyboard events (in-app) and Tauri global events (OS media keys)
 */
export function useShortcuts({
  // Playback callbacks
  togglePlay,
  nextTrack,
  prevTrack,
  volumeUp,
  volumeDown,
  mute,
  stop,
  // UI callbacks
  toggleWindow,
  focusSearch,
  // Audio reference for global shortcuts
  audio,
}) {
  // Check if an input element is focused
  const isInputFocused = useCallback(() => {
    const active = document.activeElement;
    return active?.tagName === 'INPUT' || 
           active?.tagName === 'TEXTAREA' || 
           active?.isContentEditable;
  }, []);

  // DOM keyboard events (in-app shortcuts)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip when typing in inputs
      if (isInputFocused()) return;
      
      // Ctrl/Cmd key combinations
      if (e.ctrlKey || e.metaKey) {
        const windowShortcuts = {
          'p': 'player',
          'l': 'library', 
          'q': 'queue',
          'e': 'equalizer',
          'o': 'options',
          'h': 'history',
          'y': 'lyrics',
          'm': 'mini-player',
        };
        
        const windowId = windowShortcuts[e.key.toLowerCase()];
        if (windowId && toggleWindow) {
          e.preventDefault();
          toggleWindow(windowId);
          return;
        }
        
        // Ctrl+F for search
        if (e.key.toLowerCase() === 'f' && focusSearch) {
          e.preventDefault();
          focusSearch();
          return;
        }
      }
      
      // Non-modifier shortcuts
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay?.();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextTrack?.();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevTrack?.();
          break;
        case 'ArrowUp':
          e.preventDefault();
          volumeUp?.();
          break;
        case 'ArrowDown':
          e.preventDefault();
          volumeDown?.();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          mute?.();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isInputFocused, togglePlay, nextTrack, prevTrack, volumeUp, volumeDown, mute, toggleWindow, focusSearch]);

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
            audio.pause();
            audio.currentTime = 0;
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
