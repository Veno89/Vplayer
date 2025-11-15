import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileQuestion, Trash2, Loader, Check } from 'lucide-react';
import { useToast } from '../hooks/useToast';

export default function DuplicatesWindow({ onDuplicateRemoved, currentColors }) {
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [removingTracks, setRemovingTracks] = useState(new Set());
  const { showSuccess, showError, showInfo } = useToast();

  useEffect(() => {
    findDuplicates();
  }, []);

  const findDuplicates = async () => {
    setLoading(true);
    try {
      const groups = await invoke('find_duplicates');
      setDuplicateGroups(groups);
      if (groups.length === 0) {
        showSuccess('No duplicates found!');
      } else {
        showInfo(`Found ${groups.length} groups of duplicates`);
      }
    } catch (error) {
      console.error('Failed to find duplicates:', error);
      showError('Failed to find duplicates');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTrack = async (trackId, groupIndex) => {
    setRemovingTracks(prev => new Set(prev).add(trackId));
    try {
      await invoke('remove_track', { trackId });
      
      // Update UI - remove track from group
      setDuplicateGroups(prev => {
        const newGroups = [...prev];
        newGroups[groupIndex] = newGroups[groupIndex].filter(t => t.id !== trackId);
        // Remove group if only 1 track left
        return newGroups.filter(g => g.length > 1);
      });

      showSuccess('Track removed successfully');
      
      // Notify parent to refresh library
      if (onDuplicateRemoved) {
        onDuplicateRemoved();
      }
    } catch (error) {
      console.error('Failed to remove track:', error);
      showError('Failed to remove track');
    } finally {
      setRemovingTracks(prev => {
        const newSet = new Set(prev);
        newSet.delete(trackId);
        return newSet;
      });
    }
  };

  const handleKeepOneRemoveOthers = async (groupIndex, keepTrackId) => {
    const group = duplicateGroups[groupIndex];
    const tracksToRemove = group.filter(t => t.id !== keepTrackId);
    
    if (!confirm(`Remove ${tracksToRemove.length} duplicate track(s) and keep the selected one?`)) {
      return;
    }

    setRemovingTracks(prev => {
      const newSet = new Set(prev);
      tracksToRemove.forEach(t => newSet.add(t.id));
      return newSet;
    });

    try {
      // Remove all tracks except the one to keep
      for (const track of tracksToRemove) {
        await invoke('remove_track', { trackId: track.id });
      }

      // Update UI - remove entire group
      setDuplicateGroups(prev => prev.filter((_, idx) => idx !== groupIndex));

      showSuccess(`Removed ${tracksToRemove.length} duplicate track(s)`);
      
      if (onDuplicateRemoved) {
        onDuplicateRemoved();
      }
    } catch (error) {
      console.error('Failed to remove duplicates:', error);
      showError('Failed to remove duplicates');
    } finally {
      setRemovingTracks(prev => {
        const newSet = new Set(prev);
        tracksToRemove.forEach(t => newSet.delete(t.id));
        return newSet;
      });
    }
  };

  const toggleGroup = (index) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const kb = bytes / 1024;
    const mb = kb / 1024;
    return mb >= 1 ? `${mb.toFixed(2)} MB` : `${kb.toFixed(2)} KB`;
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileQuestion className={`w-5 h-5 ${currentColors.accent}`} />
          <div>
            <h3 className="font-semibold text-white text-sm">Duplicate Tracks</h3>
            <p className="text-xs text-slate-400">
              {duplicateGroups.length === 0 
                ? 'No duplicates found'
                : `${duplicateGroups.length} groups of duplicates found`}
            </p>
          </div>
        </div>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            findDuplicates();
          }}
          disabled={loading}
          className="px-3 py-1 bg-blue-700 text-white text-xs rounded hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading && <Loader className="w-3 h-3 animate-spin" />}
          {loading ? 'Scanning...' : 'Scan Again'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        ) : duplicateGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FileQuestion className="w-16 h-16 mb-4" />
            <p className="text-sm">No duplicate tracks found</p>
            <p className="text-xs mt-2 text-slate-500 text-center max-w-md">
              Tracks with similar title, artist, album, and duration are considered duplicates
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {duplicateGroups.map((group, groupIndex) => {
              const isExpanded = expandedGroups.has(groupIndex);
              const firstTrack = group[0];
              
              return (
                <div key={groupIndex} className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
                  {/* Group Header */}
                  <div
                    className="p-3 cursor-pointer hover:bg-slate-800 flex items-center justify-between"
                    onClick={() => toggleGroup(groupIndex)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-sm truncate">{firstTrack.title || firstTrack.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {firstTrack.artist || 'Unknown Artist'} • {firstTrack.album || 'Unknown Album'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-yellow-400 font-semibold">
                        {group.length} copies
                      </span>
                      <span className="text-slate-400">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                  </div>

                  {/* Expanded Group Details */}
                  {isExpanded && (
                    <div className="border-t border-slate-700">
                      {group.map((track, trackIndex) => {
                        const isRemoving = removingTracks.has(track.id);
                        return (
                          <div
                            key={track.id}
                            className={`p-3 hover:bg-slate-800/50 flex items-center gap-3 border-b border-slate-700/50 last:border-b-0 ${isRemoving ? 'opacity-50' : ''}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white truncate">{track.name}</div>
                              <div className="text-xs text-slate-500 truncate" title={track.path}>
                                {track.path}
                              </div>
                              <div className="text-xs text-slate-400 mt-1 flex gap-3">
                                <span>Duration: {formatDuration(track.duration)}</span>
                                <span>Rating: {'★'.repeat(track.rating || 0)}{'☆'.repeat(5 - (track.rating || 0))}</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleKeepOneRemoveOthers(groupIndex, track.id);
                                }}
                                disabled={isRemoving}
                                className="px-2 py-1 hover:bg-green-700/20 rounded text-green-400 hover:text-green-300 text-xs flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Keep this one, remove others"
                              >
                                <Check className="w-3 h-3" />
                                Keep
                              </button>
                              <button
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleRemoveTrack(track.id, groupIndex);
                                }}
                                disabled={isRemoving}
                                className="p-1.5 hover:bg-red-700/20 rounded text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Remove this track"
                              >
                                {isRemoving ? (
                                  <Loader className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {duplicateGroups.length > 0 && (
        <div className="pt-3 border-t border-slate-700">
          <p className="text-xs text-slate-400 text-center">
            Click "Keep" to remove all duplicates except that version. Review quality and tags before deciding.
          </p>
        </div>
      )}
    </div>
  );
}
