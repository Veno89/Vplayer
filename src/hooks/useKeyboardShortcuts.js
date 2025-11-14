import { useEffect } from 'react';

export function useKeyboardShortcuts({ playback, ui, navigation }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle shortcuts when typing in inputs
      if (isInputFocused()) return;
      
      // Space: Play/Pause
      if (e.code === 'Space') {
        e.preventDefault();
        playback.togglePlay();
      }
      
      // Arrow Right: Next track (or seek forward with Shift)
      if (e.code === 'ArrowRight' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          playback.seekForward?.();
        } else {
          playback.nextTrack();
        }
      }
      
      // Arrow Left: Previous track (or seek backward with Shift)
      if (e.code === 'ArrowLeft' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          playback.seekBackward?.();
        } else {
          playback.prevTrack();
        }
      }
      
      // Arrow Up: Volume up (or navigate up in lists with Ctrl)
      if (e.code === 'ArrowUp' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (e.ctrlKey) {
          navigation?.moveUp?.();
        } else {
          playback.volumeUp();
        }
      }
      
      // Arrow Down: Volume down (or navigate down in lists with Ctrl)
      if (e.code === 'ArrowDown' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (e.ctrlKey) {
          navigation?.moveDown?.();
        } else {
          playback.volumeDown();
        }
      }
      
      // Enter: Play selected track (list navigation)
      if (e.code === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        navigation?.playSelected?.();
      }
      
      // J/K: Vim-style navigation
      if (e.code === 'KeyJ' && e.ctrlKey) {
        e.preventDefault();
        navigation?.moveDown?.();
      }
      if (e.code === 'KeyK' && e.ctrlKey) {
        e.preventDefault();
        navigation?.moveUp?.();
      }
      
      // Ctrl+F: Focus search
      if (e.code === 'KeyF' && e.ctrlKey) {
        e.preventDefault();
        ui.focusSearch();
      }
      
      // Ctrl+L: Toggle library window
      if (e.code === 'KeyL' && e.ctrlKey) {
        e.preventDefault();
        ui.toggleWindow('library');
      }
      
      // Ctrl+P: Toggle playlist window
      if (e.code === 'KeyP' && e.ctrlKey) {
        e.preventDefault();
        ui.toggleWindow('playlist');
      }
      
      // Ctrl+E: Toggle equalizer window
      if (e.code === 'KeyE' && e.ctrlKey) {
        e.preventDefault();
        ui.toggleWindow('equalizer');
      }
      
      // Ctrl+V: Toggle visualizer window
      if (e.code === 'KeyV' && e.ctrlKey) {
        e.preventDefault();
        ui.toggleWindow('visualizer');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playback, ui]);
}

function isInputFocused() {
  const active = document.activeElement;
  return active?.tagName === 'INPUT' || 
         active?.tagName === 'TEXTAREA' || 
         active?.isContentEditable;
}
