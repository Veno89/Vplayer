import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FixedSizeList as ListVirtual } from 'react-window';
import type { ListChildComponentProps, Align } from 'react-window';
import { Loader, MoreVertical, GripVertical, Check } from 'lucide-react';
import { formatDuration } from '../utils/formatters';
import { StarRating } from './StarRating';
import type { Track } from '../types';
import type { ColorScheme } from '../store/types';

// Constants for consistent sizing
export const TRACK_LIST_ITEM_SIZE = 48;
export const TRACK_LIST_ITEM_SIZE_COMPACT = 40;

// ============================================================================
// Type Definitions
// ============================================================================

interface ColumnWidths {
  number?: number;
  title?: number;
  artist?: number;
  album?: number;
  rating?: number;
  duration?: number;
}

interface TrackMenuEvent {
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  currentTarget: EventTarget;
  target: EventTarget;
  preventDefault: () => void;
  stopPropagation: () => void;
}

interface TrackRowData {
  tracks: Track[];
  currentTrack: number | null;
  onSelect: (index: number) => void;
  currentColors: ColorScheme;
  loadingTrackIndex: number | null;
  onRatingChange?: (trackId: string, rating: number) => Promise<void> | void;
  onShowMenu?: (index: number, event: TrackMenuEvent) => void;
  isDraggable: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  draggedIndex?: number | null;
  focusedIndex: number;
  showRating: boolean;
  showAlbum: boolean;
  showArtist: boolean;
  showNumber: boolean;
  showDuration: boolean;
  selectedIndices?: Set<number>;
  onToggleSelect?: (index: number, isShift: boolean, isCtrl: boolean) => void;
  isMultiSelectMode?: boolean;
  columnWidths?: ColumnWidths;
}

export interface TrackListHandle {
  scrollToItem: (index: number, align?: Align) => void;
  getSelectedTracks: () => Track[];
  clearSelection: () => void;
  selectAll: () => void;
}

interface TrackListProps {
  tracks: Track[];
  currentTrack: number | null;
  onSelect: (index: number) => void;
  currentColors: ColorScheme;
  loadingTrackIndex: number | null;
  onRatingChange?: (trackId: string, rating: number) => Promise<void> | void;
  onShowMenu?: (index: number, event: TrackMenuEvent) => void;
  isDraggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  draggedIndex?: number | null;
  showRating?: boolean;
  showAlbum?: boolean;
  showArtist?: boolean;
  showNumber?: boolean;
  showDuration?: boolean;
  height?: number;
  itemSize?: number;
  onPlayTrack?: (index: number) => void;
  enableMultiSelect?: boolean;
  selectedIndices?: Set<number>;
  onSelectionChange?: React.Dispatch<React.SetStateAction<Set<number>>>;
  onBatchAction?: (action: string, tracks: Track[]) => void;
  columnWidths?: ColumnWidths;
}

interface SimpleTrackListProps {
  tracks: Track[];
  currentTrack: number | null;
  onSelect: (index: number) => void;
  currentColors: ColorScheme;
  loadingTrackIndex: number | null;
  onRatingChange?: (trackId: string, rating: number) => Promise<void> | void;
  onShowMenu?: (index: number, event: TrackMenuEvent) => void;
  isDraggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  draggedIndex?: number | null;
  showRating?: boolean;
  showAlbum?: boolean;
  showArtist?: boolean;
  showNumber?: boolean;
  showDuration?: boolean;
  onPlayTrack?: (index: number) => void;
}

/**
 * Unified track row component with configurable features
 */
const TrackRow = React.memo(({ data, index, style }: ListChildComponentProps<TrackRowData>) => {
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
    focusedIndex,
    showRating = false,
    showAlbum = true,
    showArtist = true,
    showNumber = true,
    showDuration = true,
    // Multi-select
    selectedIndices = new Set(),
    onToggleSelect,
    isMultiSelectMode = false,
    columnWidths, // New
  } = data;

  const track = tracks[index];
  const isActive = index === currentTrack;
  const isLoading = loadingTrackIndex === index;
  const isDragging = draggedIndex === index;
  const isFocused = index === focusedIndex;
  const isSelected = selectedIndices.has(index);

  if (!track) return null;

  const handleRatingChange = async (newRating: number) => {
    if (onRatingChange) {
      await onRatingChange(track.id, newRating);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey || isMultiSelectMode) {
      e.preventDefault();
      if (onToggleSelect) {
        onToggleSelect(index, e.shiftKey, e.ctrlKey || e.metaKey);
      }
    } else {
      onSelect(index);
    }
  };

  return (
    <div
      style={style}
      draggable={isDraggable && !isMultiSelectMode}
      onDragStart={(e) => isDraggable && !isMultiSelectMode && onDragStart?.(e, index)}
      onDragOver={(e) => isDraggable && !isMultiSelectMode && onDragOver?.(e, index)}
      onDrop={(e) => isDraggable && !isMultiSelectMode && onDrop?.(e, index)}
      onContextMenu={(e) => {
        if (onShowMenu) {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const menuEvent: TrackMenuEvent = {
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
      className={`flex items-center px-3 py-2 text-sm cursor-pointer select-none transition-colors group ${isSelected
        ? 'bg-cyan-800/50 text-white'
        : isActive
          ? `${currentColors.accent} bg-slate-800/80 font-semibold`
          : isFocused
            ? 'bg-slate-700/80 text-slate-200 ring-1 ring-cyan-500/50'
            : 'hover:bg-slate-700/60 text-slate-300'
        } ${isLoading ? 'opacity-50' : ''} ${isDragging ? 'opacity-40' : ''}`}
      onClick={handleClick}
      title={`${track.title || 'Unknown'} - ${track.artist || 'Unknown Artist'}`}
    >
      {/* Selection Checkbox / Drag Handle */}
      {isMultiSelectMode ? (
        <div className="w-6 flex items-center justify-center">
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${isSelected
            ? 'bg-cyan-500 border-cyan-500'
            : 'border-slate-500 hover:border-cyan-400'
            }`}>
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
      ) : isDraggable ? (
        <div className="w-6 flex items-center justify-center text-slate-500 cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4" />
        </div>
      ) : null}

      {/* Track Number */}
      {showNumber && (
        <span
          className="text-center text-slate-500 text-xs flex-shrink-0"
          style={{ width: columnWidths?.number || 40 }}
        >
          {isLoading ? (
            <Loader className="w-3 h-3 animate-spin mx-auto" />
          ) : (
            index + 1
          )}
        </span>
      )}

      {/* Title */}
      <span
        className="truncate font-medium px-1"
        style={{ width: columnWidths?.title || 200, minWidth: 80 }}
        title={track.title || 'Unknown'}
      >
        {track.title || 'Unknown'}
      </span>

      {/* Artist */}
      {showArtist && (
        <span
          className="truncate text-slate-400 px-1"
          style={{ width: columnWidths?.artist || 160 }}
          title={track.artist || 'Unknown Artist'}
        >
          {track.artist || 'Unknown Artist'}
        </span>
      )}

      {/* Album */}
      {showAlbum && (
        <span
          className="truncate text-slate-500 hidden lg:block px-1"
          style={{ width: columnWidths?.album || 160 }}
          title={track.album || 'Unknown Album'}
        >
          {track.album || 'Unknown Album'}
        </span>
      )}

      {/* Rating */}
      {showRating && (
        <span
          className="flex justify-center px-1"
          style={{ width: columnWidths?.rating || 100 }}
          onClick={(e) => e.stopPropagation()}
        >
          <StarRating
            rating={track.rating || 0}
            onRatingChange={handleRatingChange}
            size="sm"
          />
        </span>
      )}

      {/* Duration */}
      {showDuration && (
        <span
          className="text-right px-1 text-slate-400"
          style={{ width: columnWidths?.duration || 64 }}
        >
          {track.duration ? formatDuration(track.duration) : '--:--'}
        </span>
      )}

      {/* Actions Menu */}
      {onShowMenu && !isMultiSelectMode && (
        <div className="w-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const menuEvent: TrackMenuEvent = {
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
}, (prevProps: ListChildComponentProps<TrackRowData>, nextProps: ListChildComponentProps<TrackRowData>) => {
  const prevTrack = prevProps.data.tracks[prevProps.index];
  const nextTrack = nextProps.data.tracks[nextProps.index];

  // Compare columnWidths object
  const prevWidths = prevProps.data.columnWidths;
  const nextWidths = nextProps.data.columnWidths;
  const widthsEqual = prevWidths === nextWidths || (
    prevWidths?.number === nextWidths?.number &&
    prevWidths?.title === nextWidths?.title &&
    prevWidths?.artist === nextWidths?.artist &&
    prevWidths?.album === nextWidths?.album &&
    prevWidths?.rating === nextWidths?.rating &&
    prevWidths?.duration === nextWidths?.duration
  );

  return (
    widthsEqual &&
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
    prevProps.data.draggedIndex === nextProps.data.draggedIndex &&
    prevProps.data.focusedIndex === nextProps.data.focusedIndex &&
    prevProps.data.selectedIndices === nextProps.data.selectedIndices &&
    prevProps.data.isMultiSelectMode === nextProps.data.isMultiSelectMode
  );
});

TrackRow.displayName = 'TrackRow';

// Force HMR update
/**
 * Virtualized track list component with keyboard navigation and multi-select
 */
export const TrackList = React.forwardRef<TrackListHandle, TrackListProps>(function TrackList({
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
  itemSize = TRACK_LIST_ITEM_SIZE_COMPACT,
  onPlayTrack,
  enableMultiSelect = true,
  selectedIndices,
  onSelectionChange,
  onBatchAction,
  columnWidths,
}, ref) {
  const [focusedIndex, setFocusedIndex] = useState<number>(currentTrack ?? 0);
  const [localSelectedIndices, setLocalSelectedIndices] = useState<Set<number>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<ListVirtual<TrackRowData>>(null);

  // Use external or local selection state
  const actualSelectedIndices = selectedIndices ?? localSelectedIndices;
  const setActualSelectedIndices = onSelectionChange ?? setLocalSelectedIndices;

  // Expose scrollToItem via ref
  React.useImperativeHandle(ref, () => ({
    scrollToItem: (index: number, align?: Align) => {
      listRef.current?.scrollToItem(index, align);
    },
    getSelectedTracks: () => {
      return Array.from(actualSelectedIndices).map(i => tracks[i]).filter(Boolean);
    },
    clearSelection: () => {
      setActualSelectedIndices(new Set());
      setIsMultiSelectMode(false);
    },
    selectAll: () => {
      setActualSelectedIndices(new Set(tracks.map((_, i) => i)));
      setIsMultiSelectMode(true);
    }
  }));

  // Update focused index when current track changes
  useEffect(() => {
    if (currentTrack !== null && currentTrack !== undefined) {
      setFocusedIndex(currentTrack);
    }
  }, [currentTrack]);

  // Handle multi-select toggle
  const handleToggleSelect = useCallback((index: number, isShift: boolean, isCtrl: boolean) => {
    setActualSelectedIndices((prev: Set<number>) => {
      const newSet = new Set(prev);

      if (isShift && lastSelectedIndex !== null) {
        // Range selection
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        for (let i = start; i <= end; i++) {
          newSet.add(i);
        }
      } else if (isCtrl) {
        // Toggle single item
        if (newSet.has(index)) {
          newSet.delete(index);
        } else {
          newSet.add(index);
        }
      } else {
        // In multi-select mode, toggle single item
        if (isMultiSelectMode) {
          if (newSet.has(index)) {
            newSet.delete(index);
          } else {
            newSet.add(index);
          }
        } else {
          // Start multi-select mode
          newSet.clear();
          newSet.add(index);
        }
      }

      setLastSelectedIndex(index);

      // Enable/disable multi-select mode based on selection count
      if (newSet.size > 0) {
        setIsMultiSelectMode(true);
      } else {
        setIsMultiSelectMode(false);
      }

      return newSet;
    });
  }, [lastSelectedIndex, isMultiSelectMode, setActualSelectedIndices]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (tracks.length === 0) return;

    // Multi-select shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'a') {
        // Select all
        e.preventDefault();
        setActualSelectedIndices(new Set(tracks.map((_, i) => i)));
        setIsMultiSelectMode(true);
        return;
      }
    }

    if (e.key === 'Escape' && isMultiSelectMode) {
      // Clear selection
      e.preventDefault();
      setActualSelectedIndices(new Set());
      setIsMultiSelectMode(false);
      return;
    }

    if (e.key === 'Delete' && isMultiSelectMode && actualSelectedIndices.size > 0) {
      // Batch delete
      e.preventDefault();
      if (onBatchAction) {
        onBatchAction('delete', Array.from(actualSelectedIndices).map(i => tracks[i]));
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = Math.min(prev + 1, tracks.length - 1);
          listRef.current?.scrollToItem(next, 'smart');
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = Math.max(prev - 1, 0);
          listRef.current?.scrollToItem(next, 'smart');
          return next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (onPlayTrack) {
          onPlayTrack(focusedIndex);
        } else {
          onSelect(focusedIndex);
        }
        break;
      case ' ':
        // Space to toggle selection
        if (enableMultiSelect) {
          e.preventDefault();
          handleToggleSelect(focusedIndex, false, true);
        }
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        listRef.current?.scrollToItem(0, 'start');
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(tracks.length - 1);
        listRef.current?.scrollToItem(tracks.length - 1, 'end');
        break;
      case 'PageDown':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = Math.min(prev + 10, tracks.length - 1);
          listRef.current?.scrollToItem(next, 'smart');
          return next;
        });
        break;
      case 'PageUp':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = Math.max(prev - 10, 0);
          listRef.current?.scrollToItem(next, 'smart');
          return next;
        });
        break;
      default:
        break;
    }
  }, [tracks, focusedIndex, onSelect, onPlayTrack, enableMultiSelect, handleToggleSelect, isMultiSelectMode, actualSelectedIndices, onBatchAction, setActualSelectedIndices]);

  const itemData = React.useMemo(() => ({
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
    focusedIndex,
    showRating,
    columnWidths, // New prop
    showAlbum,
    showArtist,
    showNumber,
    showDuration,
    selectedIndices: actualSelectedIndices,
    onToggleSelect: enableMultiSelect ? handleToggleSelect : undefined,
    isMultiSelectMode
  }), [
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
    focusedIndex,
    showRating,
    columnWidths,
    showAlbum,
    showArtist,
    showNumber,
    showDuration,
    actualSelectedIndices,
    enableMultiSelect,
    handleToggleSelect,
    isMultiSelectMode
  ]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="outline-none focus:outline-none"
      role="listbox"
      aria-label="Track list"
      aria-activedescendant={`track-${focusedIndex}`}
      aria-multiselectable={enableMultiSelect}
    >
      {/* Multi-select toolbar */}
      {isMultiSelectMode && actualSelectedIndices.size > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-cyan-900/30 border-b border-cyan-700/50">
          <span className="text-sm text-cyan-300">
            {actualSelectedIndices.size} track{actualSelectedIndices.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (onBatchAction) {
                  onBatchAction('queue', Array.from(actualSelectedIndices).map(i => tracks[i]));
                }
              }}
              className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
            >
              Add to Queue
            </button>
            <button
              onClick={() => {
                if (onBatchAction) {
                  onBatchAction('playlist', Array.from(actualSelectedIndices).map(i => tracks[i]));
                }
              }}
              className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
            >
              Add to Playlist
            </button>
            <button
              onClick={() => {
                setActualSelectedIndices(new Set());
                setIsMultiSelectMode(false);
              }}
              className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <ListVirtual
        ref={listRef}
        height={isMultiSelectMode && actualSelectedIndices.size > 0
          ? (height || 300) - 44
          : (height || 300)}
        itemCount={tracks.length}
        itemSize={itemSize}
        width="100%"
        itemData={itemData}
      >
        {TrackRow}
      </ListVirtual>
    </div>
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
  showDuration = true,
  onPlayTrack
}: SimpleTrackListProps) {
  const [focusedIndex, setFocusedIndex] = useState<number>(currentTrack ?? 0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (tracks.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, tracks.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (onPlayTrack) {
          onPlayTrack(focusedIndex);
        } else {
          onSelect(focusedIndex);
        }
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(tracks.length - 1);
        break;
      default:
        break;
    }
  }, [tracks.length, focusedIndex, onSelect, onPlayTrack]);

  const itemData: TrackRowData = {
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
    focusedIndex,
    showRating,
    showAlbum,
    showArtist,
    showNumber,
    showDuration
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex flex-col outline-none focus:outline-none"
      role="listbox"
      aria-label="Track list"
    >
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
