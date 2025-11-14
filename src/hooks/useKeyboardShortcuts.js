import { useEffect } from 'react';

export function useKeyboardShortcuts({ playback, ui }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle shortcuts when typing in inputs
      if (isInputFocused()) return;
      
      // Space: Play/Pause
      if (e.code === 'Space') {
        e.preventDefault();
        playback.togglePlay();
      }
      
      // Arrow Right: Next track
      if (e.code === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        playback.nextTrack();
      }
      
      // Arrow Left: Previous track
      if (e.code === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        playback.prevTrack();
      }
      
      // Arrow Up: Volume up
      if (e.code === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        playback.volumeUp();
      }
      
      // Arrow Down: Volume down
      if (e.code === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        playback.volumeDown();
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
