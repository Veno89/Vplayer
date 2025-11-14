import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function usePlaylists() {
  const [playlists, setPlaylists] = useState([]);
  const [currentPlaylist, setCurrentPlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

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
    } catch (err) {
      console.error('Failed to load playlists:', err);
      throw err;
    }
  }, []);

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
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    reorderPlaylistTracks,
    loadPlaylists,
  };
}
