import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { EVENTS, SHORTCUT_ACTIONS, VOLUME_STEP } from '../utils/constants';

/**
 * Global shortcuts hook
 * Listens for global shortcut events from Tauri backend
 * 
 * @param {Object} params
 * @param {Function} params.setPlaying - Set playing state callback
 * @param {Object} params.playerHook - Player control hooks
 * @param {Object} params.audio - Audio service
 * @param {number} params.volume - Current volume level
 */
export function useGlobalShortcuts({ 
  setPlaying, 
  playerHook, 
  audio, 
  volume 
}) {
  useEffect(() => {
    const unlistenPromise = listen(EVENTS.GLOBAL_SHORTCUT, (event) => {
      const action = event.payload;
      
      switch (action) {
        case SHORTCUT_ACTIONS.PLAY_PAUSE:
          setPlaying(p => !p);
          break;
        case SHORTCUT_ACTIONS.NEXT_TRACK:
          playerHook.handleNextTrack();
          break;
        case SHORTCUT_ACTIONS.PREV_TRACK:
          playerHook.handlePrevTrack();
          break;
        case SHORTCUT_ACTIONS.STOP:
          audio.stop();
          setPlaying(false);
          break;
        case SHORTCUT_ACTIONS.VOLUME_UP:
          playerHook.handleVolumeChange(Math.min(1, volume + VOLUME_STEP));
          break;
        case SHORTCUT_ACTIONS.VOLUME_DOWN:
          playerHook.handleVolumeChange(Math.max(0, volume - VOLUME_STEP));
          break;
        case SHORTCUT_ACTIONS.MUTE:
          playerHook.handleVolumeChange(volume > 0 ? 0 : 0.7);
          break;
      }
    });

    return () => {
      unlistenPromise.then(unlisten => {
        if (unlisten && typeof unlisten === 'function') {
          unlisten();
        }
      }).catch(err => {
        console.warn('Failed to unlisten global-shortcut:', err);
      });
    };
  }, [setPlaying, playerHook, audio, volume]);
}
