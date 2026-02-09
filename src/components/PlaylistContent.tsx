import React from 'react';
import { List } from 'lucide-react';
import { TrackList } from './TrackList';
import type { Track } from '../types';
import type { ColorScheme } from '../store/types';

interface PlaylistContentProps {
  tracks: Track[];
  currentTrack: number | null;
  setCurrentTrack: (index: number | null) => void;
  currentColors: ColorScheme;
  loadingTrackIndex: number | null;
  onRatingChange?: (trackId: string, rating: number) => void;
}

export const PlaylistContent = React.memo(({ tracks, currentTrack, setCurrentTrack, currentColors, loadingTrackIndex, onRatingChange }: PlaylistContentProps) => {
  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <List className="w-12 h-12 text-slate-600 mb-3" />
        <p className="text-slate-400 text-sm mb-2">No music in library</p>
        <p className="text-slate-500 text-xs mb-4">Add folders to your library to see tracks here</p>
      </div>
    );
  }

  return (
    <TrackList
      tracks={tracks}
      currentTrack={currentTrack}
      onSelect={setCurrentTrack}
      currentColors={currentColors}
      loadingTrackIndex={loadingTrackIndex}
      onRatingChange={onRatingChange}
      showRating={true}
      height={Math.min(tracks.length * 64, 400)}
      itemSize={64}
    />
  );
});