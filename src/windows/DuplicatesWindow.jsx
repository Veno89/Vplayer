import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileQuestion, Trash2, Loader } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/Modal';

export default function DuplicatesWindow({ isOpen, onClose, onDuplicateRemoved }) {
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const { showSuccess, showError, showInfo } = useToast();

  useEffect(() => {
    if (isOpen) {
      findDuplicates();
    }
  }, [isOpen]);

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Duplicate Tracks" maxWidth="max-w-3xl">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="pb-4 border-b border-slate-700 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileQuestion className="w-5 h-5 text-yellow-400" />
              <div>
                <h3 className="font-semibold text-white">Duplicate Detection</h3>
                <p className="text-xs text-slate-400">
                  {duplicateGroups.length === 0 
                    ? 'No duplicates found'
                    : `${duplicateGroups.length} groups of duplicates found`}
                </p>
              </div>
            </div>
            <button
              onClick={findDuplicates}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-white"
            >
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              {loading ? 'Scanning...' : 'Scan Again'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">"
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : duplicateGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/60">
              <FileQuestion className="w-16 h-16 mb-4" />
              <p>No duplicate tracks found</p>
              <p className="text-sm mt-2">Tracks with similar title, artist, album, and duration are considered duplicates</p>
            </div>
          ) : (
            <div className="space-y-4">
              {duplicateGroups.map((group, groupIndex) => {
                const isExpanded = expandedGroups.has(groupIndex);
                const firstTrack = group[0];
                
                return (
                  <div key={groupIndex} className="border border-white/10 rounded-lg overflow-hidden bg-white/5">
                    {/* Group Header */}
                    <div
                      className="p-3 cursor-pointer hover:bg-white/5 flex items-center justify-between"
                      onClick={() => toggleGroup(groupIndex)}
                    >
                      <div className="flex-1">
                        <div className="font-semibold">{firstTrack.title || firstTrack.name}</div>
                        <div className="text-sm text-white/60">
                          {firstTrack.artist || 'Unknown Artist'} • {firstTrack.album || 'Unknown Album'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-yellow-400 font-semibold">
                          {group.length} copies
                        </span>
                        <span className="text-white/40">{isExpanded ? '▼' : '▶'}</span>
                      </div>
                    </div>

                    {/* Expanded Group Details */}
                    {isExpanded && (
                      <div className="border-t border-white/10">
                        {group.map((track, trackIndex) => (
                          <div
                            key={track.id}
                            className="p-3 hover:bg-white/5 flex items-center gap-3 border-b border-white/5 last:border-b-0"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{track.name}</div>
                              <div className="text-xs text-white/50 truncate" title={track.path}>
                                {track.path}
                              </div>
                              <div className="text-xs text-white/40 mt-1">
                                Duration: {formatDuration(track.duration)} • 
                                Rating: {'★'.repeat(track.rating || 0)}{'☆'.repeat(5 - (track.rating || 0))}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveTrack(track.id, groupIndex)}
                              className="p-2 hover:bg-red-600/20 rounded text-red-400 hover:text-red-300"
                              title="Remove this track"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
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
          <div className="p-3 border-t border-slate-700 bg-slate-800/50">
            <p className="text-xs text-slate-400 text-center">
              Review each group and remove unwanted duplicates. Keep the version with higher quality or better tags.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
