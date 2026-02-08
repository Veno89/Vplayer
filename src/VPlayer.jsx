import React, { useEffect, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useStore } from './store/useStore';
import { usePlayerContext } from './context/PlayerProvider';
import { useAutoResize } from './hooks/useAutoResize';
import { useShortcuts } from './hooks/useShortcuts';
import { useUpdater } from './hooks/useUpdater';
import { useCurrentColors } from './hooks/useStoreHooks';
import { AppContainer } from './components/AppContainer';
import { WindowManager } from './components/WindowManager';
import { MiniPlayerWindow } from './windows/MiniPlayerWindow';
import { OnboardingWindow } from './windows/OnboardingWindow';
import ThemeEditorWindow from './windows/ThemeEditorWindow';
import { UpdateBanner } from './components/UpdateComponents';
import { VOLUME_STEP } from './utils/constants';

const VPlayerInner = () => {
  const {
    audio, handleNextTrack, handlePrevTrack, handleVolumeChange,
    handleToggleMute, library,
  } = usePlayerContext();

  const currentColors = useCurrentColors();

  // ── Local UI state ────────────────────────────────────────────────
  const [miniPlayerMode, setMiniPlayerMode] = React.useState(false);
  const [showOnboarding, setShowOnboarding] = React.useState(false);

  // ── Store selectors (only what VPlayer itself needs) ──────────────
  const volume = useStore(s => s.volume);
  const setPlaying = useStore(s => s.setPlaying);
  const setShuffle = useStore(s => s.setShuffle);
  const setRepeatMode = useStore(s => s.setRepeatMode);
  const windows = useStore(s => s.windows);
  const toggleWindow = useStore(s => s.toggleWindow);
  const backgroundImage = useStore(s => s.backgroundImage);
  const setBackgroundImage = useStore(s => s.setBackgroundImage);
  const autoResizeWindow = useStore(s => s.autoResizeWindow);

  // ── Auto-updater ──────────────────────────────────────────────────
  const updater = useUpdater();

  useEffect(() => {
    window.updater = updater;
    return () => { delete window.updater; };
  }, [updater]);

  // ── Auto-resize ───────────────────────────────────────────────────
  const { recalculateSize, isReady } = useAutoResize(windows, autoResizeWindow);

  useEffect(() => {
    if (autoResizeWindow && isReady) {
      const handleKeyPress = (e) => {
        if (e.ctrlKey && e.key === 'r') recalculateSize();
      };
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
  }, [autoResizeWindow, isReady, recalculateSize]);

  useEffect(() => {
    if (autoResizeWindow && windows && isReady) {
      const timer = setTimeout(() => recalculateSize(), 2000);
      return () => clearTimeout(timer);
    }
  }, [autoResizeWindow, windows, isReady, recalculateSize]);

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

  // ── Background image conversion ───────────────────────────────────
  useEffect(() => {
    if (backgroundImage && backgroundImage.startsWith('file://')) {
      try {
        const filePath = decodeURIComponent(backgroundImage.replace('file:///', ''));
        setBackgroundImage(convertFileSrc(filePath));
      } catch (err) {
        console.error('Failed to convert background image URL:', err);
        setBackgroundImage(null);
      }
    }
  }, [backgroundImage, setBackgroundImage]);

  // ── Onboarding check ─────────────────────────────────────────────
  useEffect(() => {
    if (!useStore.getState().onboardingComplete && library.libraryFolders.length === 0) {
      setShowOnboarding(true);
    }
  }, [library.libraryFolders]);

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

      {showOnboarding && (
        <OnboardingWindow onComplete={() => setShowOnboarding(false)} />
      )}
    </AppContainer>
  );
};

export default VPlayerInner;