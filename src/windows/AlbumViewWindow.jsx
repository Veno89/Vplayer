import React, { useMemo, useState, useCallback } from 'react';
import { Music, Play, Disc, Grid, List as ListIcon, Search, X } from 'lucide-react';
import { SimpleTrackList } from '../components/TrackList';
import { formatDuration } from '../utils/formatters';
import { AlbumArt } from '../components/AlbumArt';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';

export function AlbumViewWindow() {
  const tracks = useStore(s => s.tracks);
  const currentColors = useCurrentColors();
  const setCurrentTrack = useStore(s => s.setCurrentTrack);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [gridSize, setGridSize] = useState('medium'); // 'small', 'medium', 'large'

  // Grid size configurations
  const gridSizes = {
    small: 'grid-cols-4 md:grid-cols-5 lg:grid-cols-6',
    medium: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    large: 'grid-cols-2 md:grid-cols-2 lg:grid-cols-3',
  };

  const albumSizes = {
    small: 'w-full aspect-square',
    medium: 'w-full aspect-square',
    large: 'w-full aspect-square',
  };

  // Group tracks by album
  const albumsMap = useMemo(() => {
    const map = new Map();
    
    tracks.forEach((track, index) => {
      const albumName = track.album || 'Unknown Album';
      const artist = track.artist || 'Unknown Artist';
      const key = `${albumName}::${artist}`;
      
      if (!map.has(key)) {
        map.set(key, {
          album: albumName,
          artist: artist,
          tracks: [],
          duration: 0,
          coverTrackId: track.id, // Use first track's ID for album art
          coverTrackPath: track.path,
        });
      }
      
      const albumData = map.get(key);
      albumData.tracks.push({ ...track, originalIndex: index });
      albumData.duration += track.duration || 0;
    });
    
    return Array.from(map.values()).sort((a, b) => 
      a.album.localeCompare(b.album)
    );
  }, [tracks]);

  // Filter albums by search
  const filteredAlbums = useMemo(() => {
    if (!searchQuery.trim()) return albumsMap;
    const query = searchQuery.toLowerCase();
    return albumsMap.filter(album => 
      album.album.toLowerCase().includes(query) ||
      album.artist.toLowerCase().includes(query)
    );
  }, [albumsMap, searchQuery]);

  const handleAlbumClick = (album) => {
    setSelectedAlbum(album);
  };

  const handleBackToGrid = () => {
    setSelectedAlbum(null);
  };

  const handleTrackClick = (track) => {
    setCurrentTrack(track.originalIndex);
  };

  const handlePlayAlbum = useCallback((album, e) => {
    e?.stopPropagation();
    if (album.tracks.length > 0) {
      setCurrentTrack(album.tracks[0].originalIndex);
    }
  }, [setCurrentTrack]);

  const formatAlbumDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (selectedAlbum) {
    // Track list view for selected album
    return (
      <div className="flex flex-col h-full">
        {/* Album Header */}
        <div className="mb-4 pb-4 border-b border-slate-700">
          <button
            onClick={handleBackToGrid}
            onMouseDown={e => e.stopPropagation()}
            className={`mb-3 text-sm ${currentColors.accent} hover:opacity-80 transition-colors`}
          >
            ← Back to Albums
          </button>
          
          <div className="flex items-start gap-4">
            <AlbumArt
              trackId={selectedAlbum.coverTrackId}
              trackPath={selectedAlbum.coverTrackPath}
              size="large"
              className="w-24 h-24 rounded-lg shadow-lg"
            />
            
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-1">
                {selectedAlbum.album}
              </h2>
              <p className="text-slate-400 text-sm mb-2">
                {selectedAlbum.artist}
              </p>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>{selectedAlbum.tracks.length} tracks</span>
                <span>{formatAlbumDuration(selectedAlbum.duration)}</span>
              </div>
              
              <button
                onClick={(e) => handlePlayAlbum(selectedAlbum, e)}
                onMouseDown={e => e.stopPropagation()}
                className={`mt-3 px-4 py-1.5 ${currentColors.primary} text-white text-sm rounded-full flex items-center gap-2 hover:opacity-90 transition-opacity`}
              >
                <Play className="w-4 h-4" />
                Play Album
              </button>
            </div>
          </div>
        </div>

        {/* Track List */}
        <div className="flex-1 overflow-auto">
          <SimpleTrackList
            tracks={selectedAlbum.tracks}
            currentTrack={-1}
            onSelect={handleTrackClick}
            currentColors={currentColors}
            showArtist={false}
            showAlbum={false}
            showRating={false}
          />
        </div>
      </div>
    );
  }

  // Album grid view
  return (
    <div className="flex flex-col h-full">
      {/* Header with controls */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Disc className={`w-5 h-5 ${currentColors.accent}`} />
            <h3 className="text-white font-semibold">Albums</h3>
            <span className="text-slate-500 text-sm">
              ({filteredAlbums.length} of {albumsMap.length})
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Grid size toggle */}
            <div className="flex bg-slate-800 rounded-lg p-0.5">
              {['small', 'medium', 'large'].map(size => (
                <button
                  key={size}
                  onClick={() => setGridSize(size)}
                  onMouseDown={e => e.stopPropagation()}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    gridSize === size 
                      ? `${currentColors.primary} text-white` 
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={`${size.charAt(0).toUpperCase() + size.slice(1)} grid`}
                >
                  {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
                </button>
              ))}
            </div>
            
            {/* View mode toggle */}
            <div className="flex bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                onMouseDown={e => e.stopPropagation()}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'grid' ? currentColors.accent : 'text-slate-400 hover:text-white'
                }`}
                title="Grid view"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                onMouseDown={e => e.stopPropagation()}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'list' ? currentColors.accent : 'text-slate-400 hover:text-white'
                }`}
                title="List view"
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search albums or artists..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-10 pr-8 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            onMouseDown={e => e.stopPropagation()}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              onMouseDown={e => e.stopPropagation()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {viewMode === 'grid' ? (
          <div className={`grid ${gridSizes[gridSize]} gap-4`}>
            {filteredAlbums.map((album, idx) => (
              <div
                key={idx}
                onClick={() => handleAlbumClick(album)}
                onMouseDown={e => e.stopPropagation()}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  const albumTracksData = album.tracks.map(t => ({
                    id: t.id,
                    path: t.path,
                    title: t.title || t.name,
                    artist: t.artist,
                    album: t.album
                  }));
                  e.dataTransfer.setData('application/json', JSON.stringify(albumTracksData));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="group cursor-pointer"
              >
                <div className={`${albumSizes[gridSize]} rounded-lg overflow-hidden mb-2 relative bg-slate-800`}>
                  <AlbumArt
                    trackId={album.coverTrackId}
                    trackPath={album.coverTrackPath}
                    size="large"
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Play overlay on hover */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center transition-all">
                    <button
                      onClick={(e) => handlePlayAlbum(album, e)}
                      onMouseDown={e => e.stopPropagation()}
                      className={`w-12 h-12 rounded-full ${currentColors.primary} flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform scale-75 group-hover:scale-100 shadow-lg`}
                    >
                      <Play className="w-6 h-6 text-white ml-1" />
                    </button>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-white text-sm font-medium truncate mb-0.5" title={album.album}>
                    {album.album}
                  </h4>
                  <p className="text-slate-400 text-xs truncate mb-0.5" title={album.artist}>
                    {album.artist}
                  </p>
                  <p className="text-slate-500 text-xs">
                    {album.tracks.length} tracks
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List view */
          <div className="space-y-1">
            {filteredAlbums.map((album, idx) => (
              <div
                key={idx}
                onClick={() => handleAlbumClick(album)}
                onMouseDown={e => e.stopPropagation()}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  const albumTracksData = album.tracks.map(t => ({
                    id: t.id,
                    path: t.path,
                    title: t.title || t.name,
                    artist: t.artist,
                    album: t.album
                  }));
                  e.dataTransfer.setData('application/json', JSON.stringify(albumTracksData));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="group flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors"
              >
                <AlbumArt
                  trackId={album.coverTrackId}
                  trackPath={album.coverTrackPath}
                  size="small"
                  className="w-12 h-12 rounded shadow"
                />
                
                <div className="flex-1 min-w-0">
                  <h4 className="text-white text-sm font-medium truncate">{album.album}</h4>
                  <p className="text-slate-400 text-xs truncate">{album.artist}</p>
                </div>
                
                <div className="text-right text-xs text-slate-500">
                  <div>{album.tracks.length} tracks</div>
                  <div>{formatAlbumDuration(album.duration)}</div>
                </div>
                
                <button
                  onClick={(e) => handlePlayAlbum(album, e)}
                  onMouseDown={e => e.stopPropagation()}
                  className={`p-2 rounded-full ${currentColors.primary} text-white opacity-0 group-hover:opacity-100 transition-opacity`}
                >
                  <Play className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {filteredAlbums.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Search className="w-12 h-12 mb-3 opacity-50" />
            <p>No albums found</p>
            <p className="text-sm text-slate-500">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );
}
