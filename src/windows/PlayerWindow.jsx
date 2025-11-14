import React from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Music, Shuffle, Repeat, Settings, Loader } from 'lucide-react';
import { formatDuration } from '../utils/formatters';

export function PlayerWindow({
  currentTrack,
  tracks,
  playing,
  progress,
  duration,
  volume,
  setVolume,
  currentColors,
  togglePlay,
  nextTrack,
  prevTrack,
  setShuffle,
  shuffle,
  setRepeatMode,
  repeatMode,
  seekToPercent,
  toggleWindow,
  isLoading,
  isMuted,
  toggleMute,
  audioBackendError,
}) {
  const currentTrackData = currentTrack !== null ? tracks[currentTrack] : null;
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const isDisabled = !!audioBackendError; // Disable controls if audio backend has failed

  // Local volume state for slider responsiveness
  const [localVolume, setLocalVolume] = React.useState(volume * 100);

  // Sync local volume with prop
  React.useEffect(() => {
    setLocalVolume(volume * 100);
  }, [volume]);

  // Format time for display
  const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle progress bar click
  const handleProgressClick = (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    seekToPercent(percent);
  };

  // Handle volume change
  const handleVolumeChange = (e) => {
    const newVolume = Number(e.target.value) / 100;
    setVolume(newVolume);
  };

  // Handle volume input (for immediate UI update while dragging)
  const handleVolumeInput = (e) => {
    setLocalVolume(Number(e.target.value));
  };

  // Cycle through repeat modes: off -> all -> one -> off
  const cycleRepeatMode = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Settings Button */}
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          toggleWindow('options');
        }}
        aria-label="Open Settings"
        className="self-end p-2 hover:bg-slate-800 rounded-lg transition-colors"
        title="Settings"
      >
        <Settings className={`w-5 h-5 ${currentColors.accent}`} />
      </button>

      {/* Album Art & Track Info */}
      <div className="flex items-center gap-4">
        <div className={`w-20 h-20 bg-gradient-to-br ${currentColors.primary} rounded-lg flex items-center justify-center shadow-lg relative`}>
          {isLoading ? (
            <Loader className="w-8 h-8 text-white animate-spin" />
          ) : (
            <Music className="w-10 h-10 text-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {currentTrackData ? (
            <>
              <h3 className="text-white font-semibold truncate" title={currentTrackData.title}>
                {currentTrackData.title}
              </h3>
              <p className="text-slate-400 text-sm truncate" title={currentTrackData.artist}>
                {currentTrackData.artist}
              </p>
              <p className="text-slate-500 text-xs truncate" title={currentTrackData.album}>
                {currentTrackData.album}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-white font-semibold">No Track Selected</h3>
              <p className="text-slate-400 text-sm">Add music to your library</p>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div>
        <div 
          className={`w-full bg-slate-800 rounded-full h-2 overflow-hidden transition-all ${
            isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:h-3'
          }`}
          onClick={isDisabled ? undefined : handleProgressClick}
          title={`${formatTime(progress)} / ${formatTime(duration)}`}
        >
          <div 
            className={`h-full bg-gradient-to-r ${currentColors.primary} transition-all`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Shuffle */}
        <button
          onClick={e => { 
            e.stopPropagation(); 
            setShuffle(s => !s); 
          }}
          disabled={isDisabled}
          className={`p-2 rounded-full transition-all ${
            shuffle 
              ? `bg-slate-700 ${currentColors.accent}` 
              : 'hover:bg-slate-800 text-slate-400'
          } ${isDisabled ? 'opacity-30 cursor-not-allowed' : ''}`}
          title={shuffle ? 'Shuffle: On' : 'Shuffle: Off'}
        >
          <Shuffle className="w-4 h-4" />
        </button>

        {/* Previous */}
        <button 
          onClick={e => { 
            e.stopPropagation(); 
            prevTrack(); 
          }}
          disabled={tracks.length === 0 || isDisabled}
          className="p-2 hover:bg-slate-800 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Previous Track"
        >
          <SkipBack className="w-5 h-5 text-slate-400" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={e => { 
            e.stopPropagation(); 
            togglePlay(); 
          }}
          disabled={tracks.length === 0 || currentTrack === null || isDisabled}
          className={`p-4 bg-gradient-to-r ${currentColors.primary} hover:opacity-90 rounded-full transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed`}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <Pause className="w-6 h-6 text-white" />
          ) : (
            <Play className="w-6 h-6 text-white ml-1" />
          )}
        </button>

        {/* Next */}
        <button 
          onClick={e => { 
            e.stopPropagation(); 
            nextTrack(); 
          }}
          disabled={tracks.length === 0 || isDisabled}
          className="p-2 hover:bg-slate-800 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next Track"
        >
          <SkipForward className="w-5 h-5 text-slate-400" />
        </button>

        {/* Repeat */}
        <button
          onClick={e => { 
            e.stopPropagation(); 
            cycleRepeatMode(); 
          }}
          disabled={isDisabled}
          className={`p-2 rounded-full transition-all relative ${
            repeatMode !== 'off' 
              ? `bg-slate-700 ${currentColors.accent}` 
              : 'hover:bg-slate-800 text-slate-400'
          } ${isDisabled ? 'opacity-30 cursor-not-allowed' : ''}`}
          title={
            repeatMode === 'off' ? 'Repeat: Off' :
            repeatMode === 'all' ? 'Repeat: All' :
            'Repeat: One'
          }
        >
          <Repeat className="w-4 h-4" />
          {repeatMode === 'one' && (
            <span className="absolute top-1 right-1 text-[8px] font-bold">1</span>
          )}
        </button>
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-3">
        <button
          onClick={e => {
            e.stopPropagation();
            toggleMute?.();
          }}
          disabled={isDisabled}
          className="p-1 hover:bg-slate-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-5 h-5 text-slate-400" />
          ) : (
            <Volume2 className="w-5 h-5 text-slate-400" />
          )}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={localVolume}
          onInput={handleVolumeInput}
          onChange={handleVolumeChange}
          onMouseDown={e => e.stopPropagation()}
          disabled={isDisabled}
          className="flex-1 h-1 accent-cyan-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          title={`Volume: ${Math.round(localVolume)}%`}
        />
        <span className="text-slate-400 text-sm w-10 text-right">
          {Math.round(localVolume)}%
        </span>
      </div>

      {/* Track Counter */}
      {tracks.length > 0 && (
        <div className="text-center text-slate-500 text-xs">
          Track {currentTrack !== null ? currentTrack + 1 : 0} of {tracks.length}
        </div>
      )}
    </div>
  );
}