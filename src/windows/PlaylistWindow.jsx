import React, { useMemo, useState, useRef, useEffect } from 'react';
import { List, Trash2, MoreVertical, Loader, Plus, Edit2, X, GripVertical } from 'lucide-react';
import { FixedSizeList as ListVirtual } from 'react-window';
import { formatDuration } from '../utils/formatters';
import { usePlaylists } from '../hooks/usePlaylists';

// Enhanced Row component with drag-and-drop support for playlists
const Row = React.memo(({ data, index, style }) => {
  const { 
    tracks, 
    currentTrack, 
    onSelect, 
    currentColors, 
    loadingTrackIndex, 
    onShowMenu, 
    isDraggable,
    onDragStart,
    onDragOver,
    onDrop,
    draggedIndex
  } = data;
  const track = tracks[index];
  const isActive = index === currentTrack;
  const isLoading = loadingTrackIndex === index;
  const isDragging = draggedIndex === index;

  if (!track) return null;

  return (
    <div
      style={style}
      draggable={isDraggable}
      onDragStart={(e) => isDraggable && onDragStart?.(e, index)}
      onDragOver={(e) => isDraggable && onDragOver?.(e, index)}
      onDrop={(e) => isDraggable && onDrop?.(e, index)}
      className={`flex items-center px-3 py-2 text-sm cursor-pointer select-none transition-colors group ${
        isActive 
          ? `${currentColors.accent} bg-slate-800/80 font-semibold` 
          : 'hover:bg-slate-700/60 text-slate-300'
      } ${isLoading ? 'opacity-50' : ''} ${isDragging ? 'opacity-40' : ''}`}
      onClick={() => onSelect(index)}
      title={`${track.title} - ${track.artist}`}
    >
      {/* Drag Handle - only show in playlist view */}
      {isDraggable && (
        <div className="w-6 flex items-center justify-center text-slate-500 cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      {/* Track Number */}
      <span className="w-10 text-center text-slate-500 text-xs">
        {isLoading ? (
          <Loader className="w-3 h-3 animate-spin mx-auto" />
        ) : (
          index + 1
        )}
      </span>

      {/* Title */}
      <span className="flex-1 truncate font-medium" title={track.title}>
        {track.title}
      </span>

      {/* Artist */}
      <span className="w-40 truncate text-slate-400" title={track.artist}>
        {track.artist}
      </span>

      {/* Album */}
      <span className="w-40 truncate text-slate-500 hidden lg:block" title={track.album}>
        {track.album}
      </span>

      {/* Duration */}
      <span className="w-16 text-right text-slate-400">
        {track.duration ? formatDuration(track.duration) : '0:00'}
      </span>

      {/* Actions */}
      <div className="w-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShowMenu?.(index, e);
          }}
          className="p-1 hover:bg-slate-600 rounded transition-colors"
          title="More options"
        >
          <MoreVertical className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

Row.displayName = 'Row';

export function PlaylistWindow({ 
  tracks, 
  currentTrack, 
  setCurrentTrack, 
  currentColors, 
  loadingTrackIndex,
  removeTrack,
  onRatingChange,
  onActiveTracksChange
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [showNewPlaylistDialog, setShowNewPlaylistDialog] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [viewMode, setViewMode] = useState('library'); // 'library' or 'playlist'
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const containerRef = useRef(null);
  
  const playlists = usePlaylists();
  
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
  }, [viewMode, playlists.currentPlaylist]);
  
  // Determine which tracks to display
  const displayTracks = viewMode === 'playlist' && playlists.currentPlaylist 
    ? playlists.playlistTracks 
    : tracks;
  
  // Update active playback tracks whenever displayTracks changes
  useEffect(() => {
    if (onActiveTracksChange) {
      onActiveTracksChange(displayTracks);
    }
  }, [displayTracks, onActiveTracksChange]);

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
      
      if (viewMode === 'library') {
        // If in library view, prompt to select/create playlist
        if (!playlists.playlists || playlists.playlists.length === 0) {
          alert('Please create a playlist first');
          setShowNewPlaylistDialog(true);
          return;
        }
        
        // Auto-select first playlist if none selected
        if (!playlists.currentPlaylist && playlists.playlists.length > 0) {
          await playlists.setCurrentPlaylist(playlists.playlists[0].id);
          setViewMode('playlist');
        }
      }
      
      if (!playlists.currentPlaylist) {
        alert('Please select or create a playlist first');
        return;
      }
      
      await playlists.addTracksToPlaylist(playlists.currentPlaylist, tracks.map(t => t.id));
      
      // If we were in library view, switch to playlist view to show the added tracks
      if (viewMode === 'library') {
        setViewMode('playlist');
      }
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
    isDraggable: viewMode === 'playlist' && playlists.currentPlaylist,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    draggedIndex,
    onShowMenu: (index, e) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      setContextMenu({
        index,
        x: rect.left,
        y: rect.bottom + 5
      });
    }
  }), [displayTracks, currentTrack, setCurrentTrack, currentColors, loadingTrackIndex, onRatingChange, viewMode, playlists.currentPlaylist, draggedIndex]);

  // Close context menu
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Handle track removal
  const handleRemoveTrack = (index) => {
    const track = displayTracks[index];
    if (!track) return;
    
    if (viewMode === 'playlist' && playlists.currentPlaylist) {
      // Remove from playlist
      if (confirm(`Remove "${track.title}" from this playlist?`)) {
        playlists.removeTrackFromPlaylist(playlists.currentPlaylist, track.id);
      }
    } else {
      // Remove from library
      if (confirm(`Remove "${track.title}" from library?`)) {
        removeTrack?.(track.id);
      }
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
        setViewMode('playlist');
      }
    } catch (err) {
      alert('Failed to create playlist');
    }
  };
  
  // Delete playlist
  const handleDeletePlaylist = async (playlistId) => {
    if (!confirm('Delete this playlist?')) return;
    
    try {
      await playlists.deletePlaylist(playlistId);
      setViewMode('library');
    } catch (err) {
      alert('Failed to delete playlist');
    }
  };
  
  // Switch to playlist view
  const handleSelectPlaylist = (playlistId) => {
    playlists.setCurrentPlaylist(playlistId);
    setViewMode('playlist');
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
  if (displayTracks.length === 0) {
    return (
      <div className="flex flex-col h-full" ref={containerRef}>
        {/* Playlist Selector */}
        <div className="flex items-center gap-2 p-3 border-b border-slate-700">
          <button
            onClick={() => setViewMode('library')}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              viewMode === 'library' 
                ? `${currentColors.accent} bg-slate-800` 
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Library
          </button>
          <div className="flex-1 overflow-x-auto flex gap-1">
            {playlists.playlists.map(pl => (
              <button
                key={pl.id}
                onClick={() => handleSelectPlaylist(pl.id)}
                className={`px-3 py-1 text-sm rounded whitespace-nowrap transition-colors ${
                  viewMode === 'playlist' && playlists.currentPlaylist === pl.id
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
              : viewMode === 'playlist' ? 'No tracks in this playlist' : 'No music in library'}
          </p>
          <p className="text-slate-500 text-xs">
            {viewMode === 'playlist' 
              ? 'Drag tracks from your library to this playlist' 
              : 'Add folders to your library to see tracks here'}
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
        <button
          onClick={() => setViewMode('library')}
          className={`px-3 py-1 text-sm rounded transition-colors ${
            viewMode === 'library' 
              ? `${currentColors.accent} bg-slate-800` 
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Library
        </button>
        <div className="flex-1 overflow-x-auto flex gap-1">
          {playlists.playlists.map(pl => (
            <button
              key={pl.id}
              onClick={() => handleSelectPlaylist(pl.id)}
              className={`px-3 py-1 text-sm rounded whitespace-nowrap transition-colors ${
                viewMode === 'playlist' && playlists.currentPlaylist === pl.id
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
        {viewMode === 'playlist' && playlists.currentPlaylist && (
          <button
            onClick={() => handleDeletePlaylist(playlists.currentPlaylist)}
            className="p-1.5 hover:bg-red-900/50 rounded transition-colors"
            title="Delete Playlist"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <List className={`w-5 h-5 ${currentColors.accent}`} />
          {viewMode === 'playlist' && playlists.currentPlaylist
            ? playlists.playlists.find(p => p.id === playlists.currentPlaylist)?.name || 'Playlist'
            : 'Current Playlist'}
        </h3>
        <span className="text-slate-400 text-xs">
          {displayTracks.length} track{displayTracks.length !== 1 ? 's' : ''}
        </span>
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
      <div className="flex-1 overflow-hidden">
        <ListVirtual
          height={listHeight}
          itemCount={displayTracks.length}
          itemSize={itemSize}
          width="100%"
          itemData={itemData}
        >
          {Row}
        </ListVirtual>
      </div>

      {/* Drop Indicator Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center">
          <div className="text-blue-400 text-lg font-semibold">
            Drop to add to {viewMode === 'playlist' ? 'playlist' : 'library'}
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-slate-800 border border-slate-700 rounded shadow-xl py-1 z-50 min-w-[150px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setCurrentTrack(contextMenu.index)}
            className="w-full px-4 py-2 text-left text-sm text-white hover:bg-slate-700 transition-colors"
          >
            Play Now
          </button>
          <button
            onClick={() => handleRemoveTrack(contextMenu.index)}
            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-3 h-3" />
            Remove from Playlist
          </button>
        </div>
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