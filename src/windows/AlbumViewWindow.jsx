import React, { useMemo, useState } from 'react';
import { Music, Play, Disc } from 'lucide-react';

export function AlbumViewWindow({ tracks, currentColors, setCurrentTrack }) {
  const [selectedAlbum, setSelectedAlbum] = useState(null);

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

  const handleAlbumClick = (album) => {
    setSelectedAlbum(album);
  };

  const handleBackToGrid = () => {
    setSelectedAlbum(null);
  };

  const handleTrackClick = (track) => {
    setCurrentTrack(track.originalIndex);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
            className="mb-3 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            ← Back to Albums
          </button>
          
          <div className="flex items-start gap-4">
            <div className={`w-24 h-24 rounded-lg ${currentColors.primary} bg-opacity-20 flex items-center justify-center`}>
              <Disc className={`w-12 h-12 ${currentColors.accent}`} />
            </div>
            
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
            </div>
          </div>
        </div>

        {/* Track List */}
        <div className="flex-1 overflow-auto space-y-1">
          {selectedAlbum.tracks.map((track, idx) => (
            <div
              key={idx}
              onClick={() => handleTrackClick(track)}
              onMouseDown={e => e.stopPropagation()}
              className="flex items-center gap-3 p-2 rounded hover:bg-slate-800/50 cursor-pointer transition-colors group"
            >
              <div className="w-8 text-center">
                <span className="text-slate-500 text-sm group-hover:hidden">
                  {idx + 1}
                </span>
                <Play className={`w-4 h-4 ${currentColors.accent} hidden group-hover:block mx-auto`} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm truncate">
                  {track.title || track.name || 'Unknown'}
                </div>
              </div>
              
              <div className="text-slate-500 text-sm">
                {formatDuration(track.duration || 0)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Album grid view
  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Disc className={`w-5 h-5 ${currentColors.accent}`} />
          <h3 className="text-white font-semibold">Albums</h3>
          <span className="text-slate-500 text-sm">
            ({albumsMap.length} albums)
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {albumsMap.map((album, idx) => (
            <div
              key={idx}
              onClick={() => handleAlbumClick(album)}
              onMouseDown={e => e.stopPropagation()}
              className="group cursor-pointer"
            >
              <div className={`aspect-square rounded-lg ${currentColors.primary} bg-opacity-20 flex items-center justify-center mb-2 group-hover:bg-opacity-30 transition-all relative overflow-hidden`}>
                <Disc className={`w-16 h-16 ${currentColors.accent} opacity-50 group-hover:opacity-100 transition-opacity`} />
                
                {/* Play overlay on hover */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center transition-all">
                  <Play className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              
              <div>
                <h4 className="text-white text-sm font-medium truncate mb-1">
                  {album.album}
                </h4>
                <p className="text-slate-400 text-xs truncate mb-1">
                  {album.artist}
                </p>
                <p className="text-slate-500 text-xs">
                  {album.tracks.length} tracks
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
