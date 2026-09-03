import { useState, useEffect, useCallback, useRef } from 'react';
import { TauriAPI } from '../services/TauriAPI';
import { log } from '../utils/logger';
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
  isReady: boolean;
  addingProgress: AddingProgress;
  createPlaylist: (name: string) => Promise<string>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  renamePlaylist: (playlistId: string, newName: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  reorderPlaylistTracks: (playlistId: string, trackPositions: [string, number][]) => Promise<void>;
  loadPlaylists: () => Promise<void>;
  refreshPlaylistTracks: () => Promise<void>;
}

export function usePlaylists(): PlaylistsAPI {
  // Restore the selected playlist immediately. Its tracks are loaded below;
  // isReady stays false until both the playlist list and that track request
  // have settled, preventing an old playlist's tracks from being reused.
  const lastPlaylistId = useStore(state => state.lastPlaylistId);
  const setLastPlaylistId = useStore(state => state.setLastPlaylistId);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [currentPlaylist, setCurrentPlaylist] = useState<string | null>(lastPlaylistId);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(lastPlaylistId));
  const [hasLoadedPlaylists, setHasLoadedPlaylists] = useState(false);
  const [loadedPlaylistId, setLoadedPlaylistId] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  // Use a ref instead of state so setting it does not re-create loadPlaylists
  // (which would cause a spurious second IPC call on mount via its useEffect).
  const hasRestoredPlaylistRef = useRef(false);
  const [addingProgress, setAddingProgress] = useState<AddingProgress>({ current: 0, total: 0, isAdding: false });

  const loadPlaylists = useCallback(async () => {
    try {
      const data = await TauriAPI.getAllPlaylists();
      // Convert to objects with id, name, createdAt
      const playlistObjects: PlaylistItem[] = (data as any[]).map((item: any) => {
        // Handle both tuple format [id, name, createdAt] and object format {id, name, created_at}
        if (Array.isArray(item)) {
          const [id, name, createdAt] = item;
          return { id, name, createdAt };
        }
        return { id: item.id, name: item.name, createdAt: item.created_at ?? item.createdAt ?? 0 };
      });
      setPlaylists(playlistObjects);
      
      // Restore last playlist on first load (runs only once — ref prevents re-run)
      if (!hasRestoredPlaylistRef.current) {
        if (lastPlaylistId) {
          // Check if saved playlist still exists
          const exists = playlistObjects.some((p: PlaylistItem) => p.id === lastPlaylistId);
          if (exists) {
            setCurrentPlaylist(lastPlaylistId);
          } else {
            setCurrentPlaylist(null);
          }
        } else {
          setCurrentPlaylist(null);
        }
        hasRestoredPlaylistRef.current = true;
      }
    } catch (err) {
      console.error('Failed to load playlists:', err);
      throw err;
    } finally {
      setHasLoadedPlaylists(true);
    }
  // hasRestoredPlaylistRef is a ref, not state, so it is not a dependency here.
  // This keeps loadPlaylists identity stable after the first call.
  }, [lastPlaylistId]);

  const loadPlaylistTracks = useCallback(async (playlistId: string | null) => {
    const requestId = ++loadRequestRef.current;
    if (!playlistId) {
      setPlaylistTracks([]);
      setLoadedPlaylistId(null);
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const tracks = await TauriAPI.getPlaylistTracks(playlistId);
      if (requestId !== loadRequestRef.current) return;
      setPlaylistTracks(tracks);
      setLoadedPlaylistId(playlistId);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setPlaylistTracks([]);
      setLoadedPlaylistId(playlistId);
      console.error('Failed to load playlist tracks:', err);
      throw err;
    } finally {
      if (requestId === loadRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const createPlaylist = useCallback(async (name: string): Promise<string> => {
    try {
      const result = await TauriAPI.createPlaylist(name);
      await loadPlaylists();
      return typeof result === 'string' ? result : (result as any).id;
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
      log.info('Adding', trackIds.length, 'tracks to playlist', playlistId);
      setAddingProgress({ current: 0, total: trackIds.length, isAdding: true });
      
      // Use batch operation for efficiency (single transaction)
      await TauriAPI.addTracksToPlaylist(playlistId, trackIds);
      
      setAddingProgress({ current: trackIds.length, total: trackIds.length, isAdding: true });
      
      if (currentPlaylist === playlistId) {
        await loadPlaylistTracks(playlistId);
      }
      
      log.info('Successfully added', trackIds.length, 'tracks to playlist');
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
    void loadPlaylists().catch(() => {});
  }, [loadPlaylists]);

  // Load tracks when current playlist changes, and persist selection
  useEffect(() => {
    void loadPlaylistTracks(currentPlaylist).catch(() => {});
    setLastPlaylistId(currentPlaylist);
  }, [currentPlaylist, loadPlaylistTracks, setLastPlaylistId]);

  const isReady = hasLoadedPlaylists
    && !isLoading
    && loadedPlaylistId === currentPlaylist;

  const refreshPlaylistTracks = useCallback(async () => {
    if (currentPlaylist) {
      await loadPlaylistTracks(currentPlaylist);
    }
  }, [currentPlaylist, loadPlaylistTracks]);

  return {
    playlists,
    currentPlaylist,
    setCurrentPlaylist,
    playlistTracks,
    isLoading,
    isReady,
    addingProgress,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    addTrackToPlaylist,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    reorderPlaylistTracks,
    loadPlaylists,
    refreshPlaylistTracks,
  };
}
