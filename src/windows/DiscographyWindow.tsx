/**
 * DiscographyWindow Component
 * 
 * UI for browsing artist discographies and finding missing albums.
 * Shows local library artists matched against MusicBrainz data.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Music,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  HelpCircle,
  Loader,
  ExternalLink,
  Settings,
  Disc,
  Calendar,
  Users,
  Download,
  CheckCircle,
  XCircle,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { useDiscography } from '../hooks/useDiscography';
import { save } from '@tauri-apps/plugin-dialog';
import { TauriAPI } from '../services/TauriAPI';
import { nativeAlert, nativeError } from '../utils/nativeDialog';
import { desktopDir } from '@tauri-apps/api/path';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { usePlayerContext } from '../context/PlayerProvider';
import type { AlbumMatch, AlbumMatchStatus } from '../services/DiscographyMatcher';
import type { ColorScheme, DiscographyConfig, ResolvedArtist, ArtistDiscography } from '../store/types';
import type { MBArtistResult } from '../services/MusicBrainzAPI';

// Local UI types - aligned with useDiscography hook return types
interface ArtistEntry {
  name: string;
  normalizedName: string;
  localAlbumCount: number;
  localAlbums: Map<string, unknown>;
  mbArtist: ResolvedArtist | null;
  discography: ArtistDiscography | null;
  isResolved: boolean;
  hasMissingAlbums: boolean;
  nameVariants: Set<string>;
}

interface AllArtistExport {
  artistName: string;
  albums: AlbumMatch[];
}

// Helper to export missing albums to a text file
const exportMissingAlbums = async (
  artistName: string | null,
  albums: AlbumMatch[] | null,
  allArtistsData: AllArtistExport[] | null = null
) => {
  const lines = [];
  const timestamp = new Date().toISOString().split('T')[0];
  
  if (allArtistsData) {
    // Export all artists' missing albums
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('                    MISSING ALBUMS REPORT');
    lines.push(`                    Generated: ${timestamp}`);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    
    let totalMissing = 0;
    
    allArtistsData.forEach(({ artistName: name, albums: artistAlbums }: AllArtistExport) => {
      const missing = artistAlbums.filter((a: AlbumMatch) => a.status === 'missing');
      if (missing.length === 0) return;
      
      totalMissing += missing.length;
      lines.push(`━━━ ${name} ━━━`);
      lines.push(`    ${missing.length} missing album${missing.length !== 1 ? 's' : ''}`);
      lines.push('');
      
      missing.sort((a: AlbumMatch, b: AlbumMatch) => {
        const yearA = a.mbFirstReleaseDate?.substring(0, 4) || '9999';
        const yearB = b.mbFirstReleaseDate?.substring(0, 4) || '9999';
        return yearA.localeCompare(yearB);
      }).forEach((album: AlbumMatch) => {
        const year = album.mbFirstReleaseDate?.substring(0, 4) || 'Unknown';
        const type = album.mbPrimaryType || 'Album';
        const secondary = album.mbSecondaryTypes?.length > 0 ? ` (${album.mbSecondaryTypes.join(', ')})` : '';
        lines.push(`    • [${year}] ${album.mbTitle} - ${type}${secondary}`);
      });
      
      lines.push('');
    });
    
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`                    TOTAL: ${totalMissing} missing albums`);
    lines.push('═══════════════════════════════════════════════════════════════');
  } else {
    // Export single artist's missing albums
    const missing = (albums ?? []).filter((a: AlbumMatch) => a.status === 'missing');
    
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`                    MISSING ALBUMS: ${artistName}`);
    lines.push(`                    Generated: ${timestamp}`);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Found ${missing.length} missing album${missing.length !== 1 ? 's' : ''}`);
    lines.push('');
    
    missing.sort((a: AlbumMatch, b: AlbumMatch) => {
      const yearA = a.mbFirstReleaseDate?.substring(0, 4) || '9999';
      const yearB = b.mbFirstReleaseDate?.substring(0, 4) || '9999';
      return yearA.localeCompare(yearB);
    }).forEach((album: AlbumMatch) => {
      const year = album.mbFirstReleaseDate?.substring(0, 4) || 'Unknown';
      const type = album.mbPrimaryType || 'Album';
      const secondary = album.mbSecondaryTypes?.length > 0 ? ` (${album.mbSecondaryTypes.join(', ')})` : '';
      lines.push(`• [${year}] ${album.mbTitle}`);
      lines.push(`    Type: ${type}${secondary}`);
      if (album.mbReleaseGroupId) {
        lines.push(`    MusicBrainz: https://musicbrainz.org/release-group/${album.mbReleaseGroupId}`);
      }
      lines.push('');
    });
  }
  
  const content = lines.join('\n');
  
  try {
    // Get desktop directory path
    const desktop = await desktopDir();
    
    // Create default filename
    const defaultFilename = allArtistsData 
      ? `missing-albums-${timestamp}.txt`
      : `missing-albums-${(artistName ?? 'unknown').replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}.txt`;
    
    // Show save dialog with desktop as default location
    const filePath = await save({
      defaultPath: `${desktop}${defaultFilename}`,
      filters: [{
        name: 'Text',
        extensions: ['txt']
      }]
    });
    
    if (filePath) {
      // Write the file using Tauri command
      await TauriAPI.writeTextFile(filePath, content);
      console.log('[DiscographyWindow] Exported missing albums to:', filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[DiscographyWindow] Failed to export missing albums:', error);
    await nativeError(`Failed to export file: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
};

// Status badge component
const StatusBadge = ({ status }: { status: AlbumMatchStatus }) => {
  const config: Record<AlbumMatchStatus, { icon: LucideIcon; className: string; label: string }> = {
    present: {
      icon: CheckCircle,
      className: 'bg-green-500/20 text-green-400 border-green-500/30',
      label: 'In Library',
    },
    missing: {
      icon: XCircle,
      className: 'bg-red-500/20 text-red-400 border-red-500/30',
      label: 'Missing',
    },
    uncertain: {
      icon: HelpCircle,
      className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      label: 'Possible Match',
    },
  };

  const { icon: Icon, className, label } = config[status] ?? config.missing;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

// Album card component
interface AlbumCardProps {
  album: AlbumMatch;
  currentColors: ColorScheme;
  onMarkOwned: (id: string) => void;
  onMarkMissing: (id: string) => void;
  getCoverArtUrl: (releaseGroupId: string, size: 'small' | 'medium' | 'large') => string | null;
}

const AlbumCard = ({ album, currentColors, onMarkOwned, onMarkMissing, getCoverArtUrl }: AlbumCardProps) => {
  const [imageError, setImageError] = useState(false);
  const coverUrl = getCoverArtUrl(album.mbReleaseGroupId, 'small');
  const year = album.mbFirstReleaseDate?.substring(0, 4);

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors group">
      {/* Album Art */}
      <div className="w-14 h-14 rounded overflow-hidden bg-slate-700 flex-shrink-0">
        {!imageError && coverUrl ? (
          <img
            src={coverUrl}
            alt={album.mbTitle}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Disc className="w-6 h-6 text-slate-500" />
          </div>
        )}
      </div>

      {/* Album Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-white text-sm font-medium truncate" title={album.mbTitle}>
          {album.mbTitle}
        </h4>
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
          {year && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {year}
            </span>
          )}
          <span>{album.mbPrimaryType}</span>
          {album.mbSecondaryTypes?.length > 0 && (
            <span className="text-slate-500">
              ({album.mbSecondaryTypes.join(', ')})
            </span>
          )}
        </div>
        {album.localAlbum && album.status !== 'present' && (
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            Possible: "{album.localAlbum.name}"
          </div>
        )}
      </div>

      {/* Status & Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={album.status} />
        
        {album.status !== 'present' && (
          <button
            onClick={() => onMarkOwned(album.mbReleaseGroupId)}
            className="p-1.5 bg-green-700/30 hover:bg-green-700/50 text-green-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="Mark as owned"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        
        {album.status === 'present' && (
          <button
            onClick={() => onMarkMissing(album.mbReleaseGroupId)}
            className="p-1.5 bg-red-700/30 hover:bg-red-700/50 text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="Mark as not owned"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

// Artist row component
interface ArtistRowProps {
  artist: ArtistEntry;
  currentColors: ColorScheme;
  onSelect: () => void;
  isSelected: boolean;
}

const ArtistRow = ({ artist, currentColors, onSelect, isSelected }: ArtistRowProps) => {
  const discography = artist.discography;
  const missingCount = (discography?.missing as number) || 0;

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
        isSelected ? `${currentColors.primary}/30 border border-${currentColors.primary}` : 'hover:bg-slate-800/50'
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
        <Users className={`w-5 h-5 ${currentColors.accent}`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="text-white text-sm font-medium truncate">{artist.name}</h4>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{artist.localAlbumCount} album{artist.localAlbumCount !== 1 ? 's' : ''} in library</span>
          {artist.isResolved && (
            <span className="text-green-400 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Matched
            </span>
          )}
        </div>
      </div>

      {missingCount > 0 && (
        <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">
          {missingCount} missing
        </span>
      )}

      <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
    </div>
  );
};

// Settings panel component
interface SettingsPanelProps {
  config: DiscographyConfig;
  setConfig: (config: Partial<DiscographyConfig>) => void;
  currentColors: ColorScheme;
}

const SettingsPanel = ({ config, setConfig, currentColors }: SettingsPanelProps) => {
  return (
    <div className="p-4 bg-slate-800/50 rounded-lg space-y-3">
      <h4 className="text-white text-sm font-medium flex items-center gap-2">
        <Settings className="w-4 h-4" />
        Discography Options
      </h4>
      
      <div className="grid grid-cols-2 gap-3 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.includeEPs}
            onChange={(e) => setConfig({ includeEPs: e.target.checked })}
            className="rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
          />
          <span className="text-slate-300">Include EPs</span>
        </label>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.includeLive}
            onChange={(e) => setConfig({ includeLive: e.target.checked })}
            className="rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
          />
          <span className="text-slate-300">Include Live Albums</span>
        </label>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.includeCompilations}
            onChange={(e) => setConfig({ includeCompilations: e.target.checked })}
            className="rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
          />
          <span className="text-slate-300">Include Compilations</span>
        </label>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.includeBootlegs}
            onChange={(e) => setConfig({ includeBootlegs: e.target.checked })}
            className="rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
          />
          <span className="text-slate-300">Include Bootlegs</span>
        </label>
      </div>
    </div>
  );
};

// Main discography window component
export function DiscographyWindow() {
  const { library } = usePlayerContext();
  const tracks = library.tracks;
  const currentColors = useCurrentColors();

  const {
    artistList,
    stats,
    selectedArtistMbid,
    selectedDiscography,
    searchResults,
    isSearching,
    loading,
    progress,
    error,
    config,
    searchArtist,
    resolveArtist,
    fetchArtistDiscography,
    reResolveArtist,
    reResolveAllArtists,
    autoResolveAllArtists,
    fetchAllDiscographies,
    cancelOperation,
    setSelectedArtistMbid,
    setConfig,
    getCoverArtUrl,
    markAlbumAsOwned,
    markAlbumAsMissing,
    clearAllData,
  } = useDiscography(tracks);

  const [view, setView] = useState<'artists' | 'discography' | 'search'>('artists');
  const [searchQuery, setSearchQuery] = useState('');
  const [artistFilter, setArtistFilter] = useState<'all' | 'resolved' | 'unresolved' | 'missing'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [manualSearchArtist, setManualSearchArtist] = useState<ArtistEntry | null>(null);

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) return;
    
    const timer = setTimeout(() => {
      searchArtist(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchArtist]);

  // Filter artists
  const filteredArtists = artistList.filter((artist) => {
    switch (artistFilter) {
      case 'resolved':
        return artist.isResolved;
      case 'unresolved':
        return !artist.isResolved;
      case 'missing':
        return artist.hasMissingAlbums;
      default:
        return true;
    }
  });

  // Handle artist selection
  const handleSelectArtist = useCallback((artist: ArtistEntry) => {
    if (artist.isResolved && artist.mbArtist) {
      setSelectedArtistMbid(artist.mbArtist.id);
      if (!artist.discography) {
        fetchArtistDiscography(artist.name, artist.mbArtist.id);
      }
      setView('discography');
    } else {
      // Open search for unresolved artist
      setManualSearchArtist(artist);
      setSearchQuery(artist.name);
      setView('search');
    }
  }, [setSelectedArtistMbid, fetchArtistDiscography]);

  // Handle search result selection
  const handleSelectSearchResult = useCallback(async (mbArtist: MBArtistResult) => {
    if (!manualSearchArtist) return;
    
    await resolveArtist(manualSearchArtist.name, mbArtist as unknown as ResolvedArtist);
    setSelectedArtistMbid(mbArtist.id);
    setView('discography');
    setManualSearchArtist(null);
    setSearchQuery('');
  }, [manualSearchArtist, resolveArtist, setSelectedArtistMbid]);

  // Back to artists list
  const handleBack = useCallback(() => {
    setView('artists');
    setSelectedArtistMbid(null);
    setManualSearchArtist(null);
    setSearchQuery('');
  }, [setSelectedArtistMbid]);

  // Export all missing albums from all artists
  const handleExportAllMissing = useCallback(async () => {
    const allArtistsData: AllArtistExport[] = (artistList as ArtistEntry[])
      .filter((artist: ArtistEntry) => artist.discography?.albums?.some((a) => a.status === 'missing'))
      .map((artist: ArtistEntry) => ({
        artistName: artist.name,
        albums: artist.discography!.albums as unknown as AlbumMatch[],
      }));
    
    if (allArtistsData.length === 0) {
      await nativeAlert('No missing albums found. Fetch discographies first.');
      return;
    }
    
    await exportMissingAlbums(null, null, allArtistsData);
  }, [artistList]);

  // Render artist list view
  const renderArtistList = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Music className={`w-5 h-5 ${currentColors.accent}`} />
          <h3 className="text-white font-semibold">Discography Matching</h3>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded transition-colors ${
              showSettings ? currentColors.primary + ' text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={handleExportAllMissing}
            disabled={loading || stats.totalMissing === 0}
            className="p-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded transition-colors disabled:opacity-50"
            title="Export all missing albums to file"
          >
            <FileText className="w-4 h-4" />
          </button>
          
          <button
            onClick={autoResolveAllArtists}
            disabled={loading}
            className="px-3 py-1.5 bg-blue-700 text-white text-xs rounded hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-1"
            title="Auto-match all unresolved artists"
          >
            <Download className="w-3.5 h-3.5" />
            Auto-Match
          </button>

          <button
            onClick={reResolveAllArtists}
            disabled={loading || stats.resolvedCount === 0}
            className="px-3 py-1.5 bg-orange-700 text-white text-xs rounded hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-1"
            title="Re-match all resolved artists using album verification (fixes wrong matches)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Re-Match All
          </button>
          
          <button
            onClick={fetchAllDiscographies}
            disabled={loading}
            className={`px-3 py-1.5 ${currentColors.primary} text-white text-xs rounded hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1`}
            title="Fetch all discographies"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Fetch All
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel config={config} setConfig={setConfig} currentColors={currentColors} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <div className="text-lg font-bold text-white">{stats.totalArtists}</div>
          <div className="text-xs text-slate-400">Artists</div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <div className="text-lg font-bold text-green-400">{stats.resolvedCount}</div>
          <div className="text-xs text-slate-400">Matched</div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <div className="text-lg font-bold text-red-400">{stats.totalMissing}</div>
          <div className="text-xs text-slate-400">Missing</div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <div className="text-lg font-bold text-yellow-400">{stats.totalUncertain}</div>
          <div className="text-xs text-slate-400">Uncertain</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(['all', 'resolved', 'unresolved', 'missing'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setArtistFilter(filter)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              artistFilter === filter
                ? `${currentColors.primary} text-white`
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
            {filter === 'all' && ` (${artistList.length})`}
            {filter === 'resolved' && ` (${stats.resolvedCount})`}
            {filter === 'unresolved' && ` (${stats.totalArtists - stats.resolvedCount})`}
            {filter === 'missing' && ` (${stats.artistsWithMissing})`}
          </button>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-700/50 rounded flex items-center gap-2 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {String(error)}
        </div>
      )}

      {/* Loading Progress */}
      {loading && progress.total > 0 && (
        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-300 text-sm">
              Processing: {progress.artist}
            </span>
            <span className="text-blue-400 text-xs">
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <button
            onClick={cancelOperation}
            className="mt-2 text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Artist List */}
      <div className="flex-1 overflow-auto space-y-1">
        {filteredArtists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Users className="w-12 h-12 mb-3 opacity-50" />
            <p>No artists found</p>
            <p className="text-sm text-slate-500">Add music to your library first</p>
          </div>
        ) : (
          filteredArtists.map((artist) => (
            <ArtistRow
              key={artist.normalizedName}
              artist={artist as ArtistEntry}
              currentColors={currentColors}
              onSelect={() => handleSelectArtist(artist as ArtistEntry)}
              isSelected={artist.mbArtist?.id === selectedArtistMbid}
            />
          ))
        )}
      </div>
    </>
  );

  // Render discography view
  const renderDiscography = () => {
    if (!selectedDiscography) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400">
          <Loader className="w-8 h-8 animate-spin mb-3" />
          <p>Loading discography...</p>
        </div>
      );
    }

    const albums = (selectedDiscography.albums || []) as unknown as AlbumMatch[];
    const missingAlbums = albums.filter((a: AlbumMatch) => a.status === 'missing');
    const presentAlbums = albums.filter((a: AlbumMatch) => a.status === 'present');
    const uncertainAlbums = albums.filter((a: AlbumMatch) => a.status === 'uncertain');

    return (
      <>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={handleBack}
            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          
          <div className="flex-1">
            <h3 className="text-white font-semibold">{String(selectedDiscography.artistName ?? '')}</h3>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{albums.length} albums</span>
              <span className="text-green-400">{presentAlbums.length} owned</span>
              <span className="text-red-400">{missingAlbums.length} missing</span>
              {uncertainAlbums.length > 0 && (
                <span className="text-yellow-400">{uncertainAlbums.length} uncertain</span>
              )}
            </div>
          </div>

          <button
            onClick={() => reResolveArtist(String(selectedDiscography.artistName ?? ''))}
            disabled={loading}
            className="p-1.5 bg-orange-700/50 hover:bg-orange-700 rounded transition-colors"
            title="Re-match with album verification (fixes wrong artist matches)"
          >
            <RefreshCw className={`w-4 h-4 text-orange-300 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => exportMissingAlbums(String(selectedDiscography.artistName ?? ''), albums)}
            disabled={missingAlbums.length === 0}
            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded transition-colors disabled:opacity-50"
            title="Export missing albums to file"
          >
            <FileText className="w-4 h-4 text-white" />
          </button>

          <a
            href={`https://musicbrainz.org/artist/${selectedArtistMbid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            title="View on MusicBrainz"
          >
            <ExternalLink className="w-4 h-4 text-white" />
          </a>
        </div>

        {/* Missing Albums Badge */}
        {missingAlbums.length > 0 && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-700/50 rounded flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-red-300 text-sm">
              You're missing <strong>{missingAlbums.length}</strong> album{missingAlbums.length !== 1 ? 's' : ''} from this artist
            </span>
          </div>
        )}

        {/* Albums List */}
        <div className="flex-1 overflow-auto space-y-2">
          {albums.map((album) => (
            <AlbumCard
              key={album.mbReleaseGroupId}
              album={album}
              currentColors={currentColors}
              getCoverArtUrl={getCoverArtUrl}
              onMarkOwned={(id: string) => markAlbumAsOwned(selectedArtistMbid!, id)}
              onMarkMissing={(id: string) => markAlbumAsMissing(selectedArtistMbid!, id)}
            />
          ))}
        </div>
      </>
    );
  };

  // Render search view
  const renderSearch = () => (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        
        <div className="flex-1">
          <h3 className="text-white font-semibold">
            Match Artist: {manualSearchArtist?.name ?? ''}
          </h3>
          <p className="text-xs text-slate-400">
            Select the correct MusicBrainz artist
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search MusicBrainz..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
        {isSearching && (
          <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
        )}
      </div>

      {/* Search Results */}
      <div className="flex-1 overflow-auto space-y-2">
        {searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            {isSearching ? (
              <>
                <Loader className="w-8 h-8 animate-spin mb-2" />
                <p className="text-sm">Searching MusicBrainz...</p>
              </>
            ) : (
              <>
                <Search className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">Enter artist name to search</p>
              </>
            )}
          </div>
        ) : (
          searchResults.map((result) => (
            <div
              key={result.id}
              onClick={() => handleSelectSearchResult(result)}
              className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-slate-400" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className="text-white text-sm font-medium">{result.name}</h4>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {result.type && <span>{result.type}</span>}
                  {result.country && <span>• {result.country}</span>}
                  {result.disambiguation && (
                    <span className="text-slate-500">• {result.disambiguation}</span>
                  )}
                </div>
              </div>
              
              <div className="text-xs text-slate-500">
                {result.score}% match
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full">
      {view === 'artists' && renderArtistList()}
      {view === 'discography' && renderDiscography()}
      {view === 'search' && renderSearch()}
    </div>
  );
}
