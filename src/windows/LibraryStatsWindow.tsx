import React, { useState, useEffect, type ReactNode } from 'react';
import { BarChart3, Database, HardDrive, Music, Clock, Disc, User, Folder, Loader, RefreshCw, Trash2, AlertTriangle, type LucideIcon } from 'lucide-react';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { useMaintenanceActions } from '../hooks/useMaintenanceActions';
import { formatBytes } from '../utils/formatters';
import { nativeConfirm, nativeError } from '../utils/nativeDialog';
import { usePlayerContext } from '../context/PlayerProvider';
import type { Track } from '../types';

// Extended performance stats shape from backend
interface ExtendedPerfStats {
  trackCount: number;
  folderCount: number;
  playlistCount: number;
  totalPlayTime: number;
  avgTrackDuration: number;
  performance?: {
    query_time_ms: number;
    memory_usage_mb?: number;
  };
  recommendations?: {
    vacuum_recommended: boolean;
  };
  [key: string]: unknown;
}

interface LocalStats {
  totalTracks: number;
  totalDuration: number;
  totalDurationFormatted: string;
  uniqueArtists: number;
  uniqueAlbums: number;
  uniqueGenres: number;
  yearRange: { min: number; max: number } | null;
  formats: Record<string, number>;
  totalPlays: number;
  mostPlayed: Track[];
  neverPlayed: number;
  ratedCount: number;
  avgRating: string;
}

/**
 * Library Statistics Window - Shows collection stats and performance info
 */
