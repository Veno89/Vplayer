import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { List, Trash2, MoreVertical, Loader, Plus, Edit2, X, Search, ArrowDown, ArrowDownToLine, Star } from 'lucide-react';
import { TrackList } from '../components/TrackList';
import { formatDuration } from '../utils/formatters';
import { usePlaylists } from '../hooks/usePlaylists';
import { ContextMenu, getTrackContextMenuItems } from '../components/ContextMenu';
import { useStore } from '../store/useStore';
import { StarRating } from '../components/StarRating';
import { TauriAPI } from '../services/TauriAPI';

export function PlaylistWindow({ 
  tracks, 
  currentTrack, 
  setCurrentTrack, 
  currentColors, 
  loadingTrackIndex,
  removeTrack,
  onRatingChange,
  onActiveTracksChange,
  onEditTags, // New prop for tag editor
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [showNewPlaylistDialog, setShowNewPlaylistDialog] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // New dialogs for context menu
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(null); // track to add
  const [showRatingDialog, setShowRatingDialog] = useState(null); // track for rating
  // Multi-select state
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [showBatchPlaylistPicker, setShowBatchPlaylistPicker] = useState(false); // for batch add to playlist
  const containerRef = useRef(null);
  const trackListRef = useRef(null);
  
  const playlists = usePlaylists();
  const addToQueue = useStore(state => state.addToQueue);
  const playlistAutoScroll = useStore(state => state.playlistAutoScroll);
  const setPlaylistAutoScroll = useStore(state => state.setPlaylistAutoScroll);
  
  // Listen for global track drop events from VPlayer
  useEffect(() => {
    const handleGlobalDrop = (e) => {
      if (!e.detail?.data) return;
      
      // Prevent duplicate handling with a flag
      if (e.detail.handled) return;
      e.detail.handled = true;
      
      try {
        const tracks = JSON.parse(e.detail.data);
        handleExternalDrop({ 
          preventDefault: () => {}, 
          stopPropagation: () => {},
          dataTransfer: { getData: () => e.detail.data }
        });
      } catch (err) {
        console.error('Failed to handle global drop:', err);
      }
    };
    
    window.addEventListener('vplayer-track-drop', handleGlobalDrop);
    
    return () => {
      window.removeEventListener('vplayer-track-drop', handleGlobalDrop);
    };
  }, [playlists.currentPlaylist]);
  
  // Fuzzy search filter
  const displayTracks = useMemo(() => {
    const tracks = playlists.playlistTracks;
    if (!searchQuery.trim()) return tracks;

    const query = searchQuery.toLowerCase();
    return tracks.filter(track => {
      const searchableText = [
        track.title,
        track.artist,
        track.album,
        track.genre
      ].filter(Boolean).join(' ').toLowerCase();

      // Fuzzy match: check if all characters in query appear in order
      let queryIndex = 0;
      for (let i = 0; i < searchableText.length && queryIndex < query.length; i++) {
        if (searchableText[i] === query[queryIndex]) {
          queryIndex++;
        }
      }
      return queryIndex === query.length;
    });
  }, [playlists.playlistTracks, searchQuery]);

  // Handle track selection - map filtered index to original index
  const handleTrackSelect = useCallback((filteredIndex) => {
    const selectedTrack = displayTracks[filteredIndex];
    if (!selectedTrack) return;
    
    // Find the original index in the full tracks array
    const originalIndex = tracks.findIndex(t => t.id === selectedTrack.id);
    if (originalIndex !== -1) {
      setCurrentTrack(originalIndex);
    }
  }, [displayTracks, tracks, setCurrentTrack]);

  // Map current track index to filtered display index
  const displayCurrentTrack = useMemo(() => {
    if (currentTrack === null || currentTrack === undefined) return null;
    const currentTrackObj = tracks[currentTrack];
    if (!currentTrackObj) return null;
    
    return displayTracks.findIndex(t => t.id === currentTrackObj.id);
  }, [currentTrack, tracks, displayTracks]);
  
  // Auto-scroll to current track when it changes
  useEffect(() => {
    if (playlistAutoScroll && displayCurrentTrack !== null && displayCurrentTrack >= 0 && trackListRef.current) {
      trackListRef.current.scrollToItem(displayCurrentTrack, 'center');
    }
  }, [displayCurrentTrack, playlistAutoScroll]);
  
  // Manual scroll to current track
  const scrollToCurrentTrack = useCallback(() => {
    if (displayCurrentTrack !== null && displayCurrentTrack >= 0 && trackListRef.current) {
      trackListRef.current.scrollToItem(displayCurrentTrack, 'center');
    }
  }, [displayCurrentTrack]);

  // Handle batch actions from multi-select
  const handleBatchAction = useCallback(async (action, selectedTracks) => {
    if (!selectedTracks || selectedTracks.length === 0) return;
    
    switch (action) {
      case 'queue':
        // Add all selected tracks to queue
        selectedTracks.forEach(track => addToQueue(track, 'end'));
        // Clear selection
        setSelectedIndices(new Set());
        break;
        
      case 'playlist':
        // Show playlist picker for batch add
        setShowBatchPlaylistPicker(true);
        break;
        
      case 'delete':
        // Remove selected tracks from current playlist
        if (!playlists.currentPlaylist) return;
        if (confirm(`Remove ${selectedTracks.length} track(s) from this playlist?`)) {
          for (const track of selectedTracks) {
            await playlists.removeTrackFromPlaylist(playlists.currentPlaylist, track.id);
          }
          setSelectedIndices(new Set());
        }
        break;
        
      default:
        console.warn('Unknown batch action:', action);
    }
  }, [addToQueue, playlists, setSelectedIndices]);

  // Get selected tracks from indices
  const getSelectedTracks = useCallback(() => {
    return Array.from(selectedIndices).map(i => displayTracks[i]).filter(Boolean);
  }, [selectedIndices, displayTracks]);
  
  // Update active tracks when displayTracks changes
  useEffect(() => {
    if (onActiveTracksChange) {
      onActiveTracksChange(displayTracks);
    }
  }, [displayTracks, onActiveTracksChange]);

  // Save current playlist to localStorage when it changes
  useEffect(() => {
    if (playlists.currentPlaylist) {
      localStorage.setItem('vplayer_last_playlist', playlists.currentPlaylist);
    }
  }, [playlists.currentPlaylist]);

  // Drag and drop handlers for playlist reordering
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    
    // Only handle internal reordering
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newTracks = [...displayTracks];
    const draggedTrack = newTracks[draggedIndex];
    newTracks.splice(draggedIndex, 1);
    newTracks.splice(dropIndex, 0, draggedTrack);

    const trackPositions = newTracks.map((track, idx) => [track.id, idx]);
    
    try {
      await playlists.reorderPlaylistTracks(playlists.currentPlaylist, trackPositions);
    } catch (err) {
      console.error('Failed to reorder tracks:', err);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Handle external track drops
  const handleExternalDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    
    try {
      const tracks = JSON.parse(data);
      
      if (!playlists.currentPlaylist) {
        alert('Please select or create a playlist first');
        return;
      }
      
      await playlists.addTracksToPlaylist(playlists.currentPlaylist, tracks.map(t => t.id));
    } catch (err) {
      console.error('Drop failed:', err);
      alert('Failed to add tracks to playlist');
    }
  };

  // Memoize itemData to prevent recreating on every render
  const itemData = useMemo(() => ({ 
    tracks: displayTracks, 
    currentTrack, 
    onSelect: setCurrentTrack, 
    currentColors, 
    loadingTrackIndex,
    onRatingChange,
    isDraggable: !!playlists.currentPlaylist,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    draggedIndex,
    onShowMenu: (index, e) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        index,
        track: displayTracks[index],
        x: e.clientX || e.pageX,
        y: e.clientY || e.pageY
      });
    }
  }), [displayTracks, currentTrack, setCurrentTrack, currentColors, loadingTrackIndex, onRatingChange, playlists.currentPlaylist, draggedIndex]);

  // Close context menu
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Handle track removal
  const handleRemoveTrack = (index) => {
    const track = displayTracks[index];
    if (!track || !playlists.currentPlaylist) return;
    
    // Remove from playlist
    if (confirm(`Remove "${track.title}" from this playlist?`)) {
      playlists.removeTrackFromPlaylist(playlists.currentPlaylist, track.id);
    }
    
    // Adjust current track if needed
    if (currentTrack === index) {
      setCurrentTrack(Math.min(index, displayTracks.length - 2));
    } else if (currentTrack > index) {
      setCurrentTrack(currentTrack - 1);
    }
    
    closeContextMenu();
  };
  
  // Create new playlist
  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    
    try {
      const newPlaylist = await playlists.createPlaylist(newPlaylistName);
      setNewPlaylistName('');
      setShowNewPlaylistDialog(false);
      // Auto-select the new playlist
      if (newPlaylist && newPlaylist.id) {
        await playlists.setCurrentPlaylist(newPlaylist.id);
      }
    } catch (err) {
      alert('Failed to create playlist');
    }
  };
  
  // Delete playlist
  const handleDeletePlaylist = async (playlistId) => {
    console.log('[PlaylistWindow] Deleting playlist immediately, no confirmation:', playlistId);
    try {
      await playlists.deletePlaylist(playlistId);
      
      // Clear saved playlist if we deleted it
      if (localStorage.getItem('vplayer_last_playlist') === playlistId) {
        localStorage.removeItem('vplayer_last_playlist');
      }
    } catch (err) {
      alert('Failed to delete playlist');
    }
  };
  
  // Switch to playlist
  const handleSelectPlaylist = (playlistId) => {
    playlists.setCurrentPlaylist(playlistId);
  };

  // Close context menu on outside click
  useEffect(() => {
    if (contextMenu) {
      const handler = () => closeContextMenu();
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [contextMenu]);

  // Empty state
  if (playlists.playlistTracks.length === 0 && !searchQuery) {
    return (
      <div className="flex flex-col h-full" ref={containerRef}>
        {/* Playlist Selector */}
        <div className="flex items-center gap-2 p-3 border-b border-slate-700">
          <div className="flex-1 overflow-x-auto flex gap-1">
            {playlists.playlists.map(pl => (
              <button
                key={pl.id}
                onClick={() => handleSelectPlaylist(pl.id)}
                className={`px-3 py-1 text-sm rounded whitespace-nowrap transition-colors ${
                  playlists.currentPlaylist === pl.id
                    ? `${currentColors.accent} bg-slate-800`
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {pl.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowNewPlaylistDialog(true)}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            title="New Playlist"
          >
            <Plus className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        
        {/* Empty State with Drop Zone */}
        <div 
          className={`flex-1 flex flex-col items-center justify-center text-center p-4 transition-colors ${
            isDraggingOver ? 'bg-blue-500/10 border-2 border-dashed border-blue-500' : ''
          }`}
        >
          <List className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm mb-2">
            {isDraggingOver 
              ? 'Drop tracks here to add them'
              : 'No tracks in this playlist'}
          </p>
          <p className="text-slate-500 text-xs">
            Drag tracks from your library to this playlist
          </p>
        </div>
        
        {/* New Playlist Dialog */}
        {showNewPlaylistDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-4 w-80 shadow-xl">
              <h3 className="text-white font-semibold mb-3">New Playlist</h3>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                placeholder="Playlist name"
                className="w-full px-3 py-2 bg-slate-900 text-white rounded border border-slate-700 focus:outline-none focus:border-blue-500 mb-3"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowNewPlaylistDialog(false)}
                  className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePlaylist}
                  className={`px-3 py-1.5 text-sm text-white rounded transition-colors ${currentColors.accent} bg-slate-900 hover:bg-slate-800`}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const itemSize = 48;
  const listHeight = Math.min(500, displayTracks.length * itemSize);

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col h-full gap-3 ${
        isDraggingOver ? 'bg-blue-500/5 border-2 border-dashed border-blue-500' : ''
      }`}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Playlist Selector */}
      <div className="flex items-center gap-2 px-3">
        <div className="flex-1 overflow-x-auto flex gap-1">
          {playlists.playlists.map(pl => (
            <button
              key={pl.id}
              onClick={() => handleSelectPlaylist(pl.id)}
              className={`px-3 py-1 text-sm rounded whitespace-nowrap transition-colors ${
                playlists.currentPlaylist === pl.id
                  ? `${currentColors.accent} bg-slate-800`
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {pl.name}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowNewPlaylistDialog(true)}
          className="p-1.5 hover:bg-slate-700 rounded transition-colors"
          title="New Playlist"
        >
          <Plus className="w-4 h-4 text-slate-400" />
        </button>
        {playlists.currentPlaylist && (
          <button
            onClick={() => handleDeletePlaylist(playlists.currentPlaylist)}
            className="p-1.5 hover:bg-red-900/50 rounded transition-colors"
            title="Delete Playlist"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        )}
      </div>

      {/* Adding Progress Indicator */}
      {playlists.addingProgress.isAdding && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded p-3 mx-3 mb-3">
          <div className="flex items-center gap-3">
            <Loader className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-blue-300 text-sm font-medium mb-1">
                Adding tracks to playlist...
              </div>
              <div className="text-blue-400 text-xs">
                {playlists.addingProgress.current} / {playlists.addingProgress.total} tracks
              </div>
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-2">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300 ease-out"
              style={{ width: `${(playlists.addingProgress.current / playlists.addingProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <List className={`w-5 h-5 ${currentColors.accent}`} />
          {playlists.currentPlaylist
            ? playlists.playlists.find(p => p.id === playlists.currentPlaylist)?.name || 'Playlist'
            : 'Select a Playlist'}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs">
            {displayTracks.length} track{displayTracks.length !== 1 ? 's' : ''}
            {searchQuery && playlists.playlistTracks.length !== displayTracks.length && (
              <span className={`ml-1 ${currentColors.accent}`}>
                (filtered from {playlists.playlistTracks.length})
              </span>
            )}
          </span>
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setPlaylistAutoScroll(!playlistAutoScroll)}
            className={`p-1.5 rounded transition-colors ${
              playlistAutoScroll 
                ? `${currentColors.accent} bg-slate-800` 
                : 'text-slate-400 hover:bg-slate-700'
            }`}
            title={playlistAutoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          {/* Manual scroll to current track button (only when auto-scroll is off) */}
          {!playlistAutoScroll && displayCurrentTrack !== null && displayCurrentTrack >= 0 && (
            <button
              onClick={scrollToCurrentTrack}
              className="p-1.5 text-slate-400 hover:bg-slate-700 rounded transition-colors"
              title="Jump to current track"
            >
              <ArrowDownToLine className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tracks (fuzzy search: try 'jbwm' for 'Just Be What Moves')..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded pl-10 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Column Headers */}
      <div className="flex items-center px-3 text-xs text-slate-500 font-medium border-b border-slate-700 pb-2">
        <span className="w-10 text-center">#</span>
        <span className="flex-1">Title</span>
        <span className="w-40">Artist</span>
        <span className="w-40 hidden lg:block">Album</span>
        <span className="w-16 text-right">Duration</span>
        <span className="w-8"></span>
      </div>

      {/* Virtualized Track List */}
      <div className="flex-1 overflow-hidden relative">
        {displayTracks.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Search className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">No results found</p>
            <p className="text-sm text-slate-500">Try a different search term</p>
          </div>
        ) : displayTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <List className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">No tracks in this playlist</p>
            <p className="text-sm text-slate-500">Drag tracks here to add them</p>
          </div>
        ) : (
          <TrackList
            ref={trackListRef}
            tracks={displayTracks}
            currentTrack={displayCurrentTrack}
            onSelect={handleTrackSelect}
            currentColors={currentColors}
            loadingTrackIndex={loadingTrackIndex}
            onShowMenu={(index, e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({
                index,
                track: displayTracks[index],
                x: e.clientX || e.pageX,
                y: e.clientY || e.pageY
              });
            }}
            isDraggable={!!playlists.currentPlaylist}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            draggedIndex={draggedIndex}
            height={listHeight}
            itemSize={itemSize}
            enableMultiSelect={true}
            selectedIndices={selectedIndices}
            onSelectionChange={setSelectedIndices}
            onBatchAction={handleBatchAction}
          />
        )}
      </div>

      {/* Drop Indicator Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center">
          <div className="text-blue-400 text-lg font-semibold">
            Drop to add to playlist
          </div>
        </div>
      )}

      {/* New Playlist Dialog */}
      {showNewPlaylistDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-4 w-80 shadow-xl">
            <h3 className="text-white font-semibold mb-3">New Playlist</h3>
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
              placeholder="Playlist name"
              className="w-full px-3 py-2 bg-slate-900 text-white rounded border border-slate-700 focus:outline-none focus:border-blue-500 mb-3"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewPlaylistDialog(false)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlaylist}
                className={`px-3 py-1.5 text-sm text-white rounded transition-colors ${currentColors.accent} bg-slate-900 hover:bg-slate-800`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu - Use Portal to render outside overflow container */}
      {contextMenu && contextMenu.track && createPortal(
        <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={getTrackContextMenuItems({
                track: contextMenu.track,
                onPlay: () => {
                  handleTrackSelect(contextMenu.index);
                },
                onPlayNext: () => {
                  addToQueue(contextMenu.track, 'next');
                },
                onAddToQueue: () => {
                  addToQueue(contextMenu.track, 'end');
                },
                onAddToPlaylist: () => {
                  setShowPlaylistPicker(contextMenu.track);
                  closeContextMenu();
                },
                onRemove: () => {
                  handleRemoveTrack(contextMenu.index);
                },
                onEditTags: () => {
                  if (onEditTags) {
                    onEditTags(contextMenu.track);
                  }
                  closeContextMenu();
                },
                onShowInfo: () => {
                  alert(`Track: ${contextMenu.track.title}\nArtist: ${contextMenu.track.artist}\nAlbum: ${contextMenu.track.album}\nPath: ${contextMenu.track.path}`);
                },
                onSetRating: () => {
                  setShowRatingDialog(contextMenu.track);
                  closeContextMenu();
                },
                currentTrack: currentTrack
              })}
              onClose={closeContextMenu}
            />,
        document.body
      )}

      {/* Playlist Picker Dialog */}
      {showPlaylistPicker && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]" onClick={() => setShowPlaylistPicker(null)}>
          <div className="bg-slate-800 rounded-lg p-4 w-80 shadow-xl max-h-96 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-3">Add to Playlist</h3>
            <p className="text-slate-400 text-sm mb-3 truncate">
              "{showPlaylistPicker.title || showPlaylistPicker.name}"
            </p>
            <div className="flex-1 overflow-y-auto space-y-1">
              {playlists.playlists.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">No playlists yet</p>
              ) : (
                playlists.playlists.map(pl => (
                  <button
                    key={pl.id}
                    onClick={async () => {
                      try {
                        await playlists.addTrackToPlaylist(pl.id, showPlaylistPicker.id);
                        setShowPlaylistPicker(null);
                      } catch (err) {
                        console.error('Failed to add to playlist:', err);
                      }
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-white bg-slate-700/50 hover:bg-slate-700 rounded transition-colors"
                  >
                    {pl.name}
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2 justify-end mt-3 pt-3 border-t border-slate-700">
              <button
                onClick={() => setShowPlaylistPicker(null)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Rating Dialog */}
      {showRatingDialog && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]" onClick={() => setShowRatingDialog(null)}>
          <div className="bg-slate-800 rounded-lg p-4 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-3">Set Rating</h3>
            <p className="text-slate-400 text-sm mb-4 truncate">
              "{showRatingDialog.title || showRatingDialog.name}"
            </p>
            <div className="flex justify-center mb-4">
              <StarRating
                rating={showRatingDialog.rating || 0}
                onRate={async (newRating) => {
                  try {
                    await TauriAPI.updateTrackRating(showRatingDialog.id, newRating);
                    if (onRatingChange) onRatingChange();
                    setShowRatingDialog(null);
                  } catch (err) {
                    console.error('Failed to set rating:', err);
                  }
                }}
                size="lg"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRatingDialog(null)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Batch Playlist Picker Dialog */}
      {showBatchPlaylistPicker && selectedIndices.size > 0 && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]" onClick={() => setShowBatchPlaylistPicker(false)}>
          <div className="bg-slate-800 rounded-lg p-4 w-80 shadow-xl max-h-96 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-3">Add {selectedIndices.size} Tracks to Playlist</h3>
            <div className="flex-1 overflow-y-auto space-y-1">
              {playlists.playlists.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">No playlists yet</p>
              ) : (
                playlists.playlists.map(pl => (
                  <button
                    key={pl.id}
                    onClick={async () => {
                      try {
                        const selectedTracks = getSelectedTracks();
                        await playlists.addTracksToPlaylist(pl.id, selectedTracks.map(t => t.id));
                        setShowBatchPlaylistPicker(false);
                        setSelectedIndices(new Set());
                      } catch (err) {
                        console.error('Failed to add tracks to playlist:', err);
                      }
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-white bg-slate-700/50 hover:bg-slate-700 rounded transition-colors"
                  >
                    {pl.name}
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2 justify-end mt-3 pt-3 border-t border-slate-700">
              <button
                onClick={() => setShowBatchPlaylistPicker(false)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Footer with stats */}
      {displayTracks.length > 0 && (
        <div className="border-t border-slate-700 pt-2 px-3 text-xs text-slate-400 flex justify-between">
          <span>
            Playing: Track {currentTrack !== null ? currentTrack + 1 : 0} of {displayTracks.length}
          </span>
          <span>
            Total: {Math.floor(displayTracks.reduce((sum, t) => sum + (t.duration || 0), 0) / 60)} minutes
          </span>
        </div>
      )}
    </div>
  );
}