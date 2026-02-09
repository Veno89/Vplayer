import React, { useState, useEffect } from 'react';
import { History, Clock, TrendingUp, PlayCircle } from 'lucide-react';
import { TauriAPI } from '../services/TauriAPI';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { usePlayerContext } from '../context/PlayerProvider';
import type { Track } from '../types';

export function HistoryWindow() {
  const currentColors = useCurrentColors();
  const setCurrentTrack = useStore(s => s.setCurrentTrack);
  const { playbackTracks: tracks } = usePlayerContext();
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [mostPlayed, setMostPlayed] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('recent');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const [recent, most] = await Promise.all([
        TauriAPI.getRecentlyPlayed(50),
        TauriAPI.getMostPlayed(50)
      ]);
      setRecentlyPlayed(recent);
      setMostPlayed(most);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackClick = (track: Track) => {
    const trackIndex = tracks.findIndex((t: Track) => t.id === track.id);
    if (trackIndex !== -1) {
      setCurrentTrack(trackIndex);
    }
  };

  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <History className={`w-5 h-5 ${currentColors.accent}`} />
          History
        </h3>
        <button
          onClick={loadHistory}
          onMouseDown={e => e.stopPropagation()}
          disabled={loading}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-slate-800/50 rounded p-1">
        <button
          onClick={() => setActiveTab('recent')}
          onMouseDown={e => e.stopPropagation()}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-all ${
            activeTab === 'recent'
              ? `${currentColors.primary} text-white`
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
          Recently Played
        </button>
        <button
          onClick={() => setActiveTab('most')}
          onMouseDown={e => e.stopPropagation()}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-all ${
            activeTab === 'most'
              ? `${currentColors.primary} text-white`
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Most Played
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            Loading...
          </div>
        ) : (
          <>
            {activeTab === 'recent' && (
              <>
                {recentlyPlayed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <Clock className="w-12 h-12 text-slate-600 mb-3" />
                    <p className="text-slate-400 text-sm">No listening history yet</p>
                    <p className="text-slate-500 text-xs mt-1">
                      Start playing tracks to build your history
                    </p>
                  </div>
                ) : (
                  recentlyPlayed.map((track, index) => (
                    <div
                      key={`recent-${track.id}-${index}`}
                      className="group flex items-center gap-3 p-2 rounded bg-slate-800/50 hover:bg-slate-800 transition-all cursor-pointer"
                      onClick={() => handleTrackClick(track)}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <div className="flex-shrink-0 w-8 text-center">
                        <PlayCircle className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors inline-block" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-white truncate" title={track.title || track.name}>
                          {track.title || track.name}
                        </div>
                        <div className="text-xs text-slate-400 truncate" title={track.artist}>
                          {track.artist || 'Unknown Artist'}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-xs text-slate-500">
                        {formatDate(track.last_played)}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {activeTab === 'most' && (
              <>
                {mostPlayed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <TrendingUp className="w-12 h-12 text-slate-600 mb-3" />
                    <p className="text-slate-400 text-sm">No play statistics yet</p>
                    <p className="text-slate-500 text-xs mt-1">
                      Listen to your favorite tracks to see them here
                    </p>
                  </div>
                ) : (
                  mostPlayed.map((track, index) => (
                    <div
                      key={`most-${track.id}-${index}`}
                      className="group flex items-center gap-3 p-2 rounded bg-slate-800/50 hover:bg-slate-800 transition-all cursor-pointer"
                      onClick={() => handleTrackClick(track)}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <div className="flex-shrink-0 w-8 text-center">
                        <span className={`text-sm font-bold ${
                          index < 3 ? currentColors.accent : 'text-slate-500'
                        }`}>
                          {index + 1}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-white truncate" title={track.title || track.name}>
                          {track.title || track.name}
                        </div>
                        <div className="text-xs text-slate-400 truncate" title={track.artist}>
                          {track.artist || 'Unknown Artist'}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-xs text-slate-500 font-medium">
                        {track.play_count || 0} plays
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
