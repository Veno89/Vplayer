import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Window } from '../components/Window';
import { useToast } from '../hooks/useToast';
import { Save, X, Plus, Trash2 } from 'lucide-react';

/**
 * BatchMetadataEditor - Edit metadata for multiple tracks at once
 * 
 * Allows users to:
 * - Select multiple tracks
 * - Bulk edit common fields (artist, album, genre, year)
 * - Preview changes before applying
 * - Undo changes
 */
export default function BatchMetadataEditor({ id, onClose, selectedTracks = [] }) {
  const [tracks, setTracks] = useState(selectedTracks);
  const [changes, setChanges] = useState({});
  const [applying, setApplying] = useState(false);
  const { showToast } = useToast();

  const fields = [
    { key: 'artist', label: 'Artist', type: 'text' },
    { key: 'album', label: 'Album', type: 'text' },
    { key: 'genre', label: 'Genre', type: 'text' },
    { key: 'year', label: 'Year', type: 'number' },
    { key: 'albumArtist', label: 'Album Artist', type: 'text' },
    { key: 'composer', label: 'Composer', type: 'text' },
  ];

  const handleFieldChange = (field, value) => {
    setChanges(prev => ({
      ...prev,
      [field]: value === '' ? null : value
    }));
  };

  const getCommonValue = (field) => {
    if (tracks.length === 0) return '';
    
    const firstValue = tracks[0][field];
    const allSame = tracks.every(t => t[field] === firstValue);
    
    return allSame ? firstValue || '' : '';
  };

  const getPlaceholder = (field) => {
    if (tracks.length === 0) return '';
    
    const firstValue = tracks[0][field];
    const allSame = tracks.every(t => t[field] === firstValue);
    
    if (allSame) return '';
    return '(multiple values)';
  };

  const applyChanges = async () => {
    if (Object.keys(changes).length === 0) {
      showToast('No changes to apply', 'warning');
      return;
    }

    setApplying(true);
    
    try {
      let successCount = 0;
      let failCount = 0;

      for (const track of tracks) {
        try {
          // Build updated metadata
          const updatedMetadata = {
            title: track.title,
            artist: changes.artist !== undefined ? changes.artist : track.artist,
            album: changes.album !== undefined ? changes.album : track.album,
            genre: changes.genre !== undefined ? changes.genre : track.genre,
            year: changes.year !== undefined ? parseInt(changes.year) || 0 : track.year,
            albumArtist: changes.albumArtist !== undefined ? changes.albumArtist : track.albumArtist,
            composer: changes.composer !== undefined ? changes.composer : track.composer,
            trackNumber: track.trackNumber || 0,
            discNumber: track.discNumber || 0,
          };

          await invoke('update_track_tags', {
            path: track.path,
            metadata: updatedMetadata
          });
          
          successCount++;
        } catch (err) {
          console.error(`Failed to update track ${track.path}:`, err);
          failCount++;
        }
      }

      if (successCount > 0) {
        showToast(`Updated ${successCount} track(s) successfully`, 'success');
      }
      
      if (failCount > 0) {
        showToast(`Failed to update ${failCount} track(s)`, 'error');
      }

      // Clear changes and close
      if (successCount > 0) {
        setChanges({});
        setTimeout(() => onClose(), 1000);
      }
    } catch (err) {
      console.error('Batch update failed:', err);
      showToast('Failed to apply changes', 'error');
    } finally {
      setApplying(false);
    }
  };

  const clearChanges = () => {
    setChanges({});
  };

  const hasChanges = Object.keys(changes).length > 0;

  return (
    <Window
      id={id}
      title={`Batch Metadata Editor (${tracks.length} tracks)`}
      onClose={onClose}
      className="w-[600px] h-[500px]"
    >
      <div className="flex flex-col h-full p-6">
        {tracks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg mb-2">No tracks selected</p>
              <p className="text-sm">Select tracks in the library to batch edit metadata</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-6 pb-4 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white mb-2">
                Edit Metadata for {tracks.length} Track{tracks.length !== 1 ? 's' : ''}
              </h2>
              <p className="text-sm text-gray-400">
                Fields will be applied to all selected tracks. Leave empty to keep existing values.
              </p>
            </div>

            {/* Fields */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-6">
              {fields.map(field => (
                <div key={field.key}>
                  <label className="text-sm text-gray-400 mb-1 block">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={changes[field.key] !== undefined ? changes[field.key] || '' : getCommonValue(field.key)}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={getPlaceholder(field.key)}
                    className="w-full px-3 py-2 bg-gray-800 text-white rounded border border-gray-700 focus:border-blue-500 focus:outline-none"
                  />
                  {getPlaceholder(field.key) && (
                    <p className="text-xs text-gray-500 mt-1">
                      Multiple different values in selected tracks
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-700">
              <div className="text-sm text-gray-400">
                {hasChanges ? `${Object.keys(changes).length} field(s) modified` : 'No changes yet'}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={clearChanges}
                  disabled={!hasChanges || applying}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
                <button
                  onClick={applyChanges}
                  disabled={!hasChanges || applying}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {applying ? 'Applying...' : 'Apply Changes'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Window>
  );
}
