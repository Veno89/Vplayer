import React from 'react';
import { formatDuration } from '../utils/formatters';

export const Row = React.memo(({ data, index, style }) => {
  const { tracks, currentTrack, onSelect, currentColors, loadingTrackIndex } = data;
  const track = tracks[index];
  const isActive = index === currentTrack;
  return (
    <div
      style={style}
      className={`flex items-center px-2 py-1 text-sm cursor-pointer select-none transition-colors ${isActive ? currentColors.accent + ' bg-slate-800/80 font-bold' : 'hover:bg-slate-700/60'} ${loadingTrackIndex === index ? 'opacity-50' : ''}`}
      onClick={() => onSelect(index)}
      title={track ? `${track.title} - ${track.artist}` : ''}
    >
      <span className="w-6 text-center">{index + 1}</span>
      <span className="flex-1 truncate">{track ? track.title : 'Unknown'}</span>
      <span className="w-32 truncate">{track ? track.artist : ''}</span>
      <span className="w-20 truncate">{track ? track.album : ''}</span>
      <span className="w-12 text-right">{track && track.duration ? formatDuration(track.duration) : ''}</span>
    </div>
  );
});
