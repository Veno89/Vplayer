import React, { useState } from 'react';
import { useToast } from '../hooks/useToast';
import { FolderOpen, Search, RefreshCw, Trash2, X, Loader, AlertCircle, FileQuestion, Copy, ChevronDown, ChevronRight, Music, GripVertical } from 'lucide-react';
import { AdvancedSearch } from '../components/AdvancedSearch';
import { invoke } from '@tauri-apps/api/core';
import { TauriAPI } from '../services/TauriAPI';
import { formatDuration } from '../utils/formatters';
import { StarRating } from '../components/StarRating';
import { FixedSizeList } from 'react-window';

// Virtual list row component for track rendering
const VirtualTrackRow = ({ index, style, data }) => {
  const { tracks, onTrackDragStart, onTrackDragEnd } = data;
  const track = tracks[index];
  
  return (
    <div
      style={style}
      draggable
      onDragStart={(e) => {
        const trackData = [{
          id: track.id,
          path: track.path,
          title: track.title || track.name,
          artist: track.artist,
          album: track.album
        }];
        
        e.dataTransfer.setData('application/json', JSON.stringify(trackData));
        e.dataTransfer.effectAllowed = 'copy';
        
        if (onTrackDragStart) onTrackDragStart(trackData);
      }}
      onDragEnd={(e) => {
        if (onTrackDragEnd) onTrackDragEnd();
      }}
      className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800/50 cursor-move transition-colors border-b border-slate-800"
      title="Drag to add to playlist"
    >
      <Music className="w-3 h-3 text-slate-500 flex-shrink-0" />
      <span className="flex-1 truncate text-white">{track.title || track.name}</span>
      <span className="w-24 truncate text-slate-400">{track.artist || 'Unknown'}</span>
      <span className="w-20 truncate text-slate-500">{track.album || ''}</span>
      <span className="w-10 text-right text-slate-500">
        {track.duration ? formatDuration(track.duration) : ''}
      </span>
    </div>
  );
};

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
  onTrackDragStart,
  onTrackDragEnd,
}) {
  const [removingFolder, setRemovingFolder] = useState(null);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [missingFiles, setMissingFiles] = useState([]);
  const [showMissingFiles, setShowMissingFiles] = useState(false);
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [isRefreshingFolders, setIsRefreshingFolders] = useState(false);
  const [expandedFolder, setExpandedFolder] = useState(null);
  const [removingDuplicates, setRemovingDuplicates] = useState(false);
  const { showSuccess, showError, showInfo } = useToast();

  // Memoize folder tracks calculations to prevent lag
  const folderTracksMap = React.useMemo(() => {
    const map = new Map();
    libraryFolders.forEach(folder => {
      map.set(folder.id, tracks.filter(t => t.path.startsWith(folder.path)));
    });
    return map;
  }, [libraryFolders, tracks]);

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

  const handleRemoveDuplicates = async () => {
    setRemovingDuplicates(true);
    try {
      let totalRemoved = 0;
      let foldersRemoved = 0;

      // First, remove duplicate folders
      try {
        foldersRemoved = await TauriAPI.removeDuplicateFolders();
      } catch (error) {
        console.error('Failed to remove duplicate folders:', error);
      }

      // Then, remove duplicate tracks
      const groups = await invoke('find_duplicates');
      if (groups.length > 0) {
        for (const group of groups) {
          if (group.length > 1) {
            // Keep the first track, remove the rest
            const tracksToRemove = group.slice(1);
            for (const track of tracksToRemove) {
              await invoke('remove_track', { trackId: track.id });
              totalRemoved++;
            }
          }
        }
      }

      if (foldersRemoved > 0 || totalRemoved > 0) {
        let message = '';
        if (foldersRemoved > 0 && totalRemoved > 0) {
          message = `Removed ${foldersRemoved} duplicate folder(s) and ${totalRemoved} duplicate track(s)`;
        } else if (foldersRemoved > 0) {
          message = `Removed ${foldersRemoved} duplicate folder(s)`;
        } else {
          message = `Removed ${totalRemoved} duplicate track(s)`;
        }
        showSuccess(message);
        // Refresh the library
        handleRefreshFolders();
      } else {
        showSuccess('No duplicates found!');
      }
    } catch (error) {
      console.error('Failed to remove duplicates:', error);
      showError('Failed to remove duplicates');
    } finally {
      setRemovingDuplicates(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
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
              handleRemoveDuplicates();
            }}
            disabled={isScanning || removingDuplicates}
            className="px-3 py-1 bg-purple-700 text-white text-xs rounded hover:bg-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title="Remove Duplicate Tracks and Folders"
          >
            {removingDuplicates ? (
              <Loader className="w-3 h-3 animate-spin" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            {removingDuplicates ? 'Removing...' : 'Remove Duplicates'}
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
        <div className="flex gap-2 text-xs" onMouseDown={e => e.stopPropagation()}>
          <span className="text-slate-400">Sort:</span>
          {['title', 'artist', 'album', 'dateAdded'].map(field => (
            <button
              key={field}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                handleSortClick(field);
              }}
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
            const folderTracks = folderTracksMap.get(folder.id) || [];
            const isRemoving = removingFolder === folder.id;
            const isExpanded = expandedFolder === folder.id;

            return (
              <div
                key={folder.id}
                className="bg-slate-800/50 border border-slate-700 rounded overflow-hidden"
              >
                <div className="p-3 hover:bg-slate-800 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div 
                      onClick={(e) => {
                        if (e.target.closest('button')) return;
                        if (e.target.closest('[draggable="true"]')) return;
                        setExpandedFolder(isExpanded ? null : folder.id);
                      }}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          draggable={!isScanning && !isRemoving}
                          onDragStart={(e) => {
                            const folderTracksData = folderTracks.map(t => ({
                              id: t.id,
                              path: t.path,
                              title: t.title || t.name,
                              artist: t.artist,
                              album: t.album
                            }));
                            
                            // Set data FIRST
                            e.dataTransfer.setData('application/json', JSON.stringify(folderTracksData));
                            e.dataTransfer.effectAllowed = 'copy';
                            
                            if (onTrackDragStart) onTrackDragStart(folderTracksData);
                          }}
                          onDragEnd={(e) => {
                            if (onTrackDragEnd) onTrackDragEnd();
                          }}
                          className="cursor-move p-1 hover:bg-slate-700/50 rounded"
                          title="Drag to add all tracks to playlist"
                        >
                          <GripVertical className="w-4 h-4 text-slate-500" />
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        )}
                        <FolderOpen className={`w-4 h-4 ${currentColors.accent} flex-shrink-0`} />
                        <h4 className="text-white text-sm font-medium truncate" title={folder.name}>
                          {folder.name}
                        </h4>
                      </div>
                      <div className="text-xs text-slate-500 truncate mb-1 ml-8" title={folder.path}>
                        {folder.path}
                      </div>
                      <div className="flex gap-4 text-xs text-slate-400 ml-8">
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
                
                {/* Expanded Track List */}
                {isExpanded && folderTracks.length > 0 && (
                  <div className="border-t border-slate-700 bg-slate-900/50">
                    <FixedSizeList
                      height={Math.min(256, folderTracks.length * 36)}
                      itemCount={folderTracks.length}
                      itemSize={36}
                      width="100%"
                      overscanCount={5}
                      itemData={{ tracks: folderTracks, onTrackDragStart, onTrackDragEnd }}
                    >
                      {VirtualTrackRow}
                    </FixedSizeList>
                  </div>
                )}
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