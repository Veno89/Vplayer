import React from 'react';
import { LibraryContent } from '../components/LibraryContent';
import { FolderOpen, Settings, X } from 'lucide-react';

export function LibraryWindow({
  libraryFolders,
  tracksCount,
  isScanning,
  scanProgress,
  handleAddFolder,
  handleRemoveFolder,
  currentColors,
  folderPermissions,
  handleRescanAll,
  orphanedTracks,
  setOrphanedTracks,
  setTracks,
  colorScheme,
  windows,
  currentTrack,
  setFolderPermissions,
  setLibraryFolders,
  setCurrentTrack,
  setColorScheme,
  tracks,
}) {
  return (
    <LibraryContent
      libraryFolders={libraryFolders}
      tracksCount={tracksCount}
      isScanning={isScanning}
      scanProgress={scanProgress}
      handleAddFolder={handleAddFolder}
      handleRemoveFolder={handleRemoveFolder}
      handleRescanAll={handleRescanAll}
      currentColors={currentColors}
    />
  );
}
