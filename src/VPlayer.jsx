import React, { useEffect, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { AudioContextProvider } from './context/AudioContextProvider';
import { usePlayerState, useUIState, useWindowManagement } from './hooks/useStoreHooks';
import { useStore } from './store/useStore';
import { useAudio } from './hooks/useAudio';
import { useLibrary } from './hooks/useLibrary';
import { useToast } from './hooks/useToast';
import { usePlayer as usePlayerHook } from './hooks/usePlayer';
import { useTrackLoading } from './hooks/useTrackLoading';
import { useEqualizer } from './hooks/useEqualizer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useCrossfade } from './hooks/useCrossfade';
import { useDragDrop } from './hooks/useDragDrop';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useWindowConfigs } from './hooks/useWindowConfigs';
import { AppContainer } from './components/AppContainer';
import { WindowManager } from './components/WindowManager';
import { MiniPlayerWindow } from './windows/MiniPlayerWindow';
import ThemeEditorWindow from './windows/ThemeEditorWindow';
import { VOLUME_STEP } from './utils/constants';

const VPlayerInner = () => {
  const toast = useToast();
  const [themeEditorOpen, setThemeEditorOpen] = React.useState(false);
  const [miniPlayerMode, setMiniPlayerMode] = React.useState(false);
  const [activePlaybackTracks, setActivePlaybackTracks] = React.useState([]);

  const { currentTrack, setCurrentTrack, playing, setPlaying, progress, setProgress,
    duration, setDuration, volume, setVolume, shuffle, setShuffle, repeatMode, 
    setRepeatMode, loadingTrackIndex, setLoadingTrackIndex } = usePlayerState();

  const library = useLibrary();
  const { tracks, libraryFolders, isScanning, scanProgress, scanCurrent, scanTotal,
    scanCurrentFile, addFolder, removeFolder, removeTrack, searchQuery, setSearchQuery,
    sortBy, setSortBy, sortOrder, setSortOrder, advancedFilters, setAdvancedFilters,
    filteredTracks, refreshTracks } = library;

  const { colorScheme, setColorScheme, currentColors, colorSchemes, saveCustomTheme,
    deleteCustomTheme, applyCustomTheme, debugVisible, setDebugVisible, layouts,
    currentLayout, applyLayout, backgroundImage, setBackgroundImage, backgroundBlur,
    setBackgroundBlur, backgroundOpacity, setBackgroundOpacity, windowOpacity,
    setWindowOpacity, fontSize, setFontSize, gaplessPlayback, autoPlayOnStartup,
    resumeLastTrack, autoScanOnStartup } = useUIState();

  const { windows, setWindows, bringToFront, toggleWindow } = useWindowManagement();

  const audio = useAudio({
    initialVolume: volume,
    onEnded: () => {
      if (repeatMode === 'one') {
        audio.seek(0);
        audio.play().catch(err => {
          console.error('Failed to replay:', err);
          toast.showError('Failed to replay track');
        });
      } else if (repeatMode === 'all' || currentTrack < tracks.length - 1) {
        playerHook.handleNextTrack();
      } else {
        setPlaying(false);
      }
    },
    onTimeUpdate: (time) => {
      setProgress(time);
    },
  });

  const equalizer = useEqualizer();
  const crossfade = useCrossfade({ audio, enabled: false, duration: 3 });
  
  const playerHook = usePlayerHook({ 
    audio, 
    player: { currentTrack, setCurrentTrack, shuffle, repeatMode, progress, duration, volume, setVolume }, 
    tracks: activePlaybackTracks.length > 0 ? activePlaybackTracks : tracks,
    toast,
    crossfade,
    store: useStore.getState()
  });

  const trackLoading = useTrackLoading({ 
    audio, tracks, currentTrack, playing, setDuration, setLoadingTrackIndex,
    progress, toast, removeTrack, setCurrentTrack, handleNextTrack: playerHook.handleNextTrack
  });

  useGlobalShortcuts({ setPlaying, playerHook, audio, volume });

  useKeyboardShortcuts({
    playback: {
      togglePlay: () => setPlaying(p => !p),
      nextTrack: playerHook.handleNextTrack,
      prevTrack: playerHook.handlePrevTrack,
      volumeUp: () => playerHook.handleVolumeChange(Math.min(1, volume + VOLUME_STEP)),
      volumeDown: () => playerHook.handleVolumeChange(Math.max(0, volume - VOLUME_STEP)),
    },
    ui: {
      toggleWindow,
      focusSearch: () => document.querySelector('input[type="text"][placeholder*="Search"]')?.focus(),
    },
  });

  const dragDrop = useDragDrop({ addFolder, toast });

  useEffect(() => {
    audio.changeVolume(volume).catch(err => console.error('Failed to set initial volume:', err));
  }, []);

  // Convert old file:// background image URLs to Tauri asset URLs
  useEffect(() => {
    if (backgroundImage && backgroundImage.startsWith('file://')) {
      try {
        // Extract the file path and convert it
        const filePath = decodeURIComponent(backgroundImage.replace('file:///', ''));
        const assetUrl = convertFileSrc(filePath);
        setBackgroundImage(assetUrl);
      } catch (err) {
        console.error('Failed to convert background image URL:', err);
        // Clear invalid URL
        setBackgroundImage(null);
      }
    }
  }, [backgroundImage, setBackgroundImage]);

  useEffect(() => { setDuration(audio.duration); }, [audio.duration, setDuration]);

  useEffect(() => {
    setProgress(audio.progress);
    if (audio.progress > 0 && Math.floor(audio.progress) % 5 === 0) {
      localStorage.setItem('vplayer_last_position', audio.progress.toString());
    }
  }, [audio.progress, setProgress]);

  useEffect(() => {
    if (trackLoading.hasRestoredTrack || tracks.length === 0) return;
    
    if (resumeLastTrack) {
      const savedTrackId = localStorage.getItem('vplayer_last_track');
      if (savedTrackId) {
        const trackIndex = tracks.findIndex(t => t.id === savedTrackId);
        if (trackIndex !== -1) {
          setCurrentTrack(trackIndex);
          
          // Auto-play if enabled
          if (autoPlayOnStartup) {
            setTimeout(() => setPlaying(true), 500);
          }
        }
      }
    }
    
    trackLoading.setHasRestoredTrack(true);
  }, [tracks, trackLoading, setCurrentTrack, resumeLastTrack, autoPlayOnStartup, setPlaying]);

  useEffect(() => {
    if (playing) {
      audio.play().catch(err => {
        console.error('Failed to play:', err);
        toast.showError('Failed to play track');
        setPlaying(false);
      });
    } else {
      audio.pause().catch(err => {
        console.error('Failed to pause:', err);
        toast.showError('Failed to pause');
      });
    }
  }, [playing]);

  useEffect(() => {
    if (playing && currentTrack !== null && tracks[currentTrack]) {
      invoke('increment_play_count', { trackId: tracks[currentTrack].id })
        .catch(err => console.warn('Failed to increment play count:', err));
    }
  }, [playing, currentTrack, tracks]);

  const handleAddFolder = useCallback(async () => {
    try {
      await addFolder();
      toast.showSuccess('Folder added successfully');
    } catch (err) {
      toast.showError('Failed to add folder');
    }
  }, [addFolder, toast]);

  const handleRemoveFolder = useCallback(async (folderId, folderPath) => {
    try {
      await removeFolder(folderId, folderPath);
      toast.showSuccess('Folder removed successfully');
      if (currentTrack !== null && tracks[currentTrack]?.folderId === folderId) {
        setCurrentTrack(null);
        setPlaying(false);
      }
    } catch (err) {
      toast.showError('Failed to remove folder');
    }
  }, [removeFolder, currentTrack, tracks, setCurrentTrack, setPlaying, toast]);

  const handleRatingChange = useCallback(() => { refreshTracks(); }, [refreshTracks]);
  const handleDuplicateRemoved = useCallback(() => {
    refreshTracks();
    toast.showSuccess('Track removed successfully');
  }, [refreshTracks, toast]);

  const windowConfigs = useWindowConfigs({
    currentTrack, tracks, filteredTracks, playing, progress, duration, volume,
    currentColors, shuffle, repeatMode, audio, playerHook, setPlaying,
    setShuffle, setRepeatMode, toggleWindow, setCurrentTrack, removeTrack,
    libraryFolders, isScanning, scanProgress, scanCurrent, scanTotal,
    scanCurrentFile, handleAddFolder, handleRemoveFolder, searchQuery,
    setSearchQuery, sortBy, setSortBy, sortOrder, setSortOrder, advancedFilters,
    setAdvancedFilters, equalizer, windows, colorScheme, setColorScheme,
    colorSchemes, debugVisible, setDebugVisible, loadingTrackIndex, layouts,
    currentLayout, applyLayout, handleLibraryDragStart: dragDrop.handleLibraryDragStart,
    handleLibraryDragEnd: dragDrop.handleLibraryDragEnd, handleRatingChange,
    handleDuplicateRemoved, setActivePlaybackTracks, crossfade, setThemeEditorOpen,
    backgroundImage, setBackgroundImage, backgroundBlur, setBackgroundBlur,
    backgroundOpacity, setBackgroundOpacity, windowOpacity, setWindowOpacity,
    fontSize, setFontSize, setMiniPlayerMode
  });

  return (
    <AppContainer
      toasts={toast.toasts}
      removeToast={toast.removeToast}
      audioBackendError={audio.audioBackendError}
      onDrop={dragDrop.handleDrop}
      onDragOver={dragDrop.handleDragOver}
      fontSize={fontSize}
      backgroundImage={backgroundImage}
      backgroundBlur={backgroundBlur}
      backgroundOpacity={backgroundOpacity}
    >
      {miniPlayerMode ? (
        <div className="fixed top-4 right-4 z-[100]">
          <MiniPlayerWindow
            currentTrack={currentTrack}
            tracks={tracks}
            playing={playing}
            progress={progress}
            duration={duration}
            volume={volume}
            togglePlay={() => setPlaying(p => !p)}
            nextTrack={playerHook.handleNextTrack}
            prevTrack={playerHook.handlePrevTrack}
            onMaximize={() => setMiniPlayerMode(false)}
            onClose={() => setMiniPlayerMode(false)}
            currentColors={currentColors}
            isMuted={audio.isMuted}
            toggleMute={playerHook.handleToggleMute}
          />
        </div>
      ) : (
        <>
          <WindowManager
            windowConfigs={windowConfigs}
            windows={windows}
            currentColors={currentColors}
            bringToFront={bringToFront}
            setWindows={setWindows}
            toggleWindow={toggleWindow}
            windowOpacity={windowOpacity}
          />
          <ThemeEditorWindow
            isOpen={themeEditorOpen}
            onClose={() => setThemeEditorOpen(false)}
            currentColors={currentColors}
            colorSchemes={colorSchemes}
            onSaveTheme={saveCustomTheme}
            onDeleteTheme={deleteCustomTheme}
            onApplyTheme={applyCustomTheme}
          />
        </>
      )}
    </AppContainer>
  );
};

const VPlayer = () => (
  <AudioContextProvider>
    <VPlayerInner />
  </AudioContextProvider>
);

export default VPlayer;