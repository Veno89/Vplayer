import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { TauriAPI, type LibraryOverview } from '../../services/TauriAPI';
import { useToast } from '../useToast';
import { devCounters } from '../../utils/devCounters';
import type { Track, TrackFilter } from '../../types';

export const LIBRARY_PAGE_SIZE = 200;
export const LIBRARY_MAX_CACHED_PAGES = 6;
interface LibraryFolder { id: string; path: string; name: string; dateAdded: number; }
interface AddFolderResult { path: string; newFolder: LibraryFolder; }
export interface LibraryDataAPI {
  tracks: Track[];
  rows: Track[];
  totalMatches: number;
  overview: LibraryOverview | null;
  isLoading: boolean;
  loadError: string | null;
  queryRevision: number;
  libraryFolders: LibraryFolder[];
  loadTracks: () => Promise<void>;
  refreshTracks: () => Promise<void>;
  loadAllTracks: () => Promise<void>;
  loadAllFolders: () => Promise<void>;
  loadRange: (start: number, stop: number) => void;
  addFolder: (selectedPath?: string) => Promise<AddFolderResult | null>;
  removeFolder: (folderId: string, folderPath: string) => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;
}

/** A bounded catalogue window. SQLite supplies totals; unloaded rows are placeholders. */
export function useLibraryData(filterParams: TrackFilter | null = null): LibraryDataAPI {
  const { showError } = useToast();
  const [pages, setPages] = useState<Map<number, Track[]>>(new Map());
  const [totalMatches, setTotalMatches] = useState(0);
  const [overview, setOverview] = useState<LibraryOverview | null>(null);
  const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queryRevision, setQueryRevision] = useState(0);
  const generation = useRef(0);
  const pageCache = useRef(new Map<number, Track[]>());
  const inFlight = useRef(new Map<number, Promise<void>>());
  const key = JSON.stringify(filterParams || {});
  const params = useMemo<TrackFilter>(() => JSON.parse(key), [key]);

  const requestPage = useCallback(async (offset: number, version: number) => {
    if (version !== generation.current) return;
    const cached = pageCache.current.get(offset);
    if (cached) {
      pageCache.current.delete(offset);
      pageCache.current.set(offset, cached);
      return;
    }
    const existing = inFlight.current.get(offset);
    if (existing) return existing;
    const request = (async () => {
      const started = performance.now();
      const page = await TauriAPI.getTracksPage(offset, LIBRARY_PAGE_SIZE, params);
      if (version !== generation.current) {
        devCounters.incLibrary('staleSearchResultsIgnored');
        return;
      }
      if (!page || !Array.isArray(page.tracks)) throw new Error('Invalid library page response');
      const cache = pageCache.current;
      cache.set(offset, page.tracks);
      while (cache.size > LIBRARY_MAX_CACHED_PAGES) cache.delete(cache.keys().next().value!);
      setPages(new Map(cache));
      setTotalMatches(page.total);
      devCounters.setLibraryValue('lastTrackQueryDurationMs', performance.now() - started);
    })();
    inFlight.current.set(offset, request);
    try { await request; }
    finally { if (version === generation.current) inFlight.current.delete(offset); }
  }, [params]);

  const loadTracks = useCallback(async () => {
    const version = ++generation.current;
    pageCache.current = new Map();
    inFlight.current = new Map();
    setPages(new Map());
    setTotalMatches(0);
    setQueryRevision(version);
    setLoadError(null);
    setIsLoading(true);
    devCounters.incLibrary('loadTracksCount');
    try {
      await Promise.all([
        requestPage(0, version),
        TauriAPI.getLibraryOverview(params).then(value => { if (version === generation.current) setOverview(value); }),
      ]);
    } catch (error) {
      if (version === generation.current) setLoadError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally { if (version === generation.current) setIsLoading(false); }
  }, [params, requestPage]);

  const loadRange = useCallback((start: number, stop: number) => {
    const version = generation.current;
    const first = Math.floor(start / LIBRARY_PAGE_SIZE) * LIBRARY_PAGE_SIZE;
    const last = Math.min(totalMatches - 1, stop + 30);
    for (let offset = first; offset <= last; offset += LIBRARY_PAGE_SIZE) {
      void requestPage(offset, version).catch(error => {
        if (version === generation.current) setLoadError(String(error));
      });
    }
  }, [requestPage, totalMatches]);

  const loadAllFolders = useCallback(async () => {
    devCounters.incLibrary('loadAllFoldersCount');
    const folders = await TauriAPI.getAllFolders();
    setLibraryFolders(folders.map(([id, path, name, dateAdded]) => ({ id, path, name, dateAdded })));
  }, []);

  useEffect(() => { void loadTracks().catch(() => {}); }, [loadTracks]);
  useEffect(() => { void loadAllFolders().catch(error => showError(String(error))); }, [loadAllFolders, showError]);
  useEffect(() => () => { generation.current++; }, []);

  const rows = useMemo(() => {
    const result = new Array<Track>(totalMatches);
    for (const [offset, page] of pages) page.forEach((track, index) => { if (offset + index < totalMatches) result[offset + index] = track; });
    return result;
  }, [pages, totalMatches]);
  const tracks = useMemo(() => rows.filter(Boolean), [rows]);

  const addFolder = useCallback(async (selectedPath?: string): Promise<AddFolderResult | null> => {
    const path = selectedPath ?? await TauriAPI.selectFolder();
    if (!path) return null;
    const existing = libraryFolders.find(folder => folder.path.toLowerCase() === path.toLowerCase());
    return { path, newFolder: existing ?? { id: '', path, name: path.split(/[\\/]/).pop() || path, dateAdded: Date.now() } };
  }, [libraryFolders]);

  const removeFolder = useCallback(async (id: string, path: string) => {
    await TauriAPI.stopFolderWatch(path);
    await TauriAPI.removeFolder(id, path);
    await Promise.all([loadTracks(), loadAllFolders()]);
  }, [loadTracks, loadAllFolders]);
  const removeTrack = useCallback(async (id: string) => {
    await TauriAPI.removeTrack(id);
    await loadTracks();
  }, [loadTracks]);

  return { tracks, rows, totalMatches, overview, isLoading, loadError, queryRevision, libraryFolders,
    loadTracks, refreshTracks: loadTracks, loadAllTracks: loadTracks, loadAllFolders, loadRange, addFolder, removeFolder, removeTrack };
}
