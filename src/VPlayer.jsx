import React, { useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AudioContextProvider } from './context/AudioContextProvider';
import { useStore } from './store/useStore';
import { usePlayerState, useUIState, useWindowManagement } from './hooks/useStoreHooks';
import { useAudio } from './hooks/useAudio';
import { useLibrary } from './hooks/useLibrary';
import { useToast } from './hooks/useToast';
import { usePlayer as usePlayerHook } from './hooks/usePlayer';
import { useTrackLoading } from './hooks/useTrackLoading';
import { useEqualizer } from './hooks/useEqualizer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useCrossfade } from './hooks/useCrossfade';
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  Music, Settings, List, Sliders, FolderOpen, ListOrdered, History, Disc, Sparkles
} from 'lucide-react';
import { PlayerWindow } from './windows/PlayerWindow';
import { MiniPlayerWindow } from './windows/MiniPlayerWindow';
import { PlaylistWindow } from './windows/PlaylistWindow';
import { LibraryWindow } from './windows/LibraryWindow';
import { EqualizerWindow } from './windows/EqualizerWindow';
import { VisualizerWindow } from './windows/VisualizerWindow';
import { OptionsWindow } from './windows/OptionsWindow';
import { QueueWindow } from './windows/QueueWindow';
import { HistoryWindow } from './windows/HistoryWindow';
import { AlbumViewWindow } from './windows/AlbumViewWindow';
import { SmartPlaylistsWindow } from './windows/SmartPlaylistsWindow';
import DuplicatesWindow from './windows/DuplicatesWindow';
import ThemeEditorWindow from './windows/ThemeEditorWindow';
import { Window } from './components/Window';
import { VOLUME_STEP, EVENTS, SHORTCUT_ACTIONS } from './utils/constants';

