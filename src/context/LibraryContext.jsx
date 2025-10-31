import React, { createContext, useContext, useState } from 'react';

const LibraryContext = createContext();

export function LibraryProvider({ children }) {
  const [tracks, setTracks] = useState([]); // always array
  const [libraryFolders, setLibraryFolders] = useState([]); // always array
  const [orphanedTracks, setOrphanedTracks] = useState([]); // always array
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [folderPermissions, setFolderPermissions] = useState({}); // always object

  const value = {
    tracks, setTracks,
    libraryFolders, setLibraryFolders,
    orphanedTracks, setOrphanedTracks,
    isScanning, setIsScanning,
    scanProgress, setScanProgress,
    folderPermissions, setFolderPermissions
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibraryContext() {
  return useContext(LibraryContext);
}
