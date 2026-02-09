import React, { useMemo, useState, useEffect } from 'react';
import { Sparkles, Play, Calendar, TrendingUp, Music, type LucideIcon } from 'lucide-react';
import { SimpleTrackList } from '../components/TrackList';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { usePlayerContext } from '../context/PlayerProvider';
import type { Track } from '../types';
import type { ColorScheme } from '../store/types';

interface SmartPlaylist {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  filter: ((track: Track) => boolean) | null;
  sort?: (a: Track, b: Track) => number;
  limit?: number;
}

interface PlaylistTrackWithIndex extends Track {
  originalIndex: number;
}

export function SmartPlaylistsWindow() {
  const { library } = usePlayerContext();
  const tracks: Track[] = library.tracks;
  const currentColors = useCurrentColors();
  const setCurrentTrack = useStore(s => s.setCurrentTrack);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SmartPlaylist | null>(null);

  // Define smart playlist rules
  const smartPlaylists = useMemo((): SmartPlaylist[] => {
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);

    return [
      {
        id: 'recently-added',
        name: 'Recently Added',
        description: 'Tracks added in the last 7 days',
        icon: Calendar,
        color: 'text-blue-400',
        filter: (track: Track) => {
          const addedDate = track.date_added ? new Date(track.date_added).getTime() : 0;
          return addedDate > oneWeekAgo;
        }
      },
      {
        id: 'most-played',
        name: 'Most Played',
        description: 'Your top 50 most played tracks',
        icon: TrendingUp,
        color: 'text-purple-400',
        filter: null,
        sort: (a: Track, b: Track) => (b.play_count || 0) - (a.play_count || 0),
        limit: 50
      },
      {
        id: 'recently-played',
        name: 'Recently Played',
        description: 'Tracks played in the last 30 days',
        icon: Music,
        color: 'text-cyan-400',
        filter: (track: Track) => {
          const lastPlayed = track.last_played ? new Date(track.last_played).getTime() : 0;
          return lastPlayed > oneMonthAgo;
        },
        sort: (a: Track, b: Track) => {
          const aTime = a.last_played ? new Date(a.last_played).getTime() : 0;
          const bTime = b.last_played ? new Date(b.last_played).getTime() : 0;
          return bTime - aTime;
        }
      },
      {
        id: 'never-played',
        name: 'Never Played',
        description: 'Tracks you haven\'t listened to yet',
        icon: Sparkles,
        color: 'text-amber-400',
        filter: (track: Track) => !track.play_count || track.play_count === 0
      }
    ];
  }, []);

  // Generate track list for selected playlist
  const playlistTracks = useMemo((): PlaylistTrackWithIndex[] => {
    if (!selectedPlaylist) return [];

    let filtered = [...tracks];

    // Apply filter if exists
    if (selectedPlaylist.filter) {
      filtered = filtered.filter(selectedPlaylist.filter);
    }

    // Apply sort if exists
    if (selectedPlaylist.sort) {
      filtered.sort(selectedPlaylist.sort);
    }

    // Apply limit if exists
    if (selectedPlaylist.limit) {
      filtered = filtered.slice(0, selectedPlaylist.limit);
    }

    // Add original index for playback
    return filtered.map((track, idx) => ({
      ...track,
      originalIndex: tracks.indexOf(track)
    }));
  }, [selectedPlaylist, tracks]);

  const handlePlaylistClick = (playlist: SmartPlaylist) => {
    setSelectedPlaylist(playlist);
  };

  const handleBackToList = () => {
    setSelectedPlaylist(null);
  };

  const handleTrackClick = (track: PlaylistTrackWithIndex) => {
    setCurrentTrack(track.originalIndex);
  };

  const formatTrackDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string | number | null | undefined): string => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  if (selectedPlaylist) {
    // Track list view for selected smart playlist
    const Icon = selectedPlaylist.icon;
    
    return (
      <div className="flex flex-col h-full">
        {/* Playlist Header */}
        <div className="mb-4 pb-4 border-b border-slate-700">
          <button
            onClick={handleBackToList}
            onMouseDown={e => e.stopPropagation()}
            className="mb-3 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            ← Back to Smart Playlists
          </button>
          
          <div className="flex items-start gap-4">
            <div className={`w-20 h-20 rounded-lg ${currentColors.primary} bg-opacity-20 flex items-center justify-center`}>
              <Icon className={`w-10 h-10 ${selectedPlaylist.color}`} />
            </div>
            
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-1">
                {selectedPlaylist.name}
              </h2>
              <p className="text-slate-400 text-sm mb-2">
                {selectedPlaylist.description}
              </p>
              <div className="text-xs text-slate-500">
                {playlistTracks.length} tracks
              </div>
            </div>
          </div>
        </div>

        {/* Track List */}
        <div className="flex-1 overflow-auto">
          {playlistTracks.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              No tracks match this playlist criteria
            </div>
          ) : (
            <SimpleTrackList
              tracks={playlistTracks}
              currentTrack={-1}
              onSelect={(index: number) => handleTrackClick(playlistTracks[index])}
              currentColors={currentColors}
              loadingTrackIndex={null}
              showAlbum={false}
              showRating={false}
            />
          )}
        </div>
      </div>
    );
  }

  // Smart playlists grid view
  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className={`w-5 h-5 ${currentColors.accent}`} />
        <h3 className="text-white font-semibold">Smart Playlists</h3>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {smartPlaylists.map((playlist: SmartPlaylist) => {
            const Icon = playlist.icon;
            const trackCount = playlist.filter 
              ? tracks.filter(playlist.filter).length 
              : (playlist.sort ? Math.min(tracks.length, playlist.limit || tracks.length) : tracks.length);

            return (
              <div
                key={playlist.id}
                onClick={() => handlePlaylistClick(playlist)}
                onMouseDown={e => e.stopPropagation()}
                className="group cursor-pointer p-4 rounded-lg bg-slate-800/30 border border-slate-700 hover:border-slate-600 hover:bg-slate-800/50 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-16 h-16 rounded-lg ${currentColors.primary} bg-opacity-20 flex items-center justify-center flex-shrink-0 group-hover:bg-opacity-30 transition-all`}>
                    <Icon className={`w-8 h-8 ${playlist.color}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium mb-1 group-hover:text-cyan-300 transition-colors">
                      {playlist.name}
                    </h4>
                    <p className="text-slate-400 text-sm mb-2 line-clamp-2">
                      {playlist.description}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {trackCount} tracks
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