const VPlayerInner = () => {
  // Toast notifications
  const toast = useToast();
  
  // Duplicates window state
  const [duplicatesWindowOpen, setDuplicatesWindowOpen] = React.useState(false);
  // Theme editor window state
  const [themeEditorOpen, setThemeEditorOpen] = React.useState(false);
  // Mini player state
  const [miniPlayerMode, setMiniPlayerMode] = React.useState(false);

  // Player state
  const {
    currentTrack, setCurrentTrack,
    playing, setPlaying,
    progress, setProgress,
    duration, setDuration,
    volume, setVolume,
    shuffle, setShuffle,
    repeatMode, setRepeatMode,
    loadingTrackIndex, setLoadingTrackIndex
  } = usePlayerState();

  // Library hook (Tauri)
  const library = useLibrary();
  const {
    tracks,
    libraryFolders,
    isScanning,
    scanProgress,
    scanCurrent,
    scanTotal,
    scanCurrentFile,
    addFolder,
    removeFolder,
    refreshFolders,
    removeTrack,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    advancedFilters,
    setAdvancedFilters,
    filteredTracks,
    refreshTracks,
  } = library;

  // UI state
  const {
    colorScheme, setColorScheme, currentColors, colorSchemes,
    customThemes, saveCustomTheme, deleteCustomTheme, applyCustomTheme,
    debugVisible, setDebugVisible, layouts, currentLayout, applyLayout,
    backgroundImage, setBackgroundImage, backgroundBlur, setBackgroundBlur,
    backgroundOpacity, setBackgroundOpacity, windowOpacity, setWindowOpacity,
    fontSize, setFontSize
  } = useUIState();

  // Window management
  const { windows, setWindows, setMaxZIndex, bringToFront, toggleWindow } = useWindowManagement();


  // Audio hook (Tauri)
  const audio = useAudio({
    initialVolume: volume,
    onEnded: () => {
      if (repeatMode === 'one') {
        audio.seek(0);
        audio.play().catch(err => {
          console.error('Failed to replay:', err);
          toast.showError('Failed to replay track');
        });
      } else if (repeatMode === 'all' || currentTrack < filteredTracks.length - 1) {
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
  
  // Unified player hook combining playback and volume controls
  const playerHook = usePlayerHook({ 
    audio, 
    player: {
      currentTrack, setCurrentTrack,
      shuffle, repeatMode,
      progress, duration,
      volume, setVolume
    }, 
    tracks: filteredTracks,
    toast,
    crossfade
  });

  const trackLoading = useTrackLoading({ 
    audio, 
    tracks: filteredTracks, 
    currentTrack,
    playing,
    setDuration,
    setLoadingTrackIndex,
    progress,
    toast,
    removeTrack,
    setCurrentTrack,
    handleNextTrack: playerHook.handleNextTrack
  });

  // Listen for global shortcuts from Tauri
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
          playerHook.toggleMute();
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

  // Keyboard shortcuts
  useKeyboardShortcuts({
    playback: {
      togglePlay: () => setPlaying(p => !p),
      nextTrack: playerHook.handleNextTrack,
      prevTrack: playerHook.handlePrevTrack,
      volumeUp: () => {
        const newVol = Math.min(1, volume + VOLUME_STEP);
        playerHook.handleVolumeChange(newVol);
      },
      volumeDown: () => {
        const newVol = Math.max(0, volume - VOLUME_STEP);
        playerHook.handleVolumeChange(newVol);
      },
    },
    ui: {
      toggleWindow,
      focusSearch: () => {
        const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]');
        searchInput?.focus();
      },
    },
  });

  // Apply saved volume to audio backend on mount
  useEffect(() => {
    audio.changeVolume(volume).catch(err => {
      console.error('Failed to set initial volume:', err);
    });
  }, []); // Only run once on mount

  // Sync duration from audio hook
  useEffect(() => {
    setDuration(audio.duration);
  }, [audio.duration, setDuration]);

  useEffect(() => {
    setProgress(audio.progress);
    // Save position every few seconds (not every update to avoid excessive writes)
    if (audio.progress > 0 && Math.floor(audio.progress) % 5 === 0) {
      localStorage.setItem('vplayer_last_position', audio.progress.toString());
    }
  }, [audio.progress, setProgress]);

  // Restore last played track on mount
  useEffect(() => {
    if (trackLoading.hasRestoredTrack || filteredTracks.length === 0) return;
    
    const savedTrackId = localStorage.getItem('vplayer_last_track');
    if (savedTrackId) {
      const trackIndex = filteredTracks.findIndex(t => t.id === savedTrackId);
      if (trackIndex !== -1) {
        setCurrentTrack(trackIndex);
      }
    }
    trackLoading.setHasRestoredTrack(true);
  }, [filteredTracks, trackLoading, setCurrentTrack]);

  // Sync playing state with audio
  useEffect(() => {
    if (playing && !audio.isPlaying) {
      audio.play().catch(err => {
        console.error('Failed to play:', err);
        toast.showError('Failed to play track');
        setPlaying(false);
      });
    } else if (!playing && audio.isPlaying) {
      audio.pause().catch(err => {
        console.error('Failed to pause:', err);
        toast.showError('Failed to pause');
      });
    }
  }, [playing, audio, setPlaying, toast]);

  // Track play count when a new track starts playing
  useEffect(() => {
    if (playing && currentTrack !== null && filteredTracks[currentTrack]) {
      const track = filteredTracks[currentTrack];
      
      invoke('increment_play_count', { trackId: track.id })
        .catch(err => console.warn('Failed to increment play count:', err));
    }
  }, [playing, currentTrack, filteredTracks]);

  const handleAddFolder = useCallback(async () => {
    try {
      await addFolder();
      toast.showSuccess('Folder added successfully');
    } catch (err) {
      console.error('Failed to add folder:', err);
      toast.showError('Failed to add folder');
    }
  }, [addFolder, toast]);

  const handleRefreshFolders = useCallback(async () => {
    try {
      const newTracksCount = await refreshFolders();
      if (newTracksCount > 0) {
        toast.showSuccess(`Found ${newTracksCount} new or modified track${newTracksCount > 1 ? 's' : ''}`);
      } else {
        toast.showInfo('All folders are up to date');
      }
    } catch (err) {
      console.error('Failed to refresh folders:', err);
      toast.showError('Failed to refresh folders');
    }
  }, [refreshFolders, toast]);

  const handleRemoveFolder = useCallback(async (folderId, folderPath) => {
    try {
      await removeFolder(folderId, folderPath);
      toast.showSuccess('Folder removed successfully');
      
      if (currentTrack !== null && filteredTracks[currentTrack]?.folderId === folderId) {
        setCurrentTrack(null);
        setPlaying(false);
      }
    } catch (err) {
      console.error('Failed to remove folder:', err);
      toast.showError('Failed to remove folder');
    }
  }, [removeFolder, currentTrack, filteredTracks, setCurrentTrack, setPlaying, toast]);

  // Handle track rating changes
  const handleRatingChange = useCallback((trackId, newRating) => {
    // Update track rating in local state optimistically
    // The database is already updated by the StarRating component
    // This just refreshes the UI if needed
    refreshTracks();
  }, [refreshTracks]);
  
  // Handle duplicates removed
  const handleDuplicateRemoved = useCallback(() => {
    refreshTracks();
    toast.showSuccess('Track removed successfully');
  }, [refreshTracks, toast]);

  // Drag & Drop handlers
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    
    try {
      const files = e.dataTransfer.files;
      if (files.length === 0) return;
      
      // For now, only handle folders (directories)
      // Tauri file drop gives us paths as File objects
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // In Tauri, we get the path from the file
        // We'll attempt to add it as a folder
        try {
          await addFolder();
          toast.showSuccess('Folder added successfully');
        } catch (err) {
          console.error('Failed to add dropped folder:', err);
          toast.showError('Failed to add folder. Please use the Add Folder button.');
        }
      }
    } catch (err) {
      console.error('Drop error:', err);
      toast.showError('Failed to process dropped files');
    }
  }, [addFolder, toast]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Memoize window configurations to prevent unnecessary re-renders
  const windowConfigs = useMemo(() => [
    {
      id: 'player',
      title: 'Player',
      icon: Music,
      content: (
        <PlayerWindow
          currentTrack={currentTrack}
          tracks={filteredTracks}
          playing={playing}
          progress={progress}
          duration={duration}
          volume={volume}
          setVolume={playerHook.handleVolumeChange}
          currentColors={currentColors}
          togglePlay={() => setPlaying(p => !p)}
          nextTrack={playerHook.handleNextTrack}
          prevTrack={playerHook.handlePrevTrack}
          setShuffle={setShuffle}
          shuffle={shuffle}
          setRepeatMode={setRepeatMode}
          repeatMode={repeatMode}
          seekToPercent={playerHook.handleSeek}
          toggleWindow={toggleWindow}
          isLoading={audio.isLoading}
          isMuted={audio.isMuted}
          toggleMute={playerHook.toggleMute}
          audioBackendError={audio.audioBackendError}
          onMinimize={() => setMiniPlayerMode(true)}
        />
      ),
    },
    {
      id: 'playlist',
      title: 'Playlist',
      icon: List,
      content: (
        <PlaylistWindow
          tracks={filteredTracks}
          currentTrack={currentTrack ?? 0}
          setCurrentTrack={setCurrentTrack}
          currentColors={currentColors}
          loadingTrackIndex={loadingTrackIndex}
          removeTrack={removeTrack}
          onRatingChange={handleRatingChange}
        />
      ),
    },
    {
      id: 'library',
      title: 'Library',
      icon: FolderOpen,
      content: (
        <LibraryWindow
          libraryFolders={libraryFolders}
          tracks={filteredTracks}
          tracksCount={filteredTracks.length}
          currentColors={currentColors}
          isScanning={isScanning}
          scanProgress={scanProgress}
          scanCurrent={scanCurrent}
          scanTotal={scanTotal}
          scanCurrentFile={scanCurrentFile}
          handleAddFolder={handleAddFolder}
          handleRefreshFolders={handleRefreshFolders}
          handleRemoveFolder={handleRemoveFolder}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          advancedFilters={advancedFilters}
          setAdvancedFilters={setAdvancedFilters}
          onOpenDuplicates={() => setDuplicatesWindowOpen(true)}
        />
      ),
    },
    {
      id: 'equalizer',
      title: 'Equalizer',
      icon: Sliders,
      content: (
        <EqualizerWindow
          eqBands={equalizer.eqBands}
          setEqBands={equalizer.setEqBands}
          currentColors={currentColors}
          currentPreset={equalizer.currentPreset}
          applyPreset={equalizer.applyPreset}
          resetEQ={equalizer.resetEQ}
          presets={equalizer.presets}
        />
      ),
    },
    {
      id: 'visualizer',
      title: 'Visualizer',
      icon: Music,
      content: (
        <VisualizerWindow
          currentColors={currentColors}
          isPlaying={playing}
        />
      ),
    },
    {
      id: 'options',
      title: 'Options',
      icon: Settings,
      content: (
        <OptionsWindow
          windows={windows}
          toggleWindow={toggleWindow}
          colorScheme={colorScheme}
          setColorScheme={setColorScheme}
          colorSchemes={colorSchemes}
          debugVisible={debugVisible}
          setDebugVisible={setDebugVisible}
          currentColors={currentColors}
          layouts={layouts}
          currentLayout={currentLayout}
          applyLayout={applyLayout}
          crossfade={crossfade}
          onOpenThemeEditor={() => setThemeEditorOpen(true)}
          backgroundImage={backgroundImage}
          setBackgroundImage={setBackgroundImage}
          backgroundBlur={backgroundBlur}
          setBackgroundBlur={setBackgroundBlur}
          backgroundOpacity={backgroundOpacity}
          setBackgroundOpacity={setBackgroundOpacity}
          windowOpacity={windowOpacity}
          setWindowOpacity={setWindowOpacity}
          fontSize={fontSize}
          setFontSize={setFontSize}
        />
      ),
    },
    {
      id: 'queue',
      title: 'Queue',
      icon: ListOrdered,
      content: (
        <QueueWindow
          currentColors={currentColors}
          setCurrentTrack={setCurrentTrack}
          tracks={filteredTracks}
        />
      ),
    },
    {
      id: 'history',
      title: 'History',
      icon: History,
      content: (
        <HistoryWindow
          currentColors={currentColors}
          setCurrentTrack={setCurrentTrack}
          tracks={filteredTracks}
        />
      ),
    },
    {
      id: 'albums',
      title: 'Albums',
      icon: Disc,
      content: (
        <AlbumViewWindow
          tracks={filteredTracks}
          currentColors={currentColors}
          setCurrentTrack={setCurrentTrack}
        />
      ),
    },
    {
      id: 'smartPlaylists',
      title: 'Smart Playlists',
      icon: Sparkles,
      content: (
        <SmartPlaylistsWindow
          tracks={filteredTracks}
          currentColors={currentColors}
          setCurrentTrack={setCurrentTrack}
        />
      ),
    },
  ], [
    currentTrack, filteredTracks, playing, progress, duration, volume,
    currentColors, shuffle, repeatMode, audio.isLoading,
    playerHook.handleVolumeChange, playerHook.handleNextTrack,
    playerHook.handlePrevTrack, playerHook.handleSeek,
    setPlaying, setShuffle, setRepeatMode, toggleWindow, setCurrentTrack,
    removeTrack, libraryFolders, isScanning, scanProgress, scanCurrent,
    scanTotal, scanCurrentFile, handleAddFolder, handleRemoveFolder,
    searchQuery, setSearchQuery, sortBy, setSortBy, sortOrder, setSortOrder,
    equalizer.eqBands, equalizer.setEqBands, windows, colorScheme,
    setColorScheme, colorSchemes, debugVisible, setDebugVisible, loadingTrackIndex,
    layouts, currentLayout, applyLayout
  ]);

  return (
    <div 
      className="w-full h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{ fontSize: `${fontSize}px` }}
    >
      {/* Mini Player Mode */}
      {miniPlayerMode ? (
        <div className="fixed top-4 right-4 z-[100]">
          <MiniPlayerWindow
            currentTrack={currentTrack}
            tracks={filteredTracks}
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
            toggleMute={playerHook.toggleMute}
          />
        </div>
      ) : (
        <>
      {/* Background Image */}
      {backgroundImage && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url("${backgroundImage}")`,
            filter: `blur(${backgroundBlur}px)`,
            opacity: backgroundOpacity,
            transform: 'scale(1.1)' // Prevent blur edges from showing
          }}
        />
      )}
      
      {/* Toast notifications */}
      <ToastContainer toasts={toast.toasts} removeToast={toast.removeToast} />

      {/* Audio backend error banner */}
      {audio.audioBackendError && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-900/90 backdrop-blur-sm text-white px-4 py-3 text-center text-sm border-b border-red-700">
          <div className="font-semibold">Audio System Unavailable</div>
          <div className="text-xs mt-1 text-red-200">
            {audio.audioBackendError}. Playback controls are disabled. Please restart the application.
          </div>
        </div>
      )}

      {/* Debug toggle */}
      {process.env.NODE_ENV === 'development' && (
          <button
            title="Toggle Debug"
            onClick={() => setDebugVisible(v => !v)}
            className="fixed bottom-4 right-4 z-[60] bg-slate-800 text-white px-3 py-2 rounded-full shadow-lg hover:bg-slate-700 transition-colors text-xs font-mono"
          >
            {debugVisible ? 'Hide' : 'Show'} Debug
          </button>
        )}

        {/* Debug panel */}
        {debugVisible && (
          <div className="fixed bottom-16 right-4 z-[60] bg-slate-800/95 text-white p-4 rounded-lg shadow-xl max-w-sm text-xs font-mono space-y-1">
            <div>Track: {currentTrack !== null ? `${currentTrack + 1}/${filteredTracks.length}` : 'None'}</div>
            <div>Playing: {playing ? 'Yes' : 'No'}</div>
            <div>Loading: {audio.isLoading ? 'Yes' : 'No'}</div>
            <div>Progress: {progress.toFixed(1)}s / {duration.toFixed(1)}s</div>
            <div>Volume: {(volume * 100).toFixed(0)}%</div>
            <div>Shuffle: {shuffle ? 'On' : 'Off'}</div>
            <div>Repeat: {repeatMode}</div>
            <div>Folders: {libraryFolders.length}</div>
            <div>Tracks: {filteredTracks.length} / {tracks.length}</div>
            <div>Scanning: {isScanning ? `${scanProgress}% (${scanCurrent}/${scanTotal})` : 'No'}</div>
            <div>LoadedTrackId: {trackLoading.loadedTrackId ? 'Yes' : 'No'}</div>
            {searchQuery && <div>Search: "{searchQuery}"</div>}
          </div>
        )}

        {/* Render floating windows */}
        {windowConfigs.map(cfg => (
          windows[cfg.id]?.visible && (
            <ErrorBoundary key={cfg.id} fallbackMessage={`Failed to render ${cfg.title} window`}>
              <Window
                id={cfg.id}
                title={cfg.title}
                icon={cfg.icon}
                windowData={windows[cfg.id]}
                currentColors={currentColors}
                bringToFront={bringToFront}
                setWindows={setWindows}
                toggleWindow={toggleWindow}
                windowOpacity={windowOpacity}
              >
                {cfg.content}
              </Window>
            </ErrorBoundary>
          )
        ))}
        
        {/* Duplicates Window */}
        <DuplicatesWindow
          isOpen={duplicatesWindowOpen}
          onClose={() => setDuplicatesWindowOpen(false)}
          onDuplicateRemoved={handleDuplicateRemoved}
        />
        
        {/* Theme Editor Window */}
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
    </div>
  );
};

const VPlayer = () => (
  <AudioContextProvider>
    <VPlayerInner />
  </AudioContextProvider>
);

export default VPlayer;