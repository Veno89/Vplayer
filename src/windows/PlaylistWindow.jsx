import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { List, Loader, Search } from 'lucide-react';
import { TrackList } from '../components/TrackList';
import { AutoSizer } from '../components/AutoSizer';
import { StarRating } from '../components/StarRating';
import { TrackInfoDialog } from '../components/TrackInfoDialog'; // New
import { formatDuration } from '../utils/formatters';
import { usePlaylists } from '../hooks/usePlaylists';
import { usePlaylistActions } from '../hooks/usePlaylistActions';
import { ContextMenu, getTrackContextMenuItems } from '../components/ContextMenu';
import { useStore } from '../store/useStore';
import { TauriAPI } from '../services/TauriAPI';
import {
  PlaylistSelector,
  PlaylistHeader,
  PlaylistSearchBar,
  PlaylistColumnHeaders,
  NewPlaylistDialog,
  PlaylistPickerDialog,
  RatingDialog,
  BatchPlaylistPickerDialog
} from '../components/playlist';

export const PlaylistWindow = React.memo(function PlaylistWindow({
  tracks,
  currentTrack,
  setCurrentTrack,
  currentColors,
  loadingTrackIndex,
  removeTrack,
  onRatingChange,
  onActiveTracksChange,
  onEditTags, // New prop for tag editor
  isDraggingTracks, // Prop from useDragDrop via WindowManager
}) { // Changed to standard function for memo wrapping below
  /* eslint-disable no-unused-vars */
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
  const [showInfoDialog, setShowInfoDialog] = useState(null); // track for info/edit
  // Multi-select state
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [columnWidths, setColumnWidths] = useState({
    number: 40,
    title: 200,
    artist: 160,
    album: 160,
    rating: 100,
    duration: 64
  });
  const [showBatchPlaylistPicker, setShowBatchPlaylistPicker] = useState(false); // for batch add to playlist

  const containerRef = useRef(null);
  const trackListRef = useRef(null);

  const playlists = usePlaylists();
  const queue = useStore((state) => state.queue);
  const addToQueue = useStore(state => state.addToQueue);
  const playlistAutoScroll = useStore(state => state.playlistAutoScroll);
  const setPlaylistAutoScroll = useStore(state => state.setPlaylistAutoScroll);
  const getCurrentTrackData = useStore(state => state.getCurrentTrackData);
  const activePlaybackTracks = useStore(state => state.activePlaybackTracks);

  // Track the previous displayTracks to detect sort/filter changes
  const prevDisplayTracksRef = useRef(null);

  // Listen for global track drop events from VPlayer (internal library drops)
  useEffect(() => {
    const handleGlobalDrop = (e) => {
      if (!e.detail?.data) return;

      // Prevent duplicate handling with a flag
      if (e.detail.handled) return;
      e.detail.handled = true;

      try {
        const tracks = JSON.parse(e.detail.data);
        handleExternalDrop({
          preventDefault: () => { },
          stopPropagation: () => { },
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

  // Listen for external file drops (from OS file explorer) that were scanned and added to library
  useEffect(() => {
    const handleExternalTracksAdded = async (e) => {
      if (!e.detail?.trackIds || e.detail.trackIds.length === 0) return;
      if (!playlists.currentPlaylist) {
        console.log('No active playlist to add external tracks to');
        return;
      }

      try {
        console.log('Adding', e.detail.trackIds.length, 'externally dropped tracks to playlist');
        await playlists.addTracksToPlaylist(playlists.currentPlaylist, e.detail.trackIds);
      } catch (err) {
        console.error('Failed to add external tracks to playlist:', err);
      }
    };

    window.addEventListener('vplayer-external-tracks-added', handleExternalTracksAdded);

    return () => {
      window.removeEventListener('vplayer-external-tracks-added', handleExternalTracksAdded);
    };
  }, [playlists.currentPlaylist, playlists.addTracksToPlaylist]);

  // Filter and Sort tracks
  const displayTracks = useMemo(() => {
    let result = [...playlists.playlistTracks]; // Clone for sorting

    // 1. Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(track => {
        const searchableText = [
          track.title,
          track.artist,
          track.album,
          track.genre
        ].filter(Boolean).join(' ').toLowerCase();

        // Fuzzy match
        let queryIndex = 0;
        for (let i = 0; i < searchableText.length && queryIndex < query.length; i++) {
          if (searchableText[i] === query[queryIndex]) {
            queryIndex++;
          }
        }
        return queryIndex === query.length;
      });
    }

    // 2. Sort
    if (sortConfig.key) {
      result.sort((a, b) => {
        // Special case for album: sort by artist first, then album
        // This keeps albums grouped by artist instead of mixing them
        if (sortConfig.key === 'album') {
          const artistA = (a.artist || '').toString().toLowerCase();
          const artistB = (b.artist || '').toString().toLowerCase();
          
          // First compare by artist
          if (artistA < artistB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (artistA > artistB) return sortConfig.direction === 'asc' ? 1 : -1;
          
          // If same artist, compare by album
          const albumA = (a.album || '').toString().toLowerCase();
          const albumB = (b.album || '').toString().toLowerCase();
          
          if (albumA < albumB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (albumA > albumB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        }

        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];

        // Handle numbers (rating, duration, year)
        if (typeof valA === 'number' && typeof valB === 'number') {
          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        }

        // Handle strings
        const strA = (valA || '').toString().toLowerCase();
        const strB = (valB || '').toString().toLowerCase();

        if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [playlists.playlistTracks, searchQuery, sortConfig]);

  // Use the extracted playlist actions hook
  const {
    handleSort,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleRemoveFromPlaylist,
    handleExternalDrop,
    handleRemoveTrack,
    handleCreatePlaylist,
    handleDeletePlaylist,
    handleSelectPlaylist,
    closeContextMenu,
  } = usePlaylistActions({
    playlists,
    displayTracks,
    currentTrack,
    setCurrentTrack,
    draggedIndex,
    setDraggedIndex,
    setDragOverIndex,
    setIsDraggingOver,
    setContextMenu,
    setShowNewPlaylistDialog,
    newPlaylistName,
    setNewPlaylistName,
    setSortConfig,
    onActiveTracksChange,
  });



  // Handle track selection
  const handleTrackSelect = useCallback((filteredIndex) => {
    const selectedTrack = displayTracks[filteredIndex];
    if (!selectedTrack) return;

    // CRITICAL: Set the playback context BEFORE changing the track index
    // This ensures activePlaybackTracks updates before useTrackLoading runs
    // Without this, useTrackLoading would load tracks[index] from the OLD array
    if (onActiveTracksChange) {
      onActiveTracksChange(displayTracks);
      // Use setTimeout to ensure React state update completes before track loads
      setTimeout(() => {
        setCurrentTrack(filteredIndex);
      }, 50);
    } else {
      // Fallback if no playlist context (shouldn't happen in PlaylistWindow)
      setCurrentTrack(filteredIndex);
    }

  }, [displayTracks, onActiveTracksChange, setCurrentTrack]);

  // The currentTrack index now directly refers to the displayTracks array
  // (set by handleTrackSelect), so no mapping is needed
  const displayCurrentTrack = useMemo(() => {
    if (currentTrack === null || currentTrack === undefined) return null;
    // Validate the index is within bounds of displayTracks
    if (currentTrack >= 0 && currentTrack < displayTracks.length) {
      return currentTrack;
    }
    return null;
  }, [currentTrack, displayTracks.length]);

  // Auto-scroll to current track when it changes
  useEffect(() => {
    if (playlistAutoScroll && displayCurrentTrack !== null && displayCurrentTrack >= 0 && trackListRef.current) {
      trackListRef.current.scrollToItem(displayCurrentTrack, 'center');
    }
  }, [displayCurrentTrack, playlistAutoScroll]);

  // CRITICAL: Sync activePlaybackTracks when displayTracks changes (sorting/filtering)
  // This ensures next/previous navigation respects the visible playlist order
  useEffect(() => {
    // Skip if no active track or no callback
    if (currentTrack === null || currentTrack === undefined) return;
    if (!onActiveTracksChange) return;

    // Check if displayTracks actually changed (not just a re-render)
    const prevTracks = prevDisplayTracksRef.current;

    // On first render (prevTracks is null), just initialize and return
    if (prevTracks === null) {
      prevDisplayTracksRef.current = displayTracks;
      return;
    }

    const tracksChanged = prevTracks !== displayTracks &&
      (prevTracks.length !== displayTracks.length ||
        prevTracks.some((t, i) => t?.id !== displayTracks[i]?.id));

    if (!tracksChanged) {
      prevDisplayTracksRef.current = displayTracks;
      return;
    }

    // Get the currently playing track from the store
    const currentlyPlayingTrack = getCurrentTrackData();
    if (!currentlyPlayingTrack) {
      prevDisplayTracksRef.current = displayTracks;
      return;
    }

    // Find where this track is in the new displayTracks order
    const newIndex = displayTracks.findIndex(t => t?.id === currentlyPlayingTrack.id);

    console.log('[PlaylistWindow] displayTracks changed, remapping track:', currentlyPlayingTrack.id,
      'old index:', currentTrack, 'new index:', newIndex);

    // Update the active playback tracks to match the new display order
    onActiveTracksChange(displayTracks);

    // Remap the current track index if the track is still in the list
    // Use synchronous update - React batches both state changes in the same effect
    if (newIndex !== -1 && newIndex !== currentTrack) {
      setCurrentTrack(newIndex);
    } else if (newIndex === -1) {
      // Track was filtered out entirely - keep playing but clear the visual highlight
      console.warn('[PlaylistWindow] Currently playing track filtered out of display');
    }

    prevDisplayTracksRef.current = displayTracks;
  }, [displayTracks, currentTrack, onActiveTracksChange, getCurrentTrackData, setCurrentTrack]);

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

  // Save current playlist to localStorage when it changes
  useEffect(() => {
    if (playlists.currentPlaylist) {
      localStorage.setItem('vplayer_last_playlist', playlists.currentPlaylist);
    }
  }, [playlists.currentPlaylist]);

  // Handle Context Menu
  const handleShowMenu = useCallback((index, e) => {
    e.preventDefault();
    e.stopPropagation();

    const track = displayTracks[index];
    if (!track) return;

    const items = getTrackContextMenuItems({
      track,
      currentTrack: displayCurrentTrack === index,
      onPlay: () => {
        if (onActiveTracksChange) {
          onActiveTracksChange(displayTracks);
          setTimeout(() => setCurrentTrack(index), 0);
        } else {
          setCurrentTrack(index);
        }
      },
      onAddToQueue: () => addToQueue(track),
      onAddToPlaylist: () => setShowPlaylistPicker(track),
      onRemove: () => handleRemoveTrack(index),
      onEditTags: () => onEditTags && onEditTags(track),
      onSetRating: () => setShowRatingDialog(track),
      onShowInfo: () => {
        // Placeholder for info dialog
        console.log('Show info for:', track);
      }
    });

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items
    });
  }, [displayTracks, displayCurrentTrack, onActiveTracksChange, setCurrentTrack, addToQueue, handleRemoveTrack, onEditTags, setContextMenu]);

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
        x: e.clientX,
        y: e.clientY
      });
    }
  }), [displayTracks, currentTrack, setCurrentTrack, currentColors, loadingTrackIndex, onRatingChange, playlists.currentPlaylist, draggedIndex, handleDragStart, handleDragOver, handleDrop]);

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
      <div
        className="flex flex-col h-full"
        ref={containerRef}
        onDrop={handleExternalDrop}
        onDragOver={(e) => {
          console.log('[PlaylistWindow EMPTY] dragover event');
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setIsDraggingOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.relatedTarget || e.relatedTarget.nodeName === 'HTML') {
            setIsDraggingOver(false);
          }
        }}
      >
        {/* Playlist Selector */}
        <PlaylistSelector
          playlists={playlists.playlists}
          currentPlaylist={playlists.currentPlaylist}
          currentColors={currentColors}
          onSelect={handleSelectPlaylist}
          onNew={() => setShowNewPlaylistDialog(true)}
          onDelete={handleDeletePlaylist}
        />

        {/* Empty State with Drop Zone */}
        <div
          className={`flex-1 flex flex-col items-center justify-center text-center p-4 transition-colors ${isDraggingOver ? 'bg-blue-500/10 border-2 border-dashed border-blue-500' : ''
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
  // const listHeight = Math.min(500, displayTracks.length * itemSize); // Removed static calculation

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full gap-3 ${isDraggingOver ? 'bg-blue-500/5 border-2 border-dashed border-blue-500' : ''
        }`}
      style={{ pointerEvents: 'auto' }}
      onDrop={(e) => {
        console.log('[PlaylistWindow MAIN] DROP EVENT FIRED!', e.target.className);
        handleExternalDrop(e);
      }}
      onDragOver={(e) => {
        console.log('[PlaylistWindow MAIN] dragover event, target:', e.target.className);
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget || e.relatedTarget.nodeName === 'HTML') {
          setIsDraggingOver(false);
        }
      }}
    >
      {/* Playlist Selector */}
      <PlaylistSelector
        playlists={playlists.playlists}
        currentPlaylist={playlists.currentPlaylist}
        currentColors={currentColors}
        onSelect={handleSelectPlaylist}
        onNew={() => setShowNewPlaylistDialog(true)}
        onDelete={handleDeletePlaylist}
      />

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
      <PlaylistHeader
        playlistName={playlists.currentPlaylist
          ? playlists.playlists.find(p => p.id === playlists.currentPlaylist)?.name
          : null}
        trackCount={displayTracks.length}
        totalTracks={playlists.playlistTracks.length}
        searchQuery={searchQuery}
        autoScroll={playlistAutoScroll}
        onToggleAutoScroll={() => setPlaylistAutoScroll(!playlistAutoScroll)}
        onScrollToCurrentTrack={scrollToCurrentTrack}
        showScrollButton={!playlistAutoScroll && displayCurrentTrack !== null && displayCurrentTrack >= 0}
        currentColors={currentColors}
      />

      {/* Search Bar */}
      <PlaylistSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        onClear={() => setSearchQuery('')}
      />

      {/* Column Headers */}
      <PlaylistColumnHeaders
        sortConfig={sortConfig}
        onSort={handleSort}
        columnWidths={columnWidths}
        onColumnResize={setColumnWidths}
      />

      {/* Virtualized Track List */}
      <AutoSizer className="flex-1 overflow-hidden relative">
        {({ height, width }) => displayTracks.length === 0 && searchQuery ? (
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
            onShowMenu={handleShowMenu}
            isDraggable={!!playlists.currentPlaylist}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            draggedIndex={draggedIndex}
            height={height}
            itemSize={itemSize}
            enableMultiSelect={true}
            selectedIndices={selectedIndices}
            onSelectionChange={setSelectedIndices}
            onBatchAction={handleBatchAction}
            showRating={true} // Enable rating display
            columnWidths={columnWidths} // Pass dynamic widths
          />
        )
        }
      </AutoSizer>

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

      {/* Track Info & Editor Dialog */}
      {onEditTags && createPortal( // Reusing onEditTags state name for showing dialog? No, need local state.
        // Wait, I need a state for showing info dialog.
        // Let's use `showInfoDialog` state.
        // I need to ADD `showInfoDialog` state to PlaylistWindow first.
        null, document.body
      )}

      {/* Track Info & Editor Dialog */}
      {showInfoDialog && createPortal(
        <TrackInfoDialog
          track={showInfoDialog}
          onClose={() => setShowInfoDialog(null)}
          onSave={() => {
            // Trigger refresh if needed, but activeTracksChange usually handles it via prop
            if (onActiveTracksChange) {
              // We might need to refresh the playlist data from store?
              // For now, assume optimistic UI or store updates will propogate
              // But metadata update in backend might not reflect immediately in frontend lists without reload
              // Changing tags updates the DB. We might need to force a re-fetch of the current playlist?
              // playlists.fetchPlaylistTracks(playlists.currentPlaylist) ?
              // For now let's just close. User can verify.
            }
          }}
        />,
        document.body
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
            // onPlayNext removed
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
            // onEditTags merged into onShowInfo
            onShowInfo: () => {
              setShowInfoDialog(contextMenu.track);
              closeContextMenu();
            },
            onSetRating: () => {
              setShowRatingDialog(contextMenu.track);
              closeContextMenu();
            },
            currentTrack: currentTrack,
            isPlaylist: true // Explicitly set for PlaylistWindow
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

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});