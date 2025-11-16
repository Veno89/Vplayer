import React from 'react';
import { FixedSizeList as ListVirtual } from 'react-window';
import { Loader, MoreVertical, GripVertical } from 'lucide-react';
import { formatDuration } from '../utils/formatters';
import { StarRating } from './StarRating';

/**
 * Unified track row component with configurable features
 */
const TrackRow = React.memo(({ data, index, style }) => {
  const { 
    tracks, 
    currentTrack, 
    onSelect, 
    currentColors, 
    loadingTrackIndex,
    onRatingChange,
    onShowMenu,
    isDraggable,
    onDragStart,
    onDragOver,
    onDrop,
    draggedIndex,
    showRating = false,
    showAlbum = true,
    showArtist = true,
    showNumber = true,
    showDuration = true
  } = data;

  const track = tracks[index];
  const isActive = index === currentTrack;
  const isLoading = loadingTrackIndex === index;
  const isDragging = draggedIndex === index;

  if (!track) return null;

  const handleRatingChange = async (newRating) => {
    if (onRatingChange) {
      await onRatingChange(track.id, newRating);
    }
  };

  return (
    <div
      style={style}
      draggable={isDraggable}
      onDragStart={(e) => isDraggable && onDragStart?.(e, index)}
      onDragOver={(e) => isDraggable && onDragOver?.(e, index)}
      onDrop={(e) => isDraggable && onDrop?.(e, index)}
      onContextMenu={(e) => {
        if (onShowMenu) {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const menuEvent = {
            ...e,
            clientX: e.clientX,
            clientY: e.clientY,
            pageX: e.pageX,
            pageY: e.pageY,
            currentTarget: e.currentTarget,
            target: e.target,
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation()
          };
          onShowMenu(index, menuEvent);
        }
      }}
      className={`flex items-center px-3 py-2 text-sm cursor-pointer select-none transition-colors group ${
        isActive 
          ? `${currentColors.accent} bg-slate-800/80 font-semibold` 
          : 'hover:bg-slate-700/60 text-slate-300'
      } ${isLoading ? 'opacity-50' : ''} ${isDragging ? 'opacity-40' : ''}`}
      onClick={() => onSelect(index)}
      title={`${track.title || 'Unknown'} - ${track.artist || 'Unknown Artist'}`}
    >
      {/* Drag Handle */}
      {isDraggable && (
        <div className="w-6 flex items-center justify-center text-slate-500 cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      {/* Track Number */}
      {showNumber && (
        <span className="w-10 text-center text-slate-500 text-xs">
          {isLoading ? (
            <Loader className="w-3 h-3 animate-spin mx-auto" />
          ) : (
            index + 1
          )}
        </span>
      )}

      {/* Title */}
      <span className="flex-1 truncate font-medium" title={track.title || 'Unknown'}>
        {track.title || 'Unknown'}
      </span>

      {/* Artist */}
      {showArtist && (
        <span className="w-40 truncate text-slate-400" title={track.artist || 'Unknown Artist'}>
          {track.artist || 'Unknown Artist'}
        </span>
      )}

      {/* Album */}
      {showAlbum && (
        <span className="w-40 truncate text-slate-500 hidden lg:block" title={track.album || 'Unknown Album'}>
          {track.album || 'Unknown Album'}
        </span>
      )}

      {/* Rating */}
      {showRating && (
        <span className="w-24 flex justify-center" onClick={(e) => e.stopPropagation()}>
          <StarRating 
            rating={track.rating || 0} 
            onRatingChange={handleRatingChange} 
            size="sm" 
          />
        </span>
      )}

      {/* Duration */}
      {showDuration && (
        <span className="w-16 text-right text-slate-400">
          {track.duration ? formatDuration(track.duration) : '0:00'}
        </span>
      )}

      {/* Actions Menu */}
      {onShowMenu && (
        <div className="w-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const menuEvent = {
                ...e,
                clientX: rect.left,
                clientY: rect.bottom + 5,
                pageX: rect.left,
                pageY: rect.bottom + 5,
                currentTarget: e.currentTarget,
                target: e.target,
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation()
              };
              onShowMenu(index, menuEvent);
            }}
            className="p-1 hover:bg-slate-600 rounded transition-colors"
            title="More options"
          >
            <MoreVertical className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  const prevTrack = prevProps.data.tracks[prevProps.index];
  const nextTrack = nextProps.data.tracks[nextProps.index];
  
  return (
    prevProps.index === nextProps.index &&
    prevProps.style === nextProps.style &&
    prevTrack?.id === nextTrack?.id &&
    prevTrack?.title === nextTrack?.title &&
    prevTrack?.artist === nextTrack?.artist &&
    prevTrack?.album === nextTrack?.album &&
    prevTrack?.duration === nextTrack?.duration &&
    prevTrack?.rating === nextTrack?.rating &&
    prevProps.data.currentTrack === nextProps.data.currentTrack &&
    prevProps.data.loadingTrackIndex === nextProps.data.loadingTrackIndex &&
    prevProps.data.draggedIndex === nextProps.data.draggedIndex
  );
});

TrackRow.displayName = 'TrackRow';

/**
 * Virtualized track list component
 */
export const TrackList = React.forwardRef(function TrackList({
  tracks,
  currentTrack,
  onSelect,
  currentColors,
  loadingTrackIndex,
  onRatingChange,
  onShowMenu,
  isDraggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  draggedIndex,
  showRating = false,
  showAlbum = true,
  showArtist = true,
  showNumber = true,
  showDuration = true,
  height = 400,
  itemSize = 40
}, ref) {
  const itemData = {
    tracks,
    currentTrack,
    onSelect,
    currentColors,
    loadingTrackIndex,
    onRatingChange,
    onShowMenu,
    isDraggable,
    onDragStart,
    onDragOver,
    onDrop,
    draggedIndex,
    showRating,
    showAlbum,
    showArtist,
    showNumber,
    showDuration
  };

  return (
    <ListVirtual
      ref={ref}
      height={height}
      itemCount={tracks.length}
      itemSize={itemSize}
      width="100%"
      itemData={itemData}
    >
      {TrackRow}
    </ListVirtual>
  );
});

/**
 * Simple non-virtualized track list for small lists
 */
export function SimpleTrackList({
  tracks,
  currentTrack,
  onSelect,
  currentColors,
  loadingTrackIndex,
  onRatingChange,
  onShowMenu,
  isDraggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  draggedIndex,
  showRating = false,
  showAlbum = true,
  showArtist = true,
  showNumber = true,
  showDuration = true
}) {
  const itemData = {
    tracks,
    currentTrack,
    onSelect,
    currentColors,
    loadingTrackIndex,
    onRatingChange,
    onShowMenu,
    isDraggable,
    onDragStart,
    onDragOver,
    onDrop,
    draggedIndex,
    showRating,
    showAlbum,
    showArtist,
    showNumber,
    showDuration
  };

  return (
    <div className="flex flex-col">
      {tracks.map((track, index) => (
        <TrackRow
          key={track.id || index}
          data={itemData}
          index={index}
          style={{}}
        />
      ))}
    </div>
  );
}
