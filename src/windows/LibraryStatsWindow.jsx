import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Clock, Star, Music, Disc, Play } from 'lucide-react';
import { TauriAPI } from '../services/TauriAPI';

export function LibraryStatsWindow({ tracks, currentColors }) {
  const [stats, setStats] = useState({
    totalTracks: 0,
    totalDuration: 0,
    totalArtists: 0,
    totalAlbums: 0,
    totalSize: 0,
    averageRating: 0,
    mostPlayed: [],
    recentlyAdded: [],
    topRated: [],
    genreDistribution: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    calculateStats();
  }, [tracks]);

  const calculateStats = async () => {
    setLoading(true);

    try {
      // Basic stats
      const totalTracks = tracks.length;
      const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
      
      // Unique artists and albums
      const uniqueArtists = new Set(tracks.map(t => t.artist).filter(Boolean));
      const uniqueAlbums = new Set(tracks.map(t => t.album).filter(Boolean));
      
      // Average rating
      const ratedTracks = tracks.filter(t => t.rating > 0);
      const averageRating = ratedTracks.length > 0
        ? ratedTracks.reduce((sum, t) => sum + t.rating, 0) / ratedTracks.length
        : 0;

      // Most played (need backend support)
      const mostPlayed = await TauriAPI.getMostPlayed(10).catch(() => []);
      
      // Recently added
      const recentlyAdded = [...tracks]
        .sort((a, b) => (b.date_added || 0) - (a.date_added || 0))
        .slice(0, 10);
      
      // Top rated
      const topRated = [...tracks]
        .filter(t => t.rating > 0)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 10);

      // Genre distribution (if available)
      const genreDistribution = tracks.reduce((acc, t) => {
        const genre = t.genre || 'Unknown';
        acc[genre] = (acc[genre] || 0) + 1;
        return acc;
      }, {});

      setStats({
        totalTracks,
        totalDuration,
        totalArtists: uniqueArtists.size,
        totalAlbums: uniqueAlbums.size,
        totalSize: 0, // Would need file size from backend
        averageRating,
        mostPlayed,
        recentlyAdded,
        topRated,
        genreDistribution,
      });
    } catch (err) {
      console.error('Failed to calculate stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatTime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Music className="w-4 h-4" />
            <span className="text-xs">Total Tracks</span>
          </div>
          <div className={`text-2xl font-bold ${currentColors.accent}`}>
            {stats.totalTracks.toLocaleString()}
          </div>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Total Duration</span>
          </div>
          <div className={`text-2xl font-bold ${currentColors.accent}`}>
            {formatTime(stats.totalDuration)}
          </div>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs">Artists</span>
          </div>
          <div className={`text-2xl font-bold ${currentColors.accent}`}>
            {stats.totalArtists}
          </div>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Disc className="w-4 h-4" />
            <span className="text-xs">Albums</span>
          </div>
          <div className={`text-2xl font-bold ${currentColors.accent}`}>
            {stats.totalAlbums}
          </div>
        </div>
      </div>

      {/* Average Rating */}
      {stats.averageRating > 0 && (
        <div className="bg-slate-800/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Star className="w-4 h-4" />
            <span className="text-xs">Average Rating</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-xl font-bold ${currentColors.accent}`}>
              {stats.averageRating.toFixed(1)}
            </div>
            <div className="flex">
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${
                    star <= stats.averageRating
                      ? 'fill-yellow-500 text-yellow-500'
                      : 'text-slate-600'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Rated Tracks */}
      {stats.topRated.length > 0 && (
        <div className="bg-slate-800/50 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Star className="w-4 h-4" />
            Top Rated Tracks
          </h3>
          <div className="space-y-2">
            {stats.topRated.slice(0, 5).map((track, idx) => (
              <div key={track.id} className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 w-6">{idx + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-slate-200">{track.title}</div>
                  <div className="truncate text-xs text-slate-500">{track.artist}</div>
                </div>
                <div className="flex">
                  {[...Array(track.rating)].map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most Played */}
      {stats.mostPlayed.length > 0 && (
        <div className="bg-slate-800/50 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Play className="w-4 h-4" />
            Most Played
          </h3>
          <div className="space-y-2">
            {stats.mostPlayed.slice(0, 5).map((track, idx) => (
              <div key={track.id} className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 w-6">{idx + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-slate-200">{track.title}</div>
                  <div className="truncate text-xs text-slate-500">{track.artist}</div>
                </div>
                <div className="text-slate-400 text-xs">
                  {track.play_count} plays
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently Added */}
      <div className="bg-slate-800/50 p-4 rounded-lg">
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Recently Added
        </h3>
        <div className="space-y-2">
          {stats.recentlyAdded.slice(0, 5).map((track, idx) => (
            <div key={track.id} className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 w-6">{idx + 1}.</span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-slate-200">{track.title}</div>
                <div className="truncate text-xs text-slate-500">{track.artist}</div>
              </div>
              <div className="text-slate-400 text-xs">
                {new Date(track.date_added).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Genre Distribution */}
      {Object.keys(stats.genreDistribution).length > 0 && (
        <div className="bg-slate-800/50 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Genre Distribution
          </h3>
          <div className="space-y-2">
            {Object.entries(stats.genreDistribution)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)
              .map(([genre, count]) => {
                const percentage = ((count / stats.totalTracks) * 100).toFixed(1);
                return (
                  <div key={genre} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">{genre}</span>
                      <span className="text-slate-500">{count} ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className={`bg-gradient-to-r ${currentColors.primary} h-2 rounded-full transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
