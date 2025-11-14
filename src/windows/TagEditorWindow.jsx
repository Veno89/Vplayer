import React, { useState, useEffect } from 'react';
import { Save, X, Music } from 'lucide-react';
import TauriAPI from '../services/TauriAPI';
import { AlbumArt } from '../components/AlbumArt';

export function TagEditorWindow({ track, onClose, onSave, currentColors }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState({
    title: '',
    artist: '',
    album: '',
    year: '',
    genre: '',
    comment: '',
    track_number: '',
    disc_number: '',
  });

  useEffect(() => {
    if (track) {
      setTags({
        title: track.title || '',
        artist: track.artist || '',
        album: track.album || '',
        year: track.year || '',
        genre: track.genre || '',
        comment: track.comment || '',
        track_number: track.track_number || '',
        disc_number: track.disc_number || '',
      });
    }
  }, [track]);

  const handleChange = (field, value) => {
    setTags(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!track) return;

    setSaving(true);
    try {
      await TauriAPI.updateTrackTags(track.id, track.path, tags);
      onSave?.(track.id, tags);
      onClose();
    } catch (err) {
      console.error('Failed to save tags:', err);
      alert('Failed to save tags: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!track) return null;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white p-4 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Edit Tags</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Album Art & File Info */}
      <div className="flex items-start gap-4 mb-4 pb-4 border-b border-slate-700">
        <AlbumArt
          trackId={track.id}
          trackPath={track.path}
          size="xlarge"
          className="flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-400 mb-1">File:</p>
          <p className="text-xs text-slate-500 break-all">{track.path}</p>
          {track.duration && (
            <p className="text-xs text-slate-500 mt-2">
              Duration: {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, '0')}
            </p>
          )}
        </div>
      </div>

      {/* Tag Fields */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Title
          </label>
          <input
            type="text"
            value={tags.title}
            onChange={e => handleChange('title', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            placeholder="Track title"
          />
        </div>

        {/* Artist */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Artist
          </label>
          <input
            type="text"
            value={tags.artist}
            onChange={e => handleChange('artist', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            placeholder="Artist name"
          />
        </div>

        {/* Album */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Album
          </label>
          <input
            type="text"
            value={tags.album}
            onChange={e => handleChange('album', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            placeholder="Album title"
          />
        </div>

        {/* Year & Genre */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Year
            </label>
            <input
              type="text"
              value={tags.year}
              onChange={e => handleChange('year', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              placeholder="YYYY"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Genre
            </label>
            <input
              type="text"
              value={tags.genre}
              onChange={e => handleChange('genre', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              placeholder="Genre"
            />
          </div>
        </div>

        {/* Track & Disc Number */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Track #
            </label>
            <input
              type="text"
              value={tags.track_number}
              onChange={e => handleChange('track_number', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              placeholder="1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Disc #
            </label>
            <input
              type="text"
              value={tags.disc_number}
              onChange={e => handleChange('disc_number', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              placeholder="1"
            />
          </div>
        </div>

        {/* Comment */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Comment
          </label>
          <textarea
            value={tags.comment}
            onChange={e => handleChange('comment', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 resize-none"
            placeholder="Additional comments"
            rows={3}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-4 pt-4 border-t border-slate-700">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r ${currentColors.primary} hover:opacity-90 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Tags'}
        </button>
        <button
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
