import React, { useEffect, useMemo, useCallback } from 'react';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { PlayerWindow } from './windows/PlayerWindow';
import { LibraryProvider, useLibraryContext } from './context/LibraryContext';
import { UIProvider, useUIContext } from './context/UIContext';
import { useWindows } from './hooks/useWindows';
import { useLibrary } from './hooks/useLibrary';
import { useAudio } from './hooks/useAudio';
import { Play, Pause, SkipForward, SkipBack, Volume2, Music, Settings, List, Sliders, Minimize2, Maximize2, X, Eye, EyeOff, Palette, FolderOpen, Shuffle, Repeat } from 'lucide-react';
import { PlaylistWindow } from './windows/PlaylistWindow';
import { LibraryWindow } from './windows/LibraryWindow';
import { EqualizerWindow } from './windows/EqualizerWindow';
import { VisualizerWindow } from './windows/VisualizerWindow';
import { OptionsWindow } from './windows/OptionsWindow';
import { Window } from './components/Window';
// jsmediatags sometimes exposes a non-resolvable package entry for ESM build tools.
// We'll dynamically import the browser bundle when needed to avoid Vite resolution issues.
import { scanHandleAndMerge, handleRemoveFolder, handleRescanAll } from './utils/libraryUtils';
import { LibraryContent } from './components/LibraryContent';




const VPlayerInner = () => {
  // Move all context hooks to the top
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

  const {
    tracks, setTracks,
    libraryFolders, setLibraryFolders,
    orphanedTracks, setOrphanedTracks,
    isScanning, setIsScanning,
    scanProgress, setScanProgress,
    folderPermissions, setFolderPermissions
  } = useLibraryContext();

  const {
    windows, setWindows,
    maxZIndex, setMaxZIndex,
    colorScheme, setColorScheme,
    currentColors,
    colorSchemes,
    debugVisible, setDebugVisible
  } = useUIContext();

  // Local state for eqBands and visualizerBars
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
  const [visualizerBars, setVisualizerBars] = React.useState(Array(32).fill(10));

  // Real logic for Library actions
  const handleAddFolder = useCallback(async () => {
    try {
      // Show directory picker (File System Access API)
      if ('showDirectoryPicker' in window) {
        const handle = await window.showDirectoryPicker();
        setIsScanning(true);
        setScanProgress(0);
        const numFiles = await scanHandleAndMerge(handle, setTracks, setLibraryFolders);
        setIsScanning(false);
        setScanProgress(100);
        // Save permission for future access
        setFolderPermissions(prev => ({ ...prev, [handle.name]: handle }));
      } else {
        alert('Directory picker not supported in this browser.');
      }
    } catch (err) {
      setIsScanning(false);
      alert('Failed to add folder: ' + err.message);
    }
  }, [scanHandleAndMerge, setTracks, setLibraryFolders, setIsScanning, setScanProgress, setFolderPermissions]);

  const handleRemoveFolderCb = useCallback((folderPath) => {
    handleRemoveFolder(
      folderPath,
      tracks,
      libraryFolders,
      setTracks,
      setLibraryFolders,
      setFolderPermissions,
      setWindows,
      setCurrentTrack,
      colorScheme
    );
  }, [tracks, libraryFolders, setTracks, setLibraryFolders, setFolderPermissions, setWindows, setCurrentTrack, colorScheme]);

  const handleRescanAllCb = useCallback(() => {
    handleRescanAll(libraryFolders);
  }, [libraryFolders]);


  // Window config
  const windowConfigs = [
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
              nextTrack={() => setCurrentTrack(t => (t !== null && t < tracks.length - 1 ? t + 1 : t))}
              prevTrack={() => setCurrentTrack(t => (t !== null && t > 0 ? t - 1 : t))}
              setShuffle={setShuffle}
              shuffle={shuffle}
              setRepeatMode={setRepeatMode}
              repeatMode={repeatMode}
              seekToPercent={pct => setProgress(pct)}
              toggleWindow={id => {
                setWindows(prev => ({
                  ...prev,
                  [id]: { ...prev[id], visible: !prev[id].visible }
                }));
              }}
            />
          ),
        },
    {
      id: 'playlist',
      title: 'Playlist',
      icon: List,
      content: (
        <PlaylistWindow
          tracks={tracks || []}
          currentTrack={currentTrack ?? 0}
          setCurrentTrack={setCurrentTrack}
          currentColors={currentColors || { accent: '#fff' }}
          loadingTrackIndex={loadingTrackIndex}
        />
      ),
    },
    {
      id: 'library',
      title: 'Library',
      icon: FolderOpen,
      content: (
        <LibraryWindow
          libraryFolders={libraryFolders || []}
          tracks={tracks || []}
          tracksCount={tracks?.length || 0}
          currentColors={currentColors || { accent: '#fff' }}
          isScanning={isScanning}
          scanProgress={scanProgress}
          folderPermissions={folderPermissions || {}}
          orphanedTracks={orphanedTracks || []}
          setOrphanedTracks={setOrphanedTracks}
          setTracks={setTracks}
          colorScheme={colorScheme}
          windows={windows}
          currentTrack={currentTrack ?? 0}
          setFolderPermissions={setFolderPermissions}
          setLibraryFolders={setLibraryFolders}
          setCurrentTrack={setCurrentTrack}
          setColorScheme={setColorScheme}
          handleAddFolder={handleAddFolder}
          handleRemoveFolder={handleRemoveFolderCb}
          handleRescanAll={handleRescanAllCb}
        />
      ),
    },
    {
      id: 'equalizer',
      title: 'Equalizer',
      icon: Sliders,
      content: (
        <EqualizerWindow
          eqBands={eqBands || []}
          currentColors={currentColors || { accent: '#fff' }}
        />
      ),
    },
    {
      id: 'visualizer',
      title: 'Visualizer',
      icon: Music,
      content: (
        <VisualizerWindow
          visualizerBars={visualizerBars || []}
          currentColors={currentColors || { accent: '#fff', primary: 'bg-cyan-500' }}
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
          toggleWindow={() => {}}
          colorScheme={colorScheme}
          setColorScheme={setColorScheme}
          colorSchemes={colorSchemes || [{ accent: '#fff' }]}
          debugVisible={debugVisible}
          setDebugVisible={setDebugVisible}
          currentColors={currentColors || { accent: '#fff' }}
        />
      ),
    },
  ];

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden relative">
      <button
        title="Toggle Debug"
        onClick={() => setDebugVisible(v => !v)}
        className="fixed bottom-4 right-4 z-60 bg-slate-800 text-white p-2 rounded-full shadow-lg hover:bg-slate-700"
        style={{ width: 40, height: 40 }}
      >
        Debug
      </button>
      {/* Render floating windows */}
      {windowConfigs.map(cfg => (
        windows[cfg.id] ? (
          <Window
            key={cfg.id}
            id={cfg.id}
            title={cfg.title}
            icon={cfg.icon}
            windowData={windows[cfg.id]}
            bringToFront={id => {
              if (typeof maxZIndex === 'number' && setMaxZIndex) {
                setMaxZIndex(maxZIndex + 1);
                setWindows(prev => ({
                  ...prev,
                  [id]: { ...prev[id], zIndex: maxZIndex + 1 }
                }));
              }
            }}
            setWindows={setWindows}
            toggleWindow={id => {
              setWindows(prev => ({
                ...prev,
                [id]: { ...prev[id], visible: !prev[id].visible }
              }));
            }}
            currentColors={currentColors}
          >
            {cfg.content}
          </Window>
        ) : null
      ))}
    </div>
  );
}

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
