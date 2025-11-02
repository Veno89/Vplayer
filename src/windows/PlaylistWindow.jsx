import React, { useMemo, useState } from 'react';
import { List, Trash2, MoreVertical, Loader } from 'lucide-react';
import { FixedSizeList as ListVirtual } from 'react-window';
import { formatDuration } from '../utils/formatters';

// Enhanced Row component with context menu
const Row = React.memo(({ data, index, style }) => {
  const { tracks, currentTrack, onSelect, currentColors, loadingTrackIndex, onRemove, onShowMenu } = data;
  const track = tracks[index];
  const isActive = index === currentTrack;
  const isLoading = loadingTrackIndex === index;

  if (!track) return null;

  return (
    <div
      style={style}
      className={`flex items-center px-3 py-2 text-sm cursor-pointer select-none transition-colors group ${
        isActive 
          ? `${currentColors.accent} bg-slate-800/80 font-semibold` 
          : 'hover:bg-slate-700/60 text-slate-300'
      } ${isLoading ? 'opacity-50' : ''}`}
      onClick={() => onSelect(index)}
      title={`${track.title} - ${track.artist}`}
    >
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
  removeTrack 
}) {
  const [contextMenu, setContextMenu] = useState(null);

  // Show context menu for track
  const handleShowMenu = (index, e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      index,
      x: rect.left,
      y: rect.bottom + 5
    });
  };

  // Close context menu
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Handle track removal
  const handleRemoveTrack = (index) => {
    const track = tracks[index];
    if (track && confirm(`Remove "${track.title}" from playlist?`)) {
      removeTrack?.(track.id);
      
      // Adjust current track if needed
      if (currentTrack === index) {
        setCurrentTrack(Math.min(index, tracks.length - 2));
      } else if (currentTrack > index) {
        setCurrentTrack(currentTrack - 1);
      }
    }
    closeContextMenu();
  };

  // Close context menu on outside click
  React.useEffect(() => {
    if (contextMenu) {
      const handler = () => closeContextMenu();
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [contextMenu]);

  // Empty state
  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <List className="w-12 h-12 text-slate-600 mb-3" />
        <p className="text-slate-400 text-sm mb-2">No music in playlist</p>
        <p className="text-slate-500 text-xs mb-4">
          Add folders to your library to see tracks here
        </p>
      </div>
    );
  }

  // Don't memoize - just create inline
  const itemData = { 
    tracks, 
    currentTrack, 
    onSelect: setCurrentTrack, 
    currentColors, 
    loadingTrackIndex,
    onShowMenu: handleShowMenu
  };

  const itemSize = 48;
  const listHeight = Math.min(500, tracks.length * itemSize);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex items-center justify-between px-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <List className={`w-5 h-5 ${currentColors.accent}`} />
          Current Playlist
        </h3>
        <span className="text-slate-400 text-xs">
          {tracks.length} track{tracks.length !== 1 ? 's' : ''}
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
          itemCount={tracks.length}
          itemSize={itemSize}
          width="100%"
          itemData={itemData}
        >
          {Row}
        </ListVirtual>
      </div>

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
      {tracks.length > 0 && (
        <div className="border-t border-slate-700 pt-2 px-3 text-xs text-slate-400 flex justify-between">
          <span>
            Playing: Track {currentTrack !== null ? currentTrack + 1 : 0} of {tracks.length}
          </span>
          <span>
            Total: {Math.floor(tracks.reduce((sum, t) => sum + (t.duration || 0), 0) / 60)} minutes
          </span>
        </div>
      )}
    </div>
  );
}