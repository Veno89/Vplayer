import React, { useEffect, useCallback } from 'react';
import { useStore } from './store/useStore';
import { usePlayerContext } from './context/PlayerProvider';
import { useAutoResize } from './hooks/useAutoResize';
import { useShortcuts } from './hooks/useShortcuts';
import { useUpdater } from './hooks/useUpdater';
import { useCurrentColors } from './hooks/useStoreHooks';
import { AppContainer } from './components/AppContainer';
import { WindowManager } from './components/WindowManager';
import { MiniPlayerWindow } from './windows/MiniPlayerWindow';
import { OnboardingGuard } from './windows/OnboardingWindow';
import ThemeEditorWindow from './windows/ThemeEditorWindow';
import { UpdateBanner } from './components/UpdateComponents';
import { VOLUME_STEP } from './utils/constants';

const VPlayerInner = () => {
  const {
    audio, handleNextTrack, handlePrevTrack, handleVolumeChange,
    handleToggleMute,
  } = usePlayerContext();

  const currentColors = useCurrentColors();
  const [miniPlayerMode, setMiniPlayerMode] = React.useState(false);

  // ── Store selectors (only what VPlayer itself needs) ──────────────
  const volume = useStore(s => s.volume);
  const setPlaying = useStore(s => s.setPlaying);
  const setShuffle = useStore(s => s.setShuffle);
  const setRepeatMode = useStore(s => s.setRepeatMode);
  const toggleWindow = useStore(s => s.toggleWindow);
  const autoResizeWindow = useStore(s => s.autoResizeWindow);

  // ── Auto-updater ──────────────────────────────────────────────────
  const updater = useUpdater();

  // ── Auto-resize (self-contained: reads windows/enabled from store) ─
  const { recalculateSize } = useAutoResize();

  const toggleWindowWithResize = useCallback((windowId) => {
    toggleWindow(windowId);
    if (autoResizeWindow) setTimeout(() => recalculateSize(), 200);
  }, [toggleWindow, autoResizeWindow, recalculateSize]);

  // ── Keyboard shortcuts ────────────────────────────────────────────
  useShortcuts({
    togglePlay: () => setPlaying(p => !p),
    nextTrack: handleNextTrack,
    prevTrack: handlePrevTrack,
    volumeUp: () => handleVolumeChange(Math.min(1, volume + VOLUME_STEP)),
    volumeDown: () => handleVolumeChange(Math.max(0, volume - VOLUME_STEP)),
    mute: handleToggleMute,
    stop: () => { audio.pause(); audio.seek(0); setPlaying(false); },
    toggleShuffle: () => setShuffle(s => !s),
    toggleRepeat: () => setRepeatMode(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'),
    toggleWindow: toggleWindowWithResize,
    focusSearch: () => document.querySelector('input[type="text"][placeholder*="Search"]')?.focus(),
    audio,
  });

  // ── Render ────────────────────────────────────────────────────────
  return (
    <AppContainer>
      {updater.updateAvailable && (
        <UpdateBanner
          updateInfo={updater.updateInfo}
          downloading={updater.downloading}
          downloadProgress={updater.downloadProgress}
          onDownload={updater.downloadAndInstall}
          onDismiss={updater.dismissUpdate}
          currentColors={currentColors}
        />
      )}

      {miniPlayerMode ? (
        <div className="fixed top-4 right-4 z-[100]">
          <MiniPlayerWindow
            onMaximize={() => setMiniPlayerMode(false)}
            onClose={() => setMiniPlayerMode(false)}
          />
        </div>
      ) : (
        <>
          <WindowManager />
          <ThemeEditorWindow />
        </>
      )}

      <OnboardingGuard />
    </AppContainer>
  );
};

export default VPlayerInner;