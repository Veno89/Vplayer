import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TauriAPI } from '../services/TauriAPI';

export function usePlaylists() {
  const [playlists, setPlaylists] = useState([]);
  const [currentPlaylist, setCurrentPlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRestoredPlaylist, setHasRestoredPlaylist] = useState(false);
  const [addingProgress, setAddingProgress] = useState({ current: 0, total: 0, isAdding: false });

  const loadPlaylists = useCallback(async () => {
    try {
      const data = await invoke('get_all_playlists');
      // Convert to objects with id, name, createdAt
      const playlistObjects = data.map(([id, name, createdAt]) => ({
        id,
        name,
        createdAt
      }));
      setPlaylists(playlistObjects);
      
      // Restore last playlist on first load
      if (!hasRestoredPlaylist && playlistObjects.length > 0) {
        const savedPlaylist = localStorage.getItem('vplayer_last_playlist');
        if (savedPlaylist) {
          // Check if saved playlist still exists
          const exists = playlistObjects.some(p => p.id === savedPlaylist);
          if (exists) {
            setCurrentPlaylist(savedPlaylist);
          }
        }
        setHasRestoredPlaylist(true);
      }
    } catch (err) {
      console.error('Failed to load playlists:', err);
      throw err;
    }
  }, [hasRestoredPlaylist]);

  const loadPlaylistTracks = useCallback(async (playlistId) => {
    if (!playlistId) {
      setPlaylistTracks([]);
      return;
    }
    
    try {
      setIsLoading(true);
      const tracks = await invoke('get_playlist_tracks', { playlistId });
      setPlaylistTracks(tracks);
    } catch (err) {
      console.error('Failed to load playlist tracks:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createPlaylist = useCallback(async (name) => {
    try {
      const id = await invoke('create_playlist', { name });
      await loadPlaylists();
      return id;
    } catch (err) {
      console.error('Failed to create playlist:', err);
      throw err;
    }
  }, [loadPlaylists]);

  const deletePlaylist = useCallback(async (playlistId) => {
    try {
      await invoke('delete_playlist', { playlistId });
      await loadPlaylists();
      if (currentPlaylist === playlistId) {
        setCurrentPlaylist(null);
        setPlaylistTracks([]);
      }
    } catch (err) {
      console.error('Failed to delete playlist:', err);
      throw err;
    }
  }, [loadPlaylists, currentPlaylist]);

  const renamePlaylist = useCallback(async (playlistId, newName) => {
    try {
      await invoke('rename_playlist', { playlistId, newName });
      await loadPlaylists();
    } catch (err) {
      console.error('Failed to rename playlist:', err);
      throw err;
    }
  }, [loadPlaylists]);

  const addTrackToPlaylist = useCallback(async (playlistId, trackId) => {
    try {
      await invoke('add_track_to_playlist', { playlistId, trackId });
      if (currentPlaylist === playlistId) {
        await loadPlaylistTracks(playlistId);
      }
    } catch (err) {
      console.error('Failed to add track to playlist:', err);
      throw err;
    }
  }, [currentPlaylist, loadPlaylistTracks]);

  const addTracksToPlaylist = useCallback(async (playlistId, trackIds) => {
    try {
      console.log('Adding', trackIds.length, 'tracks to playlist', playlistId);
      setAddingProgress({ current: 0, total: trackIds.length, isAdding: true });
      
      // Use batch operation for efficiency (single transaction)
      const count = await TauriAPI.addTracksToPlaylist(playlistId, trackIds);
      
      setAddingProgress({ current: count, total: trackIds.length, isAdding: true });
      
      if (currentPlaylist === playlistId) {
        await loadPlaylistTracks(playlistId);
      }
      
      console.log('Successfully added', count, 'tracks to playlist');
    } catch (err) {
      console.error('Failed to add tracks to playlist:', err);
      throw err;
    } finally {
      setAddingProgress({ current: 0, total: 0, isAdding: false });
    }
  }, [currentPlaylist, loadPlaylistTracks]);

  const removeTrackFromPlaylist = useCallback(async (playlistId, trackId) => {
    try {
      await invoke('remove_track_from_playlist', { playlistId, trackId });
      if (currentPlaylist === playlistId) {
        await loadPlaylistTracks(playlistId);
      }
    } catch (err) {
      console.error('Failed to remove track from playlist:', err);
      throw err;
    }
  }, [currentPlaylist, loadPlaylistTracks]);

  const reorderPlaylistTracks = useCallback(async (playlistId, trackPositions) => {
    try {
      await invoke('reorder_playlist_tracks', { playlistId, trackPositions });
      if (currentPlaylist === playlistId) {
        await loadPlaylistTracks(playlistId);
      }
    } catch (err) {
      console.error('Failed to reorder playlist tracks:', err);
      throw err;
    }
  }, [currentPlaylist, loadPlaylistTracks]);

  // Load playlists on mount
  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  // Load tracks when current playlist changes
  useEffect(() => {
    loadPlaylistTracks(currentPlaylist);
  }, [currentPlaylist, loadPlaylistTracks]);

  return {
    playlists,
    currentPlaylist,
    setCurrentPlaylist,
    playlistTracks,
    isLoading,
    addingProgress,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    addTrackToPlaylist,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    reorderPlaylistTracks,
    loadPlaylists,
  };
}
