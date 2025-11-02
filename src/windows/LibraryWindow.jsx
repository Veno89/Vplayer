import React, { useState } from 'react';
import { FolderOpen, Search, RefreshCw, Trash2, X, Loader, AlertCircle } from 'lucide-react';

export function LibraryWindow({
  libraryFolders,
  tracks,
  tracksCount,
  currentColors,
  isScanning,
  scanProgress,
  handleAddFolder,
  handleRemoveFolder,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
}) {
  const [removingFolder, setRemovingFolder] = useState(null);

  // Handle folder removal with confirmation
  const handleRemove = async (folderId, folderPath, folderName) => {
    if (!confirm(`Remove "${folderName}" and all its tracks from library?`)) {
      return;
    }
    
    setRemovingFolder(folderId);
    try {
      await handleRemoveFolder(folderId, folderPath);
    } catch (err) {
      alert(`Failed to remove folder: ${err.message}`);
    } finally {
      setRemovingFolder(null);
    }
  };

  // Toggle sort order
  const handleSortClick = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header with Actions */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <FolderOpen className={`w-5 h-5 ${currentColors.accent}`} />
          Music Library
        </h3>
        <div className="flex gap-2">
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              handleAddFolder();
            }}
            disabled={isScanning}
            className="px-3 py-1 bg-blue-700 text-white text-xs rounded hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title="Add Music Folder"
          >
            <FolderOpen className="w-3 h-3" />
            Add Folder
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          placeholder="Search tracks, artists, albums..."
          className="w-full pl-10 pr-4 py-2 bg-slate-800 text-white text-sm rounded border border-slate-700 focus:border-cyan-500 focus:outline-none"
        />
        {searchQuery && (
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Sort Controls */}
      <div className="flex gap-2 text-xs">
        <span className="text-slate-400">Sort by:</span>
        {['title', 'artist', 'album', 'dateAdded'].map(field => (
          <button
            key={field}
            onMouseDown={e => e.stopPropagation()}
            onClick={() => handleSortClick(field)}
            className={`px-2 py-1 rounded transition-colors ${
              sortBy === field
                ? `${currentColors.primary} text-white`
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {field === 'dateAdded' ? 'Date' : field.charAt(0).toUpperCase() + field.slice(1)}
            {sortBy === field && (
              <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
            )}
          </button>
        ))}
      </div>

      {/* Scanning Progress */}
      {isScanning && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded p-3 flex items-center gap-3">
          <Loader className="w-5 h-5 text-blue-400 animate-spin" />
          <div className="flex-1">
            <div className="text-blue-300 text-sm font-medium mb-1">
              Scanning folders... {scanProgress}%
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Folders List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {libraryFolders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <AlertCircle className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm mb-2">No folders added yet</p>
            <p className="text-slate-500 text-xs mb-4">
              Click "Add Folder" to start building your library
            </p>
          </div>
        ) : (
          libraryFolders.map(folder => {
            const folderTracks = tracks.filter(t => t.folderId === folder.id);
            const isRemoving = removingFolder === folder.id;

            return (
              <div
                key={folder.id}
                className="bg-slate-800/50 border border-slate-700 rounded p-3 hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FolderOpen className={`w-4 h-4 ${currentColors.accent} flex-shrink-0`} />
                      <h4 className="text-white text-sm font-medium truncate" title={folder.name}>
                        {folder.name}
                      </h4>
                    </div>
                    <div className="flex gap-4 text-xs text-slate-400">
                      <span>{folderTracks.length} tracks</span>
                      <span>Added {new Date(folder.dateAdded).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation();
                      handleRemove(folder.id, folder.path, folder.name);
                    }}
                    disabled={isScanning || isRemoving}
                    className="p-1.5 bg-red-700/20 hover:bg-red-700/40 text-red-400 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    title="Remove Folder"
                  >
                    {isRemoving ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Stats */}
      <div className="border-t border-slate-700 pt-3 flex justify-between text-xs text-slate-400">
        <span>{libraryFolders.length} folder{libraryFolders.length !== 1 ? 's' : ''}</span>
        <span>{tracksCount} track{tracksCount !== 1 ? 's' : ''}</span>
        {searchQuery && (
          <span className="text-cyan-400">
            {tracks.length} result{tracks.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}