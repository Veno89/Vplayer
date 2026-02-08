import React, { useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Maximize2, X, Volume2, VolumeX } from 'lucide-react';
import { AlbumArt } from '../components/AlbumArt';
import { useStore } from '../store/useStore';
import { usePlayerContext } from '../context/PlayerProvider';
import { useCurrentColors } from '../hooks/useStoreHooks';

export function MiniPlayerWindow({ onMaximize, onClose }) {
  const currentTrack = useStore(s => s.currentTrack);
  const playing = useStore(s => s.playing);
  const setPlaying = useStore(s => s.setPlaying);
  const progress = useStore(s => s.progress);
  const duration = useStore(s => s.duration);
  const volume = useStore(s => s.volume);
  const currentColors = useCurrentColors();
  const { playbackTracks, handleNextTrack, handlePrevTrack, handleToggleMute, audio } = usePlayerContext();
  const tracks = playbackTracks;
  const isMuted = audio.isMuted;
  const togglePlay = useCallback(() => setPlaying(p => !p), [setPlaying]);
  const currentTrackData = currentTrack !== null ? tracks[currentTrack] : null;
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col bg-slate-900/95 backdrop-blur-sm text-white rounded-lg shadow-2xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${playing ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-xs font-semibold text-slate-400">VPlayer Mini</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onMaximize}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
            title="Maximize"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-500 rounded transition-colors"
            title="Close"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        <div className="flex items-center gap-3">
          {/* Album Art */}
          {currentTrackData ? (
            <AlbumArt
              trackId={currentTrackData.id}
              trackPath={currentTrackData.path}
              size="medium"
              className="flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 bg-slate-800 rounded flex-shrink-0" />
          )}

          {/* Track Info */}
          <div className="flex-1 min-w-0">
            {currentTrackData ? (
              <>
                <h3 className="text-sm font-semibold truncate" title={currentTrackData.title}>
                  {currentTrackData.title}
                </h3>
                <p className="text-xs text-slate-400 truncate" title={currentTrackData.artist}>
                  {currentTrackData.artist}
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500">No track selected</p>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
            <div 
              className={`h-full bg-gradient-to-r ${currentColors.primary} transition-all`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mt-3">
          {/* Volume */}
          <button
            onClick={handleToggleMute}
            className="p-1.5 hover:bg-slate-800 rounded transition-colors"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-slate-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Playback Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevTrack}
              disabled={tracks.length === 0}
              className="p-1.5 hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
              title="Previous"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              disabled={tracks.length === 0 || currentTrack === null}
              className={`p-2 bg-gradient-to-r ${currentColors.primary} hover:opacity-90 rounded-full transition-all disabled:opacity-30`}
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </button>

            <button
              onClick={handleNextTrack}
              disabled={tracks.length === 0}
              className="p-1.5 hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
              title="Next"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Spacer for symmetry */}
          <div className="w-8" />
        </div>
      </div>
    </div>
  );
}
