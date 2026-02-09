import React, { useState, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Music, Shuffle, Repeat, Settings, Loader, Minimize2, CornerDownLeft, CornerDownRight, X } from 'lucide-react';
import { formatDuration } from '../utils/formatters';
import { AlbumArt } from '../components/AlbumArt';
import { useStore } from '../store/useStore';
import { usePlayerContext } from '../context/PlayerProvider';
import { useCurrentColors } from '../hooks/useStoreHooks';

export function PlayerWindow() {
  // ── Store state ───────────────────────────────────────────────────
  const currentTrack = useStore(s => s.currentTrack);
  const playing = useStore(s => s.playing);
  const setPlaying = useStore(s => s.setPlaying);
  const progress = useStore(s => s.progress);
  const duration = useStore(s => s.duration);
  const volume = useStore(s => s.volume);
  const shuffle = useStore(s => s.shuffle);
  const setShuffle = useStore(s => s.setShuffle);
  const repeatMode = useStore(s => s.repeatMode);
  const setRepeatMode = useStore(s => s.setRepeatMode);
  const toggleWindow = useStore(s => s.toggleWindow);
  const abRepeat = useStore(s => s.abRepeat);
  const setPointA = useStore(s => s.setPointA);
  const setPointB = useStore(s => s.setPointB);
  const clearABRepeat = useStore(s => s.clearABRepeat);

  // ── Context ───────────────────────────────────────────────────────
  const { handleNextTrack: nextTrack, handlePrevTrack: prevTrack, handleSeek: seekToPercent, handleVolumeChange: setVolume, handleToggleMute: toggleMute, audioIsLoading: isLoading, audioBackendError, playbackTracks: tracks } = usePlayerContext();

  // ── Derived ───────────────────────────────────────────────────────
  const currentColors = useCurrentColors();
  const isMuted = false; // TODO: wire up properly when mute state is in store
  const togglePlay = useCallback(() => setPlaying(p => !p), [setPlaying]);
  const currentTrackData = currentTrack !== null ? tracks?.[currentTrack] : null;
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const isDisabled = !!audioBackendError; // Disable controls if audio backend has failed

  // Local volume state for slider responsiveness
  const [localVolume, setLocalVolume] = useState(volume * 100);
  
  // Progress bar drag state
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Sync local volume with prop
  React.useEffect(() => {
    setLocalVolume(volume * 100);
  }, [volume]);

  // Format time for display
  const formatTime = (seconds: number | undefined | null) => {
    if (!seconds || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate percent from mouse event
  const getPercentFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    return Math.max(0, Math.min(100, (clickX / rect.width) * 100));
  }, []);

  // Handle progress bar click
  const handleProgressClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const percent = getPercentFromEvent(e);
    seekToPercent(percent);
  };

  // Handle progress bar mouse down (start dragging)
  const handleProgressMouseDown = (e: React.MouseEvent) => {
    if (isDisabled) return;
    e.stopPropagation();
    setIsDragging(true);
    const percent = getPercentFromEvent(e);
    seekToPercent(percent);
  };

  // Handle progress bar mouse move (while dragging or hovering)
  const handleProgressMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    const percent = getPercentFromEvent(e);
    setHoverPercent(percent);
    if (isDragging) {
      seekToPercent(percent);
    }
  }, [isDragging, getPercentFromEvent, seekToPercent]);

  // Handle mouse up (stop dragging)
  React.useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleProgressMouseMove(e);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDragging, handleProgressMouseMove]);

  // Handle mouse leave
  const handleProgressMouseLeave = () => {
    if (!isDragging) {
      setHoverPercent(null);
    }
  };

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value) / 100;
    setVolume(newVolume);
  };

  // Handle volume input (for immediate UI update while dragging)
  const handleVolumeInput = (e: React.FormEvent<HTMLInputElement>) => {
    setLocalVolume(Number(e.currentTarget.value));
  };

  // Handle scroll wheel on volume slider
  const handleVolumeWheel = (e: React.WheelEvent) => {
    if (isDisabled) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5; // Scroll down decreases, up increases
    const newVolume = Math.max(0, Math.min(100, localVolume + delta));
    setLocalVolume(newVolume);
    setVolume(newVolume / 100);
  };

  // Cycle through repeat modes: off -> all -> one -> off
  const cycleRepeatMode = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header Buttons */}
      <div className="flex justify-between">
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            toggleWindow('miniPlayer');
          }}
          aria-label="Mini Player"
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          title="Mini Player Mode"
        >
          <Minimize2 className={`w-5 h-5 ${currentColors.accent}`} />
        </button>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            toggleWindow('options');
          }}
          aria-label="Open Settings"
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          title="Settings"
        >
          <Settings className={`w-5 h-5 ${currentColors.accent}`} />
        </button>
      </div>

      {/* Album Art & Track Info */}
      <div className="flex items-center gap-4">
        {currentTrackData ? (
          <AlbumArt
            trackId={currentTrackData.id}
            trackPath={currentTrackData.path}
            size="large"
            className="shadow-lg"
          />
        ) : (
          <div className={`w-20 h-20 bg-gradient-to-br ${currentColors.primary} rounded-lg flex items-center justify-center shadow-lg`}>
            <Music className="w-10 h-10 text-white" />
          </div>
        )}
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
          ref={progressBarRef}
          className={`relative w-full bg-slate-700/50 rounded-full h-2 transition-all ${
            isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:h-3 group'
          }`}
          onClick={isDisabled ? undefined : handleProgressClick}
          onMouseDown={isDisabled ? undefined : handleProgressMouseDown}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
          title={`${formatTime(progress)} / ${formatTime(duration)}`}
        >
          {/* A-B Repeat region highlight */}
          {abRepeat?.pointA !== null && abRepeat?.pointB !== null && duration > 0 && (
            <div 
              className="absolute h-full bg-green-500/20 rounded-full pointer-events-none"
              style={{ 
                left: `${(abRepeat.pointA / duration) * 100}%`,
                width: `${((abRepeat.pointB - abRepeat.pointA) / duration) * 100}%`
              }}
            />
          )}
          
          {/* A marker */}
          {abRepeat?.pointA !== null && duration > 0 && (
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-green-500 pointer-events-none z-10"
              style={{ left: `${(abRepeat.pointA / duration) * 100}%` }}
              title={`Point A: ${formatTime(abRepeat.pointA)}`}
            />
          )}
          
          {/* B marker */}
          {abRepeat?.pointB !== null && duration > 0 && (
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-green-500 pointer-events-none z-10"
              style={{ left: `${(abRepeat.pointB / duration) * 100}%` }}
              title={`Point B: ${formatTime(abRepeat.pointB)}`}
            />
          )}
          
          <div 
            className={`h-full bg-gradient-to-r ${currentColors.primary} rounded-full transition-all relative`}
            style={{ width: `${progressPercent}%` }}
          >
            {/* Progress handle indicator - always visible when there's progress */}
            {progressPercent > 0 && (
              <div 
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg transition-opacity ${
                  progressPercent > 2 ? 'opacity-100' : 'opacity-0'
                } ${isDragging ? 'scale-125' : ''}`}
              />
            )}
          </div>
          {/* Hover time indicator */}
          {hoverPercent !== null && !isDisabled && (
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-1 h-full bg-white/30 rounded-full pointer-events-none"
              style={{ left: `${hoverPercent}%` }}
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>{formatTime(progress)}</span>
          {/* Show hover time when hovering */}
          {hoverPercent !== null && duration > 0 && (
            <span className="text-cyan-400">
              {formatTime((hoverPercent / 100) * duration)}
            </span>
          )}
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
          disabled={!tracks?.length || isDisabled}
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
          disabled={!tracks?.length || currentTrack === null || isDisabled}
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
          disabled={!tracks?.length || isDisabled}
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
      <div className="flex items-center gap-3" onWheel={handleVolumeWheel}>
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

      {/* A-B Repeat Controls */}
      {duration > 0 && (
        <div className="flex items-center justify-center gap-2 py-1">
          <button
            onClick={e => {
              e.stopPropagation();
              if (abRepeat?.pointA === null) {
                setPointA?.(progress);
              } else {
                setPointA?.(null);
                if (abRepeat?.pointB !== null) {
                  clearABRepeat?.();
                }
              }
            }}
            disabled={isDisabled}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
              abRepeat?.pointA !== null 
                ? 'bg-green-700 text-white' 
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            } ${isDisabled ? 'opacity-30 cursor-not-allowed' : ''}`}
            title={abRepeat?.pointA !== null ? `Point A: ${formatTime(abRepeat.pointA)} (click to clear)` : 'Set loop start point (A)'}
          >
            <CornerDownRight className="w-3 h-3" />
            A {abRepeat?.pointA !== null && `(${formatTime(abRepeat.pointA)})`}
          </button>
          
          <button
            onClick={e => {
              e.stopPropagation();
              if (abRepeat?.pointB === null && abRepeat?.pointA !== null) {
                setPointB?.(progress);
              } else if (abRepeat?.pointB !== null) {
                setPointB?.(null);
              }
            }}
            disabled={isDisabled || abRepeat?.pointA === null}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
              abRepeat?.pointB !== null 
                ? 'bg-green-700 text-white' 
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            } ${isDisabled || abRepeat?.pointA === null ? 'opacity-30 cursor-not-allowed' : ''}`}
            title={abRepeat?.pointB !== null ? `Point B: ${formatTime(abRepeat.pointB)} (click to clear)` : 'Set loop end point (B)'}
          >
            <CornerDownLeft className="w-3 h-3" />
            B {abRepeat?.pointB !== null && `(${formatTime(abRepeat.pointB)})`}
          </button>
          
          {abRepeat?.enabled && (
            <button
              onClick={e => {
                e.stopPropagation();
                clearABRepeat?.();
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-700/50 text-red-300 hover:bg-red-700 transition-all"
              title="Clear A-B loop"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
          
          {abRepeat?.enabled && (
            <span className="text-xs text-green-400 animate-pulse">
              🔁 Looping
            </span>
          )}
        </div>
      )}

      {/* Track Counter */}
      {tracks?.length > 0 && (
        <div className="text-center text-slate-500 text-xs">
          Track {currentTrack !== null ? currentTrack + 1 : 0} of {tracks?.length ?? 0}
        </div>
      )}
    </div>
  );
}