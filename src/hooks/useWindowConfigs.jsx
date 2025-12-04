import React from 'react';
import { Music, Settings, List, Sliders, FolderOpen, ListOrdered, History, Disc, Sparkles, FileText, Keyboard, BarChart3, Tag } from 'lucide-react';
import { PlayerWindow } from '../windows/PlayerWindow';
import { PlaylistWindow } from '../windows/PlaylistWindow';
import { LibraryWindow } from '../windows/LibraryWindow';
import { EqualizerWindow } from '../windows/EqualizerWindow';
import { VisualizerWindow } from '../windows/VisualizerWindow';
import { OptionsWindowEnhanced as OptionsWindow } from '../windows/OptionsWindowEnhanced';
import { QueueWindow } from '../windows/QueueWindow';
import { HistoryWindow } from '../windows/HistoryWindow';
import { AlbumViewWindow } from '../windows/AlbumViewWindow';
import { SmartPlaylistsWindow } from '../windows/SmartPlaylistsWindow';
import { LibraryStatsWindow } from '../windows/LibraryStatsWindow';
import { TagEditorWindow } from '../windows/TagEditorWindow';
import LyricsWindow from '../windows/LyricsWindow';
import ShortcutsWindow from '../windows/ShortcutsWindow';

/**
 * Hook to generate window configurations
 */
export function useWindowConfigs({
  // Player
  currentTrack,
  tracks,
  playing,
  setPlaying,
  progress,
  duration,
  volume,
  shuffle,
  setShuffle,
  repeatMode,
  setRepeatMode,
  loadingTrackIndex,
  // Library
  libraryFolders,
  isScanning,
  scanProgress,
  scanCurrent,
  scanTotal,
  scanCurrentFile,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  advancedFilters,
  setAdvancedFilters,
  // UI
  currentColors,
  colorScheme,
  setColorScheme,
  colorSchemes,
  windows,
  debugVisible,
  setDebugVisible,
  layouts,
  currentLayout,
  applyLayout,
  // Handlers
  playerHook,
  audioIsLoading,
  audioBackendError,
  toggleWindow,
  setCurrentTrack,
  removeTrack,
  handleRatingChange,
  handleAddFolder,
  handleRefreshFolders,
  handleRemoveFolder,
  setDuplicatesWindowOpen,
  equalizer,
  setThemeEditorOpen,
  backgroundImage,
  setBackgroundImage,
  backgroundBlur,
  setBackgroundBlur,
  backgroundOpacity,
  setBackgroundOpacity,
  windowOpacity,
  setWindowOpacity,
  fontSize,
  setFontSize,
  customThemes,
  saveCustomTheme,
  deleteCustomTheme,
  applyCustomTheme,
  // Crossfade
  crossfade,
  // Tag Editor
  tagEditorTrack,
  setTagEditorTrack,
  onTagsSaved,
}) {
  return React.useMemo(() => [
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
          isLoading={audioIsLoading}
          isMuted={false}
          toggleMute={() => {}}
          audioBackendError={audioBackendError}
        />
      ),
    },
    {
      id: 'playlist',
      title: 'Playlist',
      icon: List,
      content: (
        <PlaylistWindow
          tracks={tracks}
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
          tracks={tracks}
          tracksCount={tracks.length}
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
          layouts={layouts}
          currentLayout={currentLayout}
          applyLayout={applyLayout}
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
          currentColors={currentColors}
          customThemes={customThemes}
          saveCustomTheme={saveCustomTheme}
          deleteCustomTheme={deleteCustomTheme}
          applyCustomTheme={applyCustomTheme}
          crossfade={crossfade}
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
          tracks={tracks}
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
        />
      ),
    },
    {
      id: 'albums',
      title: 'Albums',
      icon: Disc,
      content: (
        <AlbumViewWindow
          tracks={tracks}
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
          tracks={tracks}
          currentColors={currentColors}
          setCurrentTrack={setCurrentTrack}
        />
      ),
    },
    {
      id: 'lyrics',
      title: 'Lyrics',
      icon: FileText,
      content: (
        <LyricsWindow
          id="lyrics"
          onClose={() => toggleWindow('lyrics')}
        />
      ),
    },
    {
      id: 'shortcuts',
      title: 'Keyboard Shortcuts',
      icon: Keyboard,
      content: (
        <ShortcutsWindow
          id="shortcuts"
          onClose={() => toggleWindow('shortcuts')}
        />
      ),
    },
    {
      id: 'stats',
      title: 'Library Stats',
      icon: BarChart3,
      content: (
        <LibraryStatsWindow
          tracks={tracks}
          libraryFolders={libraryFolders}
          currentColors={currentColors}
        />
      ),
    },
    {
      id: 'tagEditor',
      title: 'Tag Editor',
      icon: Tag,
      content: (
        <TagEditorWindow
          track={tagEditorTrack}
          onClose={() => setTagEditorTrack?.(null)}
          onSave={onTagsSaved}
          currentColors={currentColors}
        />
      ),
    },
  ], [
    currentTrack, tracks, playing, progress, duration, volume,
    currentColors, shuffle, repeatMode, audioIsLoading,
    playerHook, setPlaying, setShuffle, setRepeatMode, toggleWindow, setCurrentTrack,
    removeTrack, libraryFolders, isScanning, scanProgress, scanCurrent,
    scanTotal, scanCurrentFile, handleAddFolder, handleRemoveFolder,
    searchQuery, setSearchQuery, sortBy, setSortBy, sortOrder, setSortOrder,
    equalizer, windows, colorScheme,
    setColorScheme, colorSchemes, debugVisible, setDebugVisible, loadingTrackIndex,
    layouts, currentLayout, applyLayout, handleRatingChange, handleRefreshFolders,
    advancedFilters, setAdvancedFilters, setDuplicatesWindowOpen, audioBackendError,
    setThemeEditorOpen, backgroundImage, setBackgroundImage, backgroundBlur,
    setBackgroundBlur, backgroundOpacity, setBackgroundOpacity, windowOpacity,
    setWindowOpacity, fontSize, setFontSize, customThemes, saveCustomTheme,
    deleteCustomTheme, applyCustomTheme, crossfade, tagEditorTrack, setTagEditorTrack,
    onTagsSaved
  ]);
}
