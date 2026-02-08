import React, { useState, useEffect, useCallback } from 'react';
import { Tag, Save, X, Loader, Music, User, Disc, Calendar, Hash, MessageSquare, AlertCircle } from 'lucide-react';
import { TauriAPI } from '../services/TauriAPI';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { usePlayerContext } from '../context/PlayerProvider';

/**
 * Tag Editor Window - Edit track metadata (ID3 tags)
 */
export function TagEditorWindow() {
  const track = useStore(s => s.tagEditorTrack);
  const setTagEditorTrack = useStore(s => s.setTagEditorTrack);
  const currentColors = useCurrentColors();
  const { library, toast } = usePlayerContext();

  const onClose = useCallback(() => setTagEditorTrack(null), [setTagEditorTrack]);
  const onSave = useCallback(() => {
    library.refreshTracks();
    toast.showSuccess('Tags saved successfully');
  }, [library, toast]);
  const [tags, setTags] = useState({
    title: '',
    artist: '',
    album: '',
    year: '',
    genre: '',
    trackNumber: '',
    discNumber: '',
    comment: '',
  });
  const [originalTags, setOriginalTags] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load track data when track changes
  useEffect(() => {
    if (track) {
      const initialTags = {
        title: track.title || '',
        artist: track.artist || '',
        album: track.album || '',
        year: track.year?.toString() || '',
        genre: track.genre || '',
        trackNumber: track.track_number?.toString() || '',
        discNumber: track.disc_number?.toString() || '',
        comment: track.comment || '',
      };
      setTags(initialTags);
      setOriginalTags(initialTags);
      setHasChanges(false);
      setError(null);
    }
  }, [track]);

  // Check for changes
  useEffect(() => {
    const changed = Object.keys(tags).some(key => tags[key] !== originalTags[key]);
    setHasChanges(changed);
  }, [tags, originalTags]);

  const handleChange = (field, value) => {
    setTags(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!track || !hasChanges) return;
    
    setSaving(true);
    setError(null);
    
    try {
      // Only send changed fields
      const changedTags = {};
      Object.keys(tags).forEach(key => {
        if (tags[key] !== originalTags[key]) {
          // Convert camelCase to snake_case for backend
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          changedTags[snakeKey] = tags[key] || null;
        }
      });

      await TauriAPI.updateTrackTags(track.id, track.path, changedTags);

      setOriginalTags({ ...tags });
      setHasChanges(false);
      
      if (onSave) {
        onSave({ ...track, ...tags });
      }
    } catch (err) {
      console.error('Failed to save tags:', err);
      setError(err.toString());
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTags({ ...originalTags });
  };

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
        <Tag className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No Track Selected</p>
        <p className="text-sm text-slate-500 mt-1">Select a track to edit its tags</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <Tag className={`w-5 h-5 ${currentColors?.accent || 'text-cyan-400'}`} />
          <div>
            <h2 className="text-white font-semibold">Edit Tags</h2>
            <p className="text-xs text-slate-400 truncate max-w-[300px]" title={track.path}>
              {track.path?.split(/[\\/]/).pop()}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <TagField
          label="Title"
          icon={Music}
          value={tags.title}
          onChange={(v) => handleChange('title', v)}
          placeholder="Track title"
          currentColors={currentColors}
        />

        {/* Artist */}
        <TagField
          label="Artist"
          icon={User}
          value={tags.artist}
          onChange={(v) => handleChange('artist', v)}
          placeholder="Artist name"
          currentColors={currentColors}
        />

        {/* Album */}
        <TagField
          label="Album"
          icon={Disc}
          value={tags.album}
          onChange={(v) => handleChange('album', v)}
          placeholder="Album name"
          currentColors={currentColors}
        />

        {/* Year & Genre Row */}
        <div className="grid grid-cols-2 gap-4">
          <TagField
            label="Year"
            icon={Calendar}
            value={tags.year}
            onChange={(v) => handleChange('year', v)}
            placeholder="2024"
            type="number"
            currentColors={currentColors}
          />
          <TagField
            label="Genre"
            icon={Tag}
            value={tags.genre}
            onChange={(v) => handleChange('genre', v)}
            placeholder="Rock, Pop, etc."
            currentColors={currentColors}
          />
        </div>

        {/* Track & Disc Numbers */}
        <div className="grid grid-cols-2 gap-4">
          <TagField
            label="Track #"
            icon={Hash}
            value={tags.trackNumber}
            onChange={(v) => handleChange('trackNumber', v)}
            placeholder="1"
            type="number"
            currentColors={currentColors}
          />
          <TagField
            label="Disc #"
            icon={Hash}
            value={tags.discNumber}
            onChange={(v) => handleChange('discNumber', v)}
            placeholder="1"
            type="number"
            currentColors={currentColors}
          />
        </div>

        {/* Comment */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <MessageSquare className="w-4 h-4 text-slate-500" />
            Comment
          </label>
          <textarea
            value={tags.comment}
            onChange={(e) => handleChange('comment', e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-800/50">
        <div className="text-xs text-slate-500">
          {hasChanges ? (
            <span className="text-yellow-400">● Unsaved changes</span>
          ) : (
            <span>No changes</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={!hasChanges || saving}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              hasChanges && !saving
                ? 'bg-cyan-600 hover:bg-cyan-500'
                : 'bg-slate-700'
            }`}
          >
            {saving ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Tags
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tag Field Component
function TagField({ label, icon: Icon, value, onChange, placeholder, type = 'text', currentColors }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <Icon className="w-4 h-4 text-slate-500" />
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
      />
    </div>
  );
}

export default TagEditorWindow;