export function LibraryStatsWindow() {
  const { library } = usePlayerContext();
  const tracks: Track[] = library.tracks ?? [];
  const libraryFolders = library.libraryFolders ?? [];
  const currentColors = useCurrentColors();
  const {
    cacheSize, dbSize, perfStats, loadingStats: loading,
    vacuuming, clearingCache,
    loadStats, vacuumDatabase, clearCache,
  } = useMaintenanceActions();

  // Calculate local stats from tracks
  const localStats = React.useMemo((): LocalStats | null => {
    if (!tracks.length) return null;

    const totalDuration = tracks.reduce((sum: number, t: Track) => sum + (t.duration || 0), 0);
    const artists = new Set(tracks.map((t: Track) => t.artist).filter(Boolean));
    const albums = new Set(tracks.map((t: Track) => t.album).filter(Boolean));
    const genres = new Set(tracks.map((t: Track) => t.genre).filter(Boolean));
    const years = tracks.map((t: Track) => parseInt(String(t.year))).filter((y: number) => !isNaN(y) && y > 1900);
    const formats = tracks.reduce((acc: Record<string, number>, t: Track) => {
      const ext = t.path?.split('.').pop()?.toLowerCase() || 'unknown';
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Play count stats
    const totalPlays = tracks.reduce((sum: number, t: Track) => sum + (t.play_count || 0), 0);
    const mostPlayed = [...tracks].sort((a, b) => (b.play_count || 0) - (a.play_count || 0)).slice(0, 5);
    const neverPlayed = tracks.filter((t: Track) => !t.play_count || t.play_count === 0).length;
    
    // Rating stats
    const rated = tracks.filter((t: Track) => t.rating && t.rating > 0);
    const avgRating = rated.length > 0 
      ? rated.reduce((sum: number, t: Track) => sum + (t.rating ?? 0), 0) / rated.length 
      : 0;

    return {
      totalTracks: tracks.length,
      totalDuration,
      totalDurationFormatted: formatDurationLong(totalDuration),
      uniqueArtists: artists.size,
      uniqueAlbums: albums.size,
      uniqueGenres: genres.size,
      yearRange: years.length > 0 ? { min: Math.min(...years), max: Math.max(...years) } : null,
      formats,
      totalPlays,
      mostPlayed,
      neverPlayed,
      ratedCount: rated.length,
      avgRating: avgRating.toFixed(1),
    };
  }, [tracks]);

  // Load backend stats (including performance data for this window)
  useEffect(() => {
    loadStats({ includePerf: true });
  }, [loadStats]);

  const handleVacuum = async () => {
    try {
      await vacuumDatabase();
    } catch (err) {
      await nativeError('Failed to optimize database: ' + err);
    }
  };

  const handleClearCache = async () => {
    if (!await nativeConfirm('Clear album art cache? This will free up disk space but album art will need to be re-extracted.')) {
      return;
    }
    try {
      await clearCache();
    } catch (err) {
      await nativeError('Failed to clear cache: ' + err);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <BarChart3 className={`w-5 h-5 ${currentColors?.accent || 'text-cyan-400'}`} />
          <h2 className="text-white font-semibold">Library Statistics</h2>
        </div>
        <button
          onClick={() => loadStats({ includePerf: true })}
          disabled={loading}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh stats"
        >
          <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Collection Overview */}
        <StatSection title="Collection Overview" icon={Music}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Tracks" value={localStats?.totalTracks || 0} icon={Music} color="cyan" />
            <StatCard label="Artists" value={localStats?.uniqueArtists || 0} icon={User} color="violet" />
            <StatCard label="Albums" value={localStats?.uniqueAlbums || 0} icon={Disc} color="pink" />
            <StatCard label="Genres" value={localStats?.uniqueGenres || 0} icon={BarChart3} color="emerald" />
          </div>
        </StatSection>

        {/* Duration & Playback */}
        <StatSection title="Playback Stats" icon={Clock}>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-slate-500 text-xs mb-1">Total Duration</p>
              <p className="text-white text-lg font-semibold">{localStats?.totalDurationFormatted || '0h 0m'}</p>
            </div>
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-slate-500 text-xs mb-1">Total Plays</p>
              <p className="text-white text-lg font-semibold">{localStats?.totalPlays?.toLocaleString() || 0}</p>
            </div>
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-slate-500 text-xs mb-1">Never Played</p>
              <p className="text-white text-lg font-semibold">{localStats?.neverPlayed || 0} tracks</p>
            </div>
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-slate-500 text-xs mb-1">Average Rating</p>
              <p className="text-white text-lg font-semibold">
                {localStats?.avgRating || '0.0'} ★ ({localStats?.ratedCount || 0} rated)
              </p>
            </div>
          </div>

          {/* Most Played */}
          {(localStats?.mostPlayed?.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className="text-slate-400 text-sm mb-2">Most Played</p>
              <div className="space-y-1">
                {localStats!.mostPlayed.map((track: Track, i: number) => (
                  <div key={track.id} className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg">
                    <span className="text-slate-500 text-xs w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{track.title}</p>
                      <p className="text-slate-500 text-xs truncate">{track.artist}</p>
                    </div>
                    <span className="text-slate-400 text-xs">{track.play_count} plays</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </StatSection>

        {/* File Formats */}
        {localStats?.formats && Object.keys(localStats.formats).length > 0 && (
          <StatSection title="File Formats" icon={Folder}>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(localStats.formats)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .map(([format, count]) => (
                  <div key={format} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <p className="text-slate-400 text-xs uppercase">.{format}</p>
                    <p className="text-white font-medium">{String(count)}</p>
                  </div>
                ))}
            </div>
          </StatSection>
        )}

        {/* Year Range */}
        {localStats?.yearRange && (
          <StatSection title="Year Range" icon={Clock}>
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-white text-lg font-semibold">
                {localStats.yearRange.min} — {localStats.yearRange.max}
              </p>
              <p className="text-slate-500 text-xs mt-1">
                Spanning {localStats.yearRange.max - localStats.yearRange.min} years of music
              </p>
            </div>
          </StatSection>
        )}

        {/* Storage & Performance */}
        <StatSection title="Storage & Performance" icon={HardDrive}>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-slate-500 text-xs mb-1">Database Size</p>
              <p className="text-white text-lg font-semibold">{formatBytes(dbSize)}</p>
            </div>
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-slate-500 text-xs mb-1">Cache Size</p>
              <p className="text-white text-lg font-semibold">{formatBytes(cacheSize)}</p>
            </div>
          </div>

          {/* Backend Performance */}
          {(perfStats as ExtendedPerfStats | null)?.performance && (
            <div className="mt-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-slate-500 text-xs mb-2">Performance</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">Query Time:</span>
                  <span className="text-white ml-2">{(perfStats as ExtendedPerfStats).performance!.query_time_ms}ms</span>
                </div>
                <div>
                  <span className="text-slate-400">Memory:</span>
                  <span className="text-white ml-2">{(perfStats as ExtendedPerfStats).performance!.memory_usage_mb?.toFixed(1)}MB</span>
                </div>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {(perfStats as ExtendedPerfStats | null)?.recommendations && (
            <div className="mt-3 space-y-2">
              {(perfStats as ExtendedPerfStats).recommendations!.vacuum_recommended && (
                <div className="p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                  <p className="text-yellow-300 text-sm flex-1">Database optimization recommended</p>
                  <button
                    onClick={handleVacuum}
                    disabled={vacuuming}
                    className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-xs rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {vacuuming ? <Loader className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
                    Optimize
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleVacuum}
              disabled={vacuuming}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {vacuuming ? <Loader className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              Optimize Database
            </button>
            <button
              onClick={handleClearCache}
              disabled={clearingCache}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {clearingCache ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Clear Cache
            </button>
          </div>
        </StatSection>

        {/* Library Folders */}
        {libraryFolders.length > 0 && (
          <StatSection title="Library Folders" icon={Folder}>
            <div className="space-y-2">
              {libraryFolders.map((folder: { id: string; path: string; name: string; dateAdded: number }) => (
                <div key={folder.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <p className="text-white text-sm truncate">{folder.name}</p>
                  <p className="text-slate-500 text-xs truncate">{folder.path}</p>
                </div>
              ))}
            </div>
          </StatSection>
        )}
      </div>
    </div>
  );
}

// Helper Components
interface StatSectionProps {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}

function StatSection({ title, icon: Icon, children }: StatSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-slate-500" />
        <h3 className="text-white font-medium">{title}</h3>
      </div>
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: 'cyan' | 'violet' | 'pink' | 'emerald';
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  const colorClasses: Record<string, string> = {
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
    pink: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  };

  return (
    <div className={`p-4 rounded-xl border ${colorClasses[color] || colorClasses.cyan}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs opacity-80">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

function formatDurationLong(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default LibraryStatsWindow;
