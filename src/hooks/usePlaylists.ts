import { useState, useEffect, useCallback } from 'react';
import { TauriAPI } from '../services/TauriAPI';
import { useStore } from '../store/useStore';
import type { Track } from '../types';

interface PlaylistItem {
  id: string;
  name: string;
  createdAt: number;
}

interface AddingProgress {
  current: number;
  total: number;
  isAdding: boolean;
}

export interface PlaylistsAPI {
  playlists: PlaylistItem[];
  currentPlaylist: string | null;
  setCurrentPlaylist: (id: string | null) => void;
  playlistTracks: Track[];
  isLoading: boolean;
  addingProgress: AddingProgress;
  createPlaylist: (name: string) => Promise<string>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  renamePlaylist: (playlistId: string, newName: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  reorderPlaylistTracks: (playlistId: string, trackPositions: [string, number][]) => Promise<void>;
  loadPlaylists: () => Promise<void>;
}

export function usePlaylists(): PlaylistsAPI {
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [currentPlaylist, setCurrentPlaylist] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRestoredPlaylist, setHasRestoredPlaylist] = useState(false);
  const [addingProgress, setAddingProgress] = useState<AddingProgress>({ current: 0, total: 0, isAdding: false });

  // Read last playlist from store (persisted)
  const lastPlaylistId = useStore(state => state.lastPlaylistId);
  const setLastPlaylistId = useStore(state => state.setLastPlaylistId);

  const loadPlaylists = useCallback(async () => {
    try {
      const data = await TauriAPI.getAllPlaylists();
      // Convert to objects with id, name, createdAt
      const playlistObjects: PlaylistItem[] = data.map(([id, name, createdAt]: [string, string, number]) => ({
        id,
        name,
        createdAt
      }));
      setPlaylists(playlistObjects);
      
      // Restore last playlist on first load
      if (!hasRestoredPlaylist && playlistObjects.length > 0) {
        if (lastPlaylistId) {
          // Check if saved playlist still exists
          const exists = playlistObjects.some((p: PlaylistItem) => p.id === lastPlaylistId);
          if (exists) {
            setCurrentPlaylist(lastPlaylistId);
          }
        }
        setHasRestoredPlaylist(true);
      }
    } catch (err) {
      console.error('Failed to load playlists:', err);
      throw err;
    }
  }, [hasRestoredPlaylist, lastPlaylistId]);

  const loadPlaylistTracks = useCallback(async (playlistId: string | null) => {
    if (!playlistId) {
      setPlaylistTracks([]);
      return;
    }
    
    try {
      setIsLoading(true);
      const tracks = await TauriAPI.getPlaylistTracks(playlistId);
      setPlaylistTracks(tracks);
    } catch (err) {
      console.error('Failed to load playlist tracks:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createPlaylist = useCallback(async (name: string) => {
    try {
      const id = await TauriAPI.createPlaylist(name);
      await loadPlaylists();
      return id;
    } catch (err) {
      console.error('Failed to create playlist:', err);
      throw err;
    }
  }, [loadPlaylists]);

  const deletePlaylist = useCallback(async (playlistId: string) => {
    try {
      await TauriAPI.deletePlaylist(playlistId);
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

  const renamePlaylist = useCallback(async (playlistId: string, newName: string) => {
    try {
      await TauriAPI.renamePlaylist(playlistId, newName);
      await loadPlaylists();
    } catch (err) {
      console.error('Failed to rename playlist:', err);
      throw err;
    }
  }, [loadPlaylists]);

  const addTrackToPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    try {
      await TauriAPI.addTrackToPlaylist(playlistId, trackId);
      if (currentPlaylist === playlistId) {
        await loadPlaylistTracks(playlistId);
      }
    } catch (err) {
      console.error('Failed to add track to playlist:', err);
      throw err;
    }
  }, [currentPlaylist, loadPlaylistTracks]);

  const addTracksToPlaylist = useCallback(async (playlistId: string, trackIds: string[]) => {
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

  const removeTrackFromPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    try {
      await TauriAPI.removeTrackFromPlaylist(playlistId, trackId);
      if (currentPlaylist === playlistId) {
        await loadPlaylistTracks(playlistId);
      }
    } catch (err) {
      console.error('Failed to remove track from playlist:', err);
      throw err;
    }
  }, [currentPlaylist, loadPlaylistTracks]);

  const reorderPlaylistTracks = useCallback(async (playlistId: string, trackPositions: [string, number][]) => {
    try {
      await TauriAPI.reorderPlaylistTracks(playlistId, trackPositions);
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

  // Load tracks when current playlist changes, and persist selection
  useEffect(() => {
    loadPlaylistTracks(currentPlaylist);
    setLastPlaylistId(currentPlaylist);
  }, [currentPlaylist, loadPlaylistTracks, setLastPlaylistId]);

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
