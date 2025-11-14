import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { formatDuration } from '../utils/formatters';
import { StarRating } from './StarRating';
import { AlbumArt } from './AlbumArt';
import { ContextMenu, getTrackContextMenuItems } from './ContextMenu';

export const Row = React.memo(({ data, index, style }) => {
  const { tracks, currentTrack, onSelect, currentColors, loadingTrackIndex, onRatingChange, onTrackAction } = data;
  const track = tracks[index];
  const isActive = index === currentTrack;
  const [contextMenu, setContextMenu] = React.useState(null);
  
  const handleRatingChange = async (newRating) => {
    try {
      await invoke('set_track_rating', { trackId: track.id, rating: newRating });
      if (onRatingChange) {
        onRatingChange(track.id, newRating);
      }
    } catch (err) {
      console.error('Failed to set rating:', err);
    }
  };
  
  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!track) return;
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };
  
  return (
    <>
      <div
        style={style}
        className={`flex items-center px-2 py-1 text-sm cursor-pointer select-none transition-colors ${isActive ? currentColors.accent + ' bg-slate-800/80 font-bold' : 'hover:bg-slate-700/60'} ${loadingTrackIndex === index ? 'opacity-50' : ''}`}
        onClick={() => onSelect(index)}
        onContextMenu={handleContextMenu}
        title={track ? `${track.title} - ${track.artist}` : ''}
      >
      <span className="w-6 text-center">{index + 1}</span>
      <div className="w-8 mr-2">
        {track && <AlbumArt trackId={track.id} trackPath={track.path} size="small" />}
      </div>
      <span className="flex-1 truncate">{track ? track.title : 'Unknown'}</span>
      <span className="w-32 truncate">{track ? track.artist : ''}</span>
      <span className="w-20 truncate">{track ? track.album : ''}</span>
      <span className="w-16 flex justify-center" onClick={(e) => e.stopPropagation()}>
        {track && <StarRating rating={track.rating || 0} onRatingChange={handleRatingChange} size="sm" />}
      </span>
      <span className="w-12 text-right">{track && track.duration ? formatDuration(track.duration) : ''}</span>
    </div>
    
    {contextMenu && (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        items={getTrackContextMenuItems({
          track,
          onPlay: () => onSelect(index),
          onAddToQueue: () => onTrackAction?.('addToQueue', track),
          onAddToPlaylist: () => onTrackAction?.('addToPlaylist', track),
          onRemove: () => onTrackAction?.('remove', track),
          onEditTags: () => onTrackAction?.('editTags', track),
          onShowInfo: () => onTrackAction?.('showInfo', track),
          onSetRating: () => onTrackAction?.('setRating', track),
          currentTrack: isActive,
        })}
        onClose={() => setContextMenu(null)}
      />
    )}
  </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  const prevTrack = prevProps.data.tracks[prevProps.index];
  const nextTrack = nextProps.data.tracks[nextProps.index];
  
  return (
    prevProps.index === nextProps.index &&
    prevProps.style === nextProps.style &&
    prevTrack?.id === nextTrack?.id &&
    prevProps.data.currentTrack === nextProps.data.currentTrack &&
    prevProps.data.loadingTrackIndex === nextProps.data.loadingTrackIndex &&
    prevTrack?.rating === nextTrack?.rating
  );
});
