import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

/**
 * Playlist selector tabs component
 */
export function PlaylistSelector({
  playlists,
  currentPlaylist,
  onSelectPlaylist,
  onNewPlaylist,
  onDeletePlaylist,
  currentColors,
}) {
  return (
    <div className="flex items-center gap-2 px-3">
      <div className="flex-1 overflow-x-auto flex gap-1">
        {playlists.map(pl => (
          <button
            key={pl.id}
            onClick={() => onSelectPlaylist(pl.id)}
            className={`px-3 py-1 text-sm rounded whitespace-nowrap transition-colors ${
              currentPlaylist === pl.id
                ? `${currentColors.accent} bg-slate-800`
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {pl.name}
          </button>
        ))}
      </div>
      <button
        onClick={onNewPlaylist}
        className="p-1.5 hover:bg-slate-700 rounded transition-colors"
        title="New Playlist"
      >
        <Plus className="w-4 h-4 text-slate-400" />
      </button>
      {currentPlaylist && (
        <button
          onClick={() => onDeletePlaylist(currentPlaylist)}
          className="p-1.5 hover:bg-red-900/50 rounded transition-colors"
          title="Delete Playlist"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      )}
    </div>
  );
}

/**
 * New playlist dialog modal
 */
export function NewPlaylistDialog({
  isOpen,
  onClose,
  onCreate,
  playlistName,
  setPlaylistName,
  currentColors,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-4 w-80 shadow-xl">
        <h3 className="text-white font-semibold mb-3">New Playlist</h3>
        <input
          type="text"
          value={playlistName}
          onChange={(e) => setPlaylistName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          placeholder="Playlist name"
          className="w-full px-3 py-2 bg-slate-900 text-white rounded border border-slate-700 focus:outline-none focus:border-blue-500 mb-3"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            className={`px-3 py-1.5 text-sm text-white rounded transition-colors ${currentColors.accent} bg-slate-900 hover:bg-slate-800`}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Adding progress indicator
 */
export function AddingProgressIndicator({ progress }) {
  if (!progress.isAdding) return null;

  return (
    <div className="bg-blue-900/20 border border-blue-700/50 rounded p-3 mx-3 mb-3">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-blue-300 text-sm font-medium mb-1">
            Adding tracks to playlist...
          </div>
          <div className="text-blue-400 text-xs">
            {progress.current} / {progress.total} tracks
          </div>
        </div>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-2">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300 ease-out"
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default {
  PlaylistSelector,
  NewPlaylistDialog,
  AddingProgressIndicator,
};
