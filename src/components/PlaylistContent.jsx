import React from 'react';
import { List } from 'lucide-react';
import { FixedSizeList as ListVirtual } from 'react-window';
import { Row } from './Row';

export const PlaylistContent = React.memo(({ tracks, currentTrack, setCurrentTrack, currentColors, loadingTrackIndex, onRatingChange }) => {
  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <List className="w-12 h-12 text-slate-600 mb-3" />
        <p className="text-slate-400 text-sm mb-2">No music in library</p>
        <p className="text-slate-500 text-xs mb-4">Add folders to your library to see tracks here</p>
      </div>
    );
  }

  // Don't memoize - just create inline
  const itemData = { tracks, currentTrack, onSelect: setCurrentTrack, currentColors, loadingTrackIndex, onRatingChange };
  const itemSize = 64;
  const listHeight = Math.min(tracks.length * itemSize, 400);

  return (
    <ListVirtual
      height={listHeight}
      itemCount={tracks.length}
      itemSize={itemSize}
      width={"100%"}
      itemData={itemData}
    >
      {Row}
    </ListVirtual>
  );
});