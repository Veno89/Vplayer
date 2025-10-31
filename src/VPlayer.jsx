import React, { useEffect, useMemo, useCallback } from 'react';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { LibraryProvider, useLibraryContext } from './context/LibraryContext';
import { UIProvider, useUIContext } from './context/UIContext';
import { useAudio } from './hooks/useAudio';
import { 
  Play, Pause, SkipForward, SkipBack, Volume2, Music, 
  Settings, List, Sliders, FolderOpen, Shuffle, Repeat 
} from 'lucide-react';
import { PlayerWindow } from './windows/PlayerWindow';
import { PlaylistWindow } from './windows/PlaylistWindow';
import { LibraryWindow } from './windows/LibraryWindow';
import { EqualizerWindow } from './windows/EqualizerWindow';
import { VisualizerWindow } from './windows/VisualizerWindow';
import { OptionsWindow } from './windows/OptionsWindow';
import { Window } from './components/Window';

const VPlayerInner = () => {
  // Player context
  const {
    currentTrack, setCurrentTrack,
    playing, setPlaying,
    progress, setProgress,
    duration, setDuration,
    volume, setVolume,
    shuffle, setShuffle,
    repeatMode, setRepeatMode,
    loadingTrackIndex, setLoadingTrackIndex
  } = usePlayer();

  // Library context - now with all the enhanced functions
  const {
    tracks,
    libraryFolders,
    orphanedTracks,
    isScanning,
    scanProgress,
    addFolder,           // From enhanced useLibrary
    removeFolder,        // From enhanced useLibrary
    rescanFolder,        // From enhanced useLibrary
    rescanAll,           // From enhanced useLibrary
    cancelScan,          // From enhanced useLibrary
    removeTrack,         // From enhanced useLibrary
    addOrphanedTrack,    // From enhanced useLibrary
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    filteredTracks
  } = useLibraryContext();

  // UI context
  const {
    windows, setWindows,
    maxZIndex, setMaxZIndex,
    colorScheme, setColorScheme,
    currentColors,
    colorSchemes,
    debugVisible, setDebugVisible
  } = useUIContext();

  // Audio hook - THIS WAS MISSING!
  const audio = useAudio({
    initialVolume: volume,
    onEnded: () => {
      // Handle track end based on repeat mode
      if (repeatMode === 'one') {
        audio.seek(0);
        audio.play();
      } else if (repeatMode === 'all' || currentTrack < tracks.length - 1) {
        handleNextTrack();
      } else {
        setPlaying(false);
      }
    },
    onLoadedMetadata: (dur) => {
      setDuration(dur);
      setLoadingTrackIndex(null);
    },
    onTimeUpdate: (time) => {
      setProgress(time);
    },
    onError: (err) => {
      console.error('Audio playback error:', err);
      setLoadingTrackIndex(null);
      setPlaying(false);
      // Optionally skip to next track on error
      // handleNextTrack();
    }
  });

  // Sync volume changes
  useEffect(() => {
    audio.changeVolume(volume);
  }, [volume, audio]);

  // Sync playing state
  useEffect(() => {
    if (playing) {
      audio.play();
    } else {
      audio.pause();
    }
  }, [playing, audio]);

  // Load track when currentTrack changes
  useEffect(() => {
    if (currentTrack !== null && tracks[currentTrack]) {
      const track = tracks[currentTrack];
      if (track.url) {
        setLoadingTrackIndex(currentTrack);
        audio.loadSrc(track.url);
        // Auto-play if was playing
        if (playing) {
          audio.play();
        }
      }
    }
  }, [currentTrack, tracks, audio, playing, setLoadingTrackIndex]);

  // Track navigation with shuffle support
  const handleNextTrack = useCallback(() => {
    if (!tracks.length) return;
    
    if (shuffle) {
      // Random track (avoid current track)
      let nextIdx;
      do {
        nextIdx = Math.floor(Math.random() * tracks.length);
      } while (nextIdx === currentTrack && tracks.length > 1);
      setCurrentTrack(nextIdx);
    } else {
      // Sequential
      const nextIdx = currentTrack + 1;
      if (nextIdx < tracks.length) {
        setCurrentTrack(nextIdx);
      } else if (repeatMode === 'all') {
        setCurrentTrack(0);
      }
    }
  }, [currentTrack, tracks, shuffle, repeatMode, setCurrentTrack]);

  const handlePrevTrack = useCallback(() => {
    if (!tracks.length) return;
    
    // If more than 3 seconds in, restart current track
    if (progress > 3) {
      audio.seek(0);
      return;
    }

    if (shuffle) {
      // Random track
      let prevIdx;
      do {
        prevIdx = Math.floor(Math.random() * tracks.length);
      } while (prevIdx === currentTrack && tracks.length > 1);
      setCurrentTrack(prevIdx);
    } else {
      // Sequential
      const prevIdx = currentTrack - 1;
      if (prevIdx >= 0) {
        setCurrentTrack(prevIdx);
      } else if (repeatMode === 'all') {
        setCurrentTrack(tracks.length - 1);
      }
    }
  }, [currentTrack, tracks, shuffle, repeatMode, progress, audio, setCurrentTrack]);

  // Seek handler
  const handleSeek = useCallback((percent) => {
    if (duration > 0) {
      const time = (percent / 100) * duration;
      audio.seek(time);
    }
  }, [duration, audio]);

  // Toggle window helper
  const toggleWindow = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], visible: !prev[id].visible }
    }));
  }, [setWindows]);

  // Bring window to front
  const bringToFront = useCallback((id) => {
    setMaxZIndex(prev => {
      const newZ = prev + 1;
      setWindows(w => ({
        ...w,
        [id]: { ...w[id], zIndex: newZ }
      }));
      return newZ;
    });
  }, [setMaxZIndex, setWindows]);

  // Add folder wrapper with error handling
  const handleAddFolder = useCallback(async () => {
    try {
      const count = await addFolder();
      console.log(`Added ${count} tracks`);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to add folder:', err);
        alert(`Failed to add folder: ${err.message}`);
      }
    }
  }, [addFolder]);

  // Remove folder wrapper
  const handleRemoveFolder = useCallback(async (folderId) => {
    try {
      const count = await removeFolder(folderId);
      console.log(`Removed ${count} tracks`);
      
      // If current track was in removed folder, stop playback
      if (currentTrack !== null && tracks[currentTrack]?.folderId === folderId) {
        setCurrentTrack(null);
        setPlaying(false);
      }
    } catch (err) {
      console.error('Failed to remove folder:', err);
      alert(`Failed to remove folder: ${err.message}`);
    }
  }, [removeFolder, currentTrack, tracks, setCurrentTrack, setPlaying]);

  // Equalizer bands (could be moved to context)
  const [eqBands, setEqBands] = React.useState([
    { freq: "60Hz", value: 50 },
    { freq: "170Hz", value: 45 },
    { freq: "310Hz", value: 55 },
    { freq: "600Hz", value: 50 },
    { freq: "1kHz", value: 60 },
    { freq: "3kHz", value: 48 },
    { freq: "6kHz", value: 52 },
    { freq: "12kHz", value: 58 },
    { freq: "14kHz", value: 55 },
    { freq: "16kHz", value: 50 }
  ]);

  // Visualizer bars (could be connected to actual audio analysis)
  const [visualizerBars, setVisualizerBars] = React.useState(Array(32).fill(10));

  // Update visualizer based on audio (placeholder - needs Web Audio API)
  useEffect(() => {
    if (!playing) return;
    
    const interval = setInterval(() => {
      setVisualizerBars(bars => 
        bars.map(() => Math.random() * 90 + 10)
      );
    }, 100);
    
    return () => clearInterval(interval);
  }, [playing]);

  // Window configurations
  const windowConfigs = useMemo(() => [
    {
      id: 'player',
      title: 'Player',
      icon: Music,
      content: (
        <PlayerWindow
          currentTrack={currentTrack}
          tracks={tracks}
          playing={playing}
          progress={progress}
          duration={duration}
          volume={volume}
          setVolume={setVolume}
          colorScheme={colorScheme}
          currentColors={currentColors}
          togglePlay={() => setPlaying(p => !p)}
          nextTrack={handleNextTrack}
          prevTrack={handlePrevTrack}
          setShuffle={setShuffle}
          shuffle={shuffle}
          setRepeatMode={setRepeatMode}
          repeatMode={repeatMode}
          seekToPercent={handleSeek}
          toggleWindow={toggleWindow}
          isLoading={audio.isLoading}
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
          tracks={tracks}
          tracksCount={tracks.length}
          currentColors={currentColors}
          isScanning={isScanning}
          scanProgress={scanProgress}
          orphanedTracks={orphanedTracks}
          currentTrack={currentTrack ?? 0}
          handleAddFolder={handleAddFolder}
          handleRemoveFolder={handleRemoveFolder}
          handleRescanAll={rescanAll}
          cancelScan={cancelScan}
          addOrphanedTrack={addOrphanedTrack}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
        />
      ),
    },
    {
      id: 'equalizer',
      title: 'Equalizer',
      icon: Sliders,
      content: (
        <EqualizerWindow
          eqBands={eqBands}
          setEqBands={setEqBands}
          currentColors={currentColors}
          audioElement={audio.audioRef.current}
        />
      ),
    },
    {
      id: 'visualizer',
      title: 'Visualizer',
      icon: Music,
      content: (
        <VisualizerWindow
          visualizerBars={visualizerBars}
          currentColors={currentColors}
          audioElement={audio.audioRef.current}
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
        />
      ),
    },
  ], [
    currentTrack, tracks, playing, progress, duration, volume, colorScheme,
    currentColors, shuffle, repeatMode, loadingTrackIndex, libraryFolders,
    isScanning, scanProgress, orphanedTracks, eqBands, visualizerBars,
    windows, colorSchemes, debugVisible, filteredTracks, searchQuery,
    sortBy, sortOrder, audio, handleNextTrack, handlePrevTrack, handleSeek,
    toggleWindow, handleAddFolder, handleRemoveFolder, rescanAll, cancelScan,
    addOrphanedTrack, removeTrack, setSearchQuery, setSortBy, setSortOrder,
    setVolume, setPlaying, setShuffle, setRepeatMode, setCurrentTrack,
    setColorScheme, setDebugVisible, setEqBands
  ]);

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden relative">
      {/* Hidden audio element - CRITICAL! */}
      <audio ref={audio.audioRef} />
      
      {/* Debug toggle button */}
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
          <div>Track: {currentTrack !== null ? `${currentTrack + 1}/${tracks.length}` : 'None'}</div>
          <div>Playing: {playing ? 'Yes' : 'No'}</div>
          <div>Loading: {audio.isLoading ? 'Yes' : 'No'}</div>
          <div>Progress: {progress.toFixed(1)}s / {duration.toFixed(1)}s</div>
          <div>Volume: {(volume * 100).toFixed(0)}%</div>
          <div>Shuffle: {shuffle ? 'On' : 'Off'}</div>
          <div>Repeat: {repeatMode}</div>
          <div>Folders: {libraryFolders.length}</div>
          <div>Scanning: {isScanning ? `${scanProgress}%` : 'No'}</div>
        </div>
      )}

      {/* Render floating windows */}
      {windowConfigs.map(cfg => (
        windows[cfg.id]?.visible && (
          <Window
            key={cfg.id}
            id={cfg.id}
            title={cfg.title}
            icon={cfg.icon}
            windowData={windows[cfg.id]}
            bringToFront={bringToFront}
            setWindows={setWindows}
            toggleWindow={toggleWindow}
            currentColors={currentColors}
          >
            {cfg.content}
          </Window>
        )
      ))}
    </div>
  );
};

const VPlayer = () => (
  <PlayerProvider>
    <LibraryProvider>
      <UIProvider>
        <VPlayerInner />
      </UIProvider>
    </LibraryProvider>
  </PlayerProvider>
);

export default VPlayer;