import React, { useState, useMemo } from 'react';
import { List, X, Trash2, Shuffle, PlayCircle, MoveUp, MoveDown, ListX, Search, Target } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';

export function QueueWindow() {
  const currentColors = useCurrentColors();
  const setCurrentTrack = useStore((state) => state.setCurrentTrack);
  const tracks = useStore((state) => state.tracks);
  const queue = useStore((state) => state.queue);
  const queueIndex = useStore((state) => state.queueIndex);
  const queueHistory = useStore((state) => state.queueHistory);
  const removeFromQueue = useStore((state) => state.removeFromQueue);
  const clearQueue = useStore((state) => state.clearQueue);
  const shuffleQueue = useStore((state) => state.shuffleQueue);
  const moveInQueue = useStore((state) => state.moveInQueue);

  const [selectedIndex, setSelectedIndex] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter queue based on search query
  const filteredQueue = useMemo(() => {
    if (!searchQuery.trim()) {
      return queue.map((track, index) => ({ track, originalIndex: index }));
    }
    const query = searchQuery.toLowerCase();
    return queue
      .map((track, index) => ({ track, originalIndex: index }))
      .filter(({ track }) => {
        const searchableText = [
          track.title,
          track.name,
          track.artist,
          track.album
        ].filter(Boolean).join(' ').toLowerCase();
        return searchableText.includes(query);
      });
  }, [queue, searchQuery]);

  // Calculate upcoming tracks (after current)
  const upcomingCount = Math.max(0, queue.length - queueIndex - 1);

  const handleTrackClick = (index) => {
    const track = queue[index];
    if (track) {
      // Find track in main tracks list and play it
      const trackIndex = tracks.findIndex(t => t.id === track.id);
      if (trackIndex !== -1) {
        setCurrentTrack(trackIndex);
      }
    }
  };

  const handleMoveUp = (index) => {
    if (index > 0) {
      moveInQueue(index, index - 1);
    }
  };

  const handleMoveDown = (index) => {
    if (index < queue.length - 1) {
      moveInQueue(index, index + 1);
    }
  };

  const handleClearQueue = () => {
    clearQueue();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <List className={`w-5 h-5 ${currentColors.accent}`} />
          Queue
          {queue.length > 0 && (
            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${currentColors.primary} text-white`}>
              {upcomingCount > 0 ? upcomingCount : queue.length}
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              shuffleQueue();
            }}
            disabled={queue.length === 0}
            className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Shuffle Queue"
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              handleClearQueue();
            }}
            disabled={queue.length === 0}
            className="p-2 bg-red-700/20 hover:bg-red-700/40 text-red-400 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
            title="Clear Queue"
          >
            <ListX className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Queue Stats */}
      {queue.length > 0 && (
        <div className="flex gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded">
            <span className="text-slate-500">Total:</span>
            <span className="text-white font-medium">{queue.length}</span>
          </div>
          {upcomingCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded">
              <span className="text-slate-500">Up next:</span>
              <span className={`font-medium ${currentColors.accent}`}>{upcomingCount}</span>
            </div>
          )}
          {searchQuery && filteredQueue.length !== queue.length && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-cyan-900/30 rounded">
              <span className="text-cyan-400">{filteredQueue.length} match{filteredQueue.length !== 1 ? 'es' : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Search Bar */}
      {queue.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search queue..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded pl-10 pr-8 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
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
      )}

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <List className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm mb-2">Queue is empty</p>
            <p className="text-slate-500 text-xs">
              Add tracks from your library or playlists
            </p>
          </div>
        ) : filteredQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Search className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm mb-2">No matches found</p>
            <p className="text-slate-500 text-xs">
              Try a different search term
            </p>
          </div>
        ) : (
          filteredQueue.map(({ track, originalIndex }) => {
            const isCurrent = originalIndex === queueIndex;
            const isSelected = originalIndex === selectedIndex;

            return (
              <div
                key={`${track.id}-${originalIndex}`}
                className={`group flex items-center gap-3 p-2 rounded transition-all cursor-pointer ${
                  isCurrent
                    ? `bg-gradient-to-r ${currentColors.primary} text-white`
                    : isSelected
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300'
                }`}
                onClick={() => {
                  setSelectedIndex(originalIndex);
                  handleTrackClick(originalIndex);
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                {/* Track Number / Play Icon */}
                <div className="flex-shrink-0 w-6 text-center">
                  {isCurrent ? (
                    <PlayCircle className="w-5 h-5 inline-block" />
                  ) : (
                    <span className="text-slate-500 text-sm">{originalIndex + 1}</span>
                  )}
                </div>

                {/* Track Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm" title={track.title || track.name}>
                    {track.title || track.name}
                  </div>
                  <div className="text-xs opacity-75 truncate" title={track.artist}>
                    {track.artist || 'Unknown Artist'}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleMoveUp(originalIndex);
                    }}
                    disabled={originalIndex === 0}
                    className="p-1 hover:bg-slate-700 rounded disabled:opacity-30"
                    title="Move Up"
                  >
                    <MoveUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleMoveDown(originalIndex);
                    }}
                    disabled={originalIndex === queue.length - 1}
                    className="p-1 hover:bg-slate-700 rounded disabled:opacity-30"
                    title="Move Down"
                  >
                    <MoveDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      removeFromQueue(originalIndex);
                    }}
                    className="p-1 hover:bg-red-500/20 text-red-400 rounded"
                    title="Remove from Queue"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* History Section */}
      {queueHistory.length > 0 && (
        <div className="border-t border-slate-700 pt-3">
          <h4 className="text-slate-400 text-xs font-medium mb-2">
            Recently Played ({queueHistory.length})
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {queueHistory.slice(-5).reverse().map((track, index) => (
              <div
                key={`history-${track.id}-${index}`}
                className="flex items-center gap-2 p-2 bg-slate-900/50 rounded text-xs text-slate-400"
              >
                <span className="flex-shrink-0">•</span>
                <span className="flex-1 truncate" title={track.title || track.name}>
                  {track.title || track.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
