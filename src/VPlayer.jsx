import React, { useEffect, useMemo, useCallback } from 'react';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { UIProvider, useUIContext } from './context/UIContext';
import { AudioContextProvider } from './context/AudioContextProvider';
import { useAudioTauri } from './hooks/useAudioTauri';
import { useLibraryTauri } from './hooks/useLibraryTauri';
import { 
  Music, Settings, List, Sliders, FolderOpen
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

  // Library hook (Tauri)
  const library = useLibraryTauri();
  const {
    tracks,
    libraryFolders,
    isScanning,
    scanProgress,
    addFolder,
    removeFolder,
    removeTrack,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    filteredTracks,
  } = library;

  // UI context
  const {
    windows, setWindows,
    maxZIndex, setMaxZIndex,
    colorScheme, setColorScheme,
    currentColors,
    colorSchemes,
    debugVisible, setDebugVisible
  } = useUIContext();

  // Audio hook (Tauri)
  const audio = useAudioTauri({
    initialVolume: volume,
    onEnded: () => {
      if (repeatMode === 'one') {
        audio.seek(0);
        audio.play();
      } else if (repeatMode === 'all' || currentTrack < filteredTracks.length - 1) {
        handleNextTrack();
      } else {
        setPlaying(false);
      }
    },
    onTimeUpdate: (time) => {
      setProgress(time);
    },
  });

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

  // Volume change handler
  const handleVolumeChange = useCallback((newVolume) => {
    setVolume(newVolume);
    audio.changeVolume(newVolume);
  }, [audio, setVolume]);

  // Track loading state
  const [loadedTrackId, setLoadedTrackId] = React.useState(null);
  const [hasRestoredTrack, setHasRestoredTrack] = React.useState(false);

  // Restore last played track on mount
  useEffect(() => {
    if (hasRestoredTrack || filteredTracks.length === 0) return;
    
    const savedTrackId = localStorage.getItem('vplayer_last_track');
    if (savedTrackId) {
      const trackIndex = filteredTracks.findIndex(t => t.id === savedTrackId);
      if (trackIndex !== -1) {
        setCurrentTrack(trackIndex);
      }
    }
    setHasRestoredTrack(true);
  }, [filteredTracks, hasRestoredTrack, setCurrentTrack]);

  // Sync playing state with audio
  useEffect(() => {
    if (playing && !audio.isPlaying) {
      audio.play();
    } else if (!playing && audio.isPlaying) {
      audio.pause();
    }
  }, [playing, audio]);

  // Load track when currentTrack changes
  useEffect(() => {
    const loadTrack = async () => {
      if (currentTrack !== null && filteredTracks[currentTrack]) {
        const track = filteredTracks[currentTrack];
        
        // Save last played track and position
        localStorage.setItem('vplayer_last_track', track.id);
        localStorage.setItem('vplayer_last_position', progress.toString());
        
        // Don't reload if already loaded
        if (loadedTrackId === track.id) {
          return;
        }
        
        console.log('Loading track:', track.name);
        setLoadingTrackIndex(currentTrack);
        
        try {
          await audio.loadTrack(track);
          setLoadedTrackId(track.id);
          setLoadingTrackIndex(null);
          setDuration(track.duration || 0);
          
          // Restore last position if this is the restored track
          const savedTrackId = localStorage.getItem('vplayer_last_track');
          if (track.id === savedTrackId && hasRestoredTrack && progress === 0) {
            const savedPosition = localStorage.getItem('vplayer_last_position');
            if (savedPosition) {
              const position = parseFloat(savedPosition);
              if (position > 0 && position < track.duration) {
                await audio.seek(position);
                setProgress(position);
              }
            }
          }
          
          // Auto-play if playing state is true
          if (playing) {
            await audio.play();
          }
        } catch (err) {
          console.error('Failed to load track:', err);
          setLoadingTrackIndex(null);
          setLoadedTrackId(null);
        }
      }
    };
    
    loadTrack();
  }, [currentTrack, filteredTracks, loadedTrackId, audio, playing, setLoadingTrackIndex, setDuration, hasRestoredTrack, progress]);

  // Track navigation
  const handleNextTrack = useCallback(() => {
    if (!filteredTracks.length) return;
    
    if (shuffle) {
      let nextIdx;
      do {
        nextIdx = Math.floor(Math.random() * filteredTracks.length);
      } while (nextIdx === currentTrack && filteredTracks.length > 1);
      setCurrentTrack(nextIdx);
    } else {
      const nextIdx = currentTrack + 1;
      if (nextIdx < filteredTracks.length) {
        setCurrentTrack(nextIdx);
      } else if (repeatMode === 'all') {
        setCurrentTrack(0);
      }
    }
  }, [currentTrack, filteredTracks, shuffle, repeatMode, setCurrentTrack]);

  const handlePrevTrack = useCallback(() => {
    if (!filteredTracks.length) return;
    
    if (progress > 3) {
      audio.seek(0);
      return;
    }

    if (shuffle) {
      let prevIdx;
      do {
        prevIdx = Math.floor(Math.random() * filteredTracks.length);
      } while (prevIdx === currentTrack && filteredTracks.length > 1);
      setCurrentTrack(prevIdx);
    } else {
      const prevIdx = currentTrack - 1;
      if (prevIdx >= 0) {
        setCurrentTrack(prevIdx);
      } else if (repeatMode === 'all') {
        setCurrentTrack(filteredTracks.length - 1);
      }
    }
  }, [currentTrack, filteredTracks, shuffle, repeatMode, progress, audio, setCurrentTrack]);

  const handleSeek = useCallback((percent) => {
    if (duration > 0) {
      const time = (percent / 100) * duration;
      audio.seek(time);
    }
  }, [duration, audio]);

  const toggleWindow = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], visible: !prev[id].visible }
    }));
  }, [setWindows]);

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

  const handleAddFolder = useCallback(async () => {
    try {
      await addFolder();
      console.log('Folder added successfully');
    } catch (err) {
      console.error('Failed to add folder:', err);
      alert(`Failed to add folder: ${err.message}`);
    }
  }, [addFolder]);

  const handleRemoveFolder = useCallback(async (folderId, folderPath) => {
    try {
      await removeFolder(folderId, folderPath);
      console.log('Folder removed successfully');
      
      if (currentTrack !== null && filteredTracks[currentTrack]?.folderId === folderId) {
        setCurrentTrack(null);
        setPlaying(false);
      }
    } catch (err) {
      console.error('Failed to remove folder:', err);
      alert(`Failed to remove folder: ${err.message}`);
    }
  }, [removeFolder, currentTrack, filteredTracks, setCurrentTrack, setPlaying]);

  // EQ bands state
  const [eqBands, setEqBands] = React.useState([
    { freq: "60Hz", value: 50 },
    { freq: "170Hz", value: 50 },
    { freq: "310Hz", value: 50 },
    { freq: "600Hz", value: 50 },
    { freq: "1kHz", value: 50 },
    { freq: "3kHz", value: 50 },
    { freq: "6kHz", value: 50 },
    { freq: "12kHz", value: 50 },
    { freq: "14kHz", value: 50 },
    { freq: "16kHz", value: 50 }
  ]);

  // Window configurations - DON'T memoize, just define inline
  const windowConfigs = [
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
          setVolume={handleVolumeChange}
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
          isMuted={false}
          toggleMute={() => {}}
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
          tracks={filteredTracks}
          tracksCount={filteredTracks.length}
          currentColors={currentColors}
          isScanning={isScanning}
          scanProgress={scanProgress}
          handleAddFolder={handleAddFolder}
          handleRemoveFolder={handleRemoveFolder}
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
        />
      ),
    },
  ];

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden relative">
      {/* Wrap with AudioContextProvider - no audio element needed for Tauri */}
      <AudioContextProvider audioElement={null}>
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
            <div>Scanning: {isScanning ? `${scanProgress}%` : 'No'}</div>
            <div>LoadedTrackId: {loadedTrackId ? 'Yes' : 'No'}</div>
            {searchQuery && <div>Search: "{searchQuery}"</div>}
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
      </AudioContextProvider>
    </div>
  );
};

const VPlayer = () => (
  <PlayerProvider>
    <UIProvider>
      <VPlayerInner />
    </UIProvider>
  </PlayerProvider>
);

export default VPlayer;