import React, { useState } from 'react';
import { FolderOpen, Search, RefreshCw, Trash2, X, Loader, AlertCircle, FileQuestion, Copy } from 'lucide-react';
import { AdvancedSearch } from '../components/AdvancedSearch';
import { invoke } from '@tauri-apps/api/core';

export function LibraryWindow({
  libraryFolders,
  tracks,
  tracksCount,
  currentColors,
  isScanning,
  scanProgress,
  scanCurrent,
  scanTotal,
  scanCurrentFile,
  handleAddFolder,
  handleRefreshFolders,
  handleRemoveFolder,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  advancedFilters,
  setAdvancedFilters,
  onOpenDuplicates,
}) {
  const [removingFolder, setRemovingFolder] = useState(null);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [missingFiles, setMissingFiles] = useState([]);
  const [showMissingFiles, setShowMissingFiles] = useState(false);
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [isRefreshingFolders, setIsRefreshingFolders] = useState(false);

  // Check for missing files
  const handleCheckMissingFiles = async () => {
    setCheckingMissing(true);
    try {
      const missing = await invoke('check_missing_files');
      setMissingFiles(missing);
      setShowMissingFiles(true);
    } catch (err) {
      console.error('Failed to check missing files:', err);
      alert('Failed to check for missing files');
    } finally {
      setCheckingMissing(false);
    }
  };

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
              handleRefreshFolders();
            }}
            disabled={isScanning || libraryFolders.length === 0}
            className="px-3 py-1 bg-green-700 text-white text-xs rounded hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title="Refresh All Folders (Incremental Scan)"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              if (onOpenDuplicates) onOpenDuplicates();
            }}
            disabled={isScanning}
            className="px-3 py-1 bg-purple-700 text-white text-xs rounded hover:bg-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title="Find Duplicate Tracks"
          >
            <Copy className="w-3 h-3" />
            Duplicates
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              handleCheckMissingFiles();
            }}
            disabled={isScanning || checkingMissing}
            className="px-3 py-1 bg-orange-700 text-white text-xs rounded hover:bg-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title="Check for Missing Files"
          >
            {checkingMissing ? (
              <Loader className="w-3 h-3 animate-spin" />
            ) : (
              <FileQuestion className="w-3 h-3" />
            )}
            Check Missing
          </button>
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

      {/* Missing Files Alert */}
      {showMissingFiles && missingFiles.length > 0 && (
        <div className="bg-orange-900/20 border border-orange-700/50 rounded p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-orange-300 text-sm font-medium mb-1">
                  {missingFiles.length} Missing File{missingFiles.length > 1 ? 's' : ''} Found
                </div>
                <div className="text-orange-400 text-xs mb-2">
                  These tracks can't be found at their original locations. You may want to remove them or relocate them.
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {missingFiles.slice(0, 10).map(([trackId, path]) => (
                    <div key={trackId} className="text-xs text-slate-400 truncate" title={path}>
                      • {path}
                    </div>
                  ))}
                  {missingFiles.length > 10 && (
                    <div className="text-xs text-slate-500">
                      ... and {missingFiles.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowMissingFiles(false)}
              className="text-slate-400 hover:text-white flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Advanced Search */}
      <AdvancedSearch
        filters={{ query: searchQuery, ...advancedFilters }}
        onFiltersChange={(filters) => {
          setSearchQuery(filters.query || '');
          setAdvancedFilters({
            genre: filters.genre || '',
            yearFrom: filters.yearFrom || '',
            yearTo: filters.yearTo || '',
            minRating: filters.minRating || 0,
            durationFrom: filters.durationFrom || '',
            durationTo: filters.durationTo || '',
            folderId: filters.folderId || ''
          });
        }}
        showAdvanced={showAdvancedSearch}
        onToggleAdvanced={() => setShowAdvancedSearch(!showAdvancedSearch)}
      />

      {/* Folder Filter and Sort Controls */}
      <div className="flex items-center justify-between gap-3">
        {/* Folder Filter */}
        {libraryFolders.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Folder:</span>
            <select
              value={advancedFilters.folderId || ''}
              onChange={(e) => setAdvancedFilters({ ...advancedFilters, folderId: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              className="px-2 py-1 bg-slate-800 text-white text-xs rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Folders</option>
              {libraryFolders.map(folder => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort Controls */}
        <div className="flex gap-2 text-xs">
          <span className="text-slate-400">Sort:</span>
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
      </div>

      {/* Scanning Progress */}
      {isScanning && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded p-3 space-y-2">
          <div className="flex items-center gap-3">
            <Loader className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-blue-300 text-sm font-medium mb-1">
                Scanning folders... {scanProgress}%
              </div>
              <div className="text-blue-400 text-xs truncate" title={scanCurrentFile}>
                {scanCurrent > 0 && scanTotal > 0 ? (
                  <>
                    {scanCurrent} / {scanTotal} files
                    {scanCurrentFile && ` • ${scanCurrentFile}`}
                  </>
                ) : (
                  'Initializing...'
                )}
              </div>
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300 ease-out"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Folders List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {libraryFolders.length === 0 && !isScanning ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <AlertCircle className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm mb-2">No folders added yet</p>
            <p className="text-slate-500 text-xs mb-4">
              Click "Add Folder" to start building your library
            </p>
          </div>
        ) : (
          libraryFolders.map(folder => {
            const folderTracks = tracks.filter(t => t.path.startsWith(folder.path));
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
                    <div className="text-xs text-slate-500 truncate mb-1" title={folder.path}>
                      {folder.path}
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