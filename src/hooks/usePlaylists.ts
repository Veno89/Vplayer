import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TauriAPI, type PlaylistRemoval } from '../services/TauriAPI';
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
  loadError: string | null;
  isReady: boolean;
  addingProgress: AddingProgress;
  createPlaylist: (name: string) => Promise<string>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  renamePlaylist: (playlistId: string, newName: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeTracksFromPlaylist: (playlistId: string, trackIds: string[], missingOnly?: boolean) => Promise<PlaylistRemoval>;
  undoRemoval: (receipt: PlaylistRemoval) => Promise<void>;
  duplicatePlaylist: (playlistId: string, name: string) => Promise<string>;
  reorderPlaylistTracks: (playlistId: string, trackPositions: [string, number][]) => Promise<void>;
  loadPlaylists: () => Promise<void>;
  refreshPlaylistTracks: () => Promise<void>;
  updateTrackRating: (trackId: string, rating: number) => Promise<void>;
}

export function usePlaylists(): PlaylistsAPI {
  // Restore the selected playlist immediately. Its tracks are loaded below;
  // isReady stays false until both the playlist list and that track request
  // have settled, preventing an old playlist's tracks from being reused.
  const lastPlaylistId = useStore(state => state.lastPlaylistId);
  const setLastPlaylistId = useStore(state => state.setLastPlaylistId);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [currentPlaylist, setCurrentPlaylist] = useState<string | null>(lastPlaylistId);
  const currentPlaylistRef = useRef(currentPlaylist);
  currentPlaylistRef.current = currentPlaylist;
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(lastPlaylistId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoadedPlaylists, setHasLoadedPlaylists] = useState(false);
  const [loadedPlaylistId, setLoadedPlaylistId] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const ratingWrites = useRef(new Map<string, Promise<void>>());
  const ratingsDuringLoad = useRef<Map<string, number> | null>(null);
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
    ratingsDuringLoad.current = playlistId ? new Map() : null;
    setLoadError(null);
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
      // A read already in flight can finish after a rating was saved. Preserve
      // those confirmed writes rather than showing the older query snapshot.
      const ratings = ratingsDuringLoad.current;
      setPlaylistTracks(ratings?.size ? tracks.map(track =>
        ratings.has(track.id) ? { ...track, rating: ratings.get(track.id)! } : track
      ) : tracks);
      setLoadedPlaylistId(playlistId);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setLoadError(String(err));
      console.error('Failed to load playlist tracks:', err);
      throw err;
    } finally {
      if (requestId === loadRequestRef.current) {
        ratingsDuringLoad.current = null;
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
      if (currentPlaylistRef.current === playlistId) {
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
      if (currentPlaylistRef.current === playlistId) {
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
      
      if (currentPlaylistRef.current === playlistId) {
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
      if (currentPlaylistRef.current === playlistId) {
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
      if (currentPlaylistRef.current === playlistId) {
        await loadPlaylistTracks(playlistId);
      }
    } catch (err) {
      console.error('Failed to reorder playlist tracks:', err);
      throw err;
    }
  }, [currentPlaylist, loadPlaylistTracks]);

  const removeTracksFromPlaylist = useCallback(async (playlistId: string, ids: string[], missingOnly = false) => {
    const receipt = await TauriAPI.removePlaylistTracks(playlistId, ids, missingOnly);
    // Keep the undo receipt even if the subsequent read fails. loadError exposes a retry.
    if (currentPlaylistRef.current === playlistId) await loadPlaylistTracks(playlistId).catch(() => {});
    return receipt;
  }, [loadPlaylistTracks]);

  const undoRemoval = useCallback(async (receipt: PlaylistRemoval) => {
    await TauriAPI.undoPlaylistRemoval(receipt);
    if (currentPlaylistRef.current === receipt.playlistId) await loadPlaylistTracks(receipt.playlistId).catch(() => {});
  }, [loadPlaylistTracks]);

  const duplicatePlaylist = useCallback(async (playlistId: string, name: string) => {
    const id = await TauriAPI.duplicatePlaylist(playlistId, name);
    await loadPlaylists();
    return id;
  }, [loadPlaylists]);

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
    && !loadError
    && loadedPlaylistId === currentPlaylist;

  const refreshPlaylistTracks = useCallback(async () => {
    if (currentPlaylist) {
      await loadPlaylistTracks(currentPlaylist);
    }
  }, [currentPlaylist, loadPlaylistTracks]);

  const updateTrackRating = useCallback((trackId: string, rating: number) => {
    // Serialize writes to the same song, including rapid clicks. Only publish a
    // rating after SQLite accepts it; a failed write leaves the displayed data intact.
    const previous = ratingWrites.current.get(trackId) ?? Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      await TauriAPI.updateTrackRating(trackId, rating);
      ratingsDuringLoad.current?.set(trackId, rating);
      setPlaylistTracks(tracks => tracks.some(track => track.id === trackId) ? tracks.map(track =>
        track.id === trackId ? { ...track, rating } : track
      ) : tracks);
      const state = useStore.getState();
      if (state.activePlaybackTracks.some(track => track.id === trackId)) {
        state.setActivePlaybackTracks(state.activePlaybackTracks.map(track =>
          track.id === trackId ? { ...track, rating } : track
        ));
      }
    });
    ratingWrites.current.set(trackId, write);
    const cleanup = () => {
      if (ratingWrites.current.get(trackId) === write) ratingWrites.current.delete(trackId);
    };
    void write.then(cleanup, cleanup);
    return write;
  }, []);

  // PlaybackProvider also renders on audio ticks. Keep its playlist dependency
  // stable so those ticks do not invalidate every visible row and its bounds cache.
  return useMemo(() => ({
    playlists,
    currentPlaylist,
    setCurrentPlaylist,
    playlistTracks,
    isLoading,
    loadError,
    isReady,
    addingProgress,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    addTrackToPlaylist,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    removeTracksFromPlaylist,
    undoRemoval,
    duplicatePlaylist,
    reorderPlaylistTracks,
    loadPlaylists,
    refreshPlaylistTracks,
    updateTrackRating,
  }), [
    playlists, currentPlaylist, playlistTracks, isLoading, loadError, isReady,
    addingProgress, createPlaylist, deletePlaylist, renamePlaylist,
    addTrackToPlaylist, addTracksToPlaylist, removeTrackFromPlaylist,
    removeTracksFromPlaylist, undoRemoval, duplicatePlaylist,
    reorderPlaylistTracks, loadPlaylists, refreshPlaylistTracks, updateTrackRating,
  ]);
}
