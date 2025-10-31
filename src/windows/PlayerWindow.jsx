import React from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, Music, Shuffle, Repeat, Settings } from 'lucide-react';

export function PlayerWindow({
  currentTrack,
  tracks,
  playing,
  progress,
  duration,
  volume,
  setVolume,
  colorScheme,
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
}) {
  return (
    <div className="flex flex-col gap-4 h-full">
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          toggleWindow('options');
        }}
        aria-label="Open Settings"
        className="self-end p-2 hover:bg-slate-800 rounded-lg transition-colors"
      >
        <Settings className={`w-5 h-5 ${currentColors.accent}`} />
      </button>
      <div className="flex items-center gap-4">
        <div className={`w-16 h-16 bg-gradient-to-br ${currentColors.primary} rounded-lg flex items-center justify-center shadow-lg`}>
          <Music className="w-8 h-8 text-white" />
        </div>
        <div className="flex-1">
          {currentTrack !== null && tracks[currentTrack] ? (
            <>
              <h3 className="text-white font-semibold">{tracks[currentTrack].title}</h3>
              <p className="text-slate-400 text-sm">{tracks[currentTrack].artist}</p>
            </>
          ) : (
            <>
              <h3 className="text-white font-semibold">No Track Selected</h3>
              <p className="text-slate-400 text-sm">Add music to your library</p>
            </>
          )}
        </div>
      </div>
      <div>
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden cursor-pointer" onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
          seekToPercent(pct);
        }}>
          <div className={`h-full bg-gradient-to-r ${currentColors.primary} transition-all`} style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>0:00</span>
          <span>{currentTrack !== null && tracks[currentTrack] ? tracks[currentTrack].duration : '0:00'}</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4">
        <button 
          onClick={e => { e.stopPropagation(); prevTrack(); }}
          disabled={tracks.length === 0}
          className="p-2 hover:bg-slate-800 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <SkipBack className="w-5 h-5 text-slate-400" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); togglePlay(); }}
          disabled={tracks.length === 0 || currentTrack === null}
          className={`p-3 bg-gradient-to-r ${currentColors.primary} hover:opacity-90 rounded-full transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          {playing ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white" />}
        </button>
        <button 
          onClick={e => { e.stopPropagation(); nextTrack(); }}
          disabled={tracks.length === 0}
          className="p-2 hover:bg-slate-800 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <SkipForward className="w-5 h-5 text-slate-400" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); setShuffle(s => !s); }}
          className={`p-2 rounded-full transition-colors ${shuffle ? 'bg-slate-700' : 'hover:bg-slate-800'}`}
          title="Shuffle"
        >
          <Shuffle className={`w-4 h-4 ${shuffle ? 'text-cyan-300' : 'text-slate-400'}`} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); setRepeatMode(m => m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'); }}
          className={`p-2 rounded-full transition-colors ${repeatMode !== 'off' ? 'bg-slate-700' : 'hover:bg-slate-800'}`}
          title="Repeat"
        >
          <Repeat className={`w-4 h-4 ${repeatMode !== 'off' ? 'text-cyan-300' : 'text-slate-400'}`} />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <Volume2 className="w-5 h-5 text-slate-400" />
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={e => setVolume(Number(e.target.value))}
          className={`flex-1 accent-${colorScheme}-500`}
        />
        <span className="text-slate-400 text-sm w-8">{volume}</span>
      </div>
    </div>
  );
}
