import { useState, useEffect, useRef, useCallback } from 'react';
import { TauriAPI } from '../../services/TauriAPI';
import { EVENTS } from '../../utils/constants';
import { useStore } from '../../store/useStore';
import { useToast } from '../useToast';

interface LibraryFolder { id: string; path: string; name: string; dateAdded: number; }
interface LibraryScannerParams { libraryFolders: LibraryFolder[]; loadAllTracks: () => Promise<void>; loadAllFolders?: () => Promise<void>; }
export interface LibraryScannerAPI {
  isScanning: boolean; scanProgress: number; scanCurrent: number; scanTotal: number; scanCurrentFile: string;
  refreshFolders: () => Promise<number>; scanNewFolder: (path: string) => Promise<void>; cancelScan: () => Promise<void>;
}
const EMPTY_PROGRESS = { current: 0, total: 0, current_file: '' };

export function useLibraryScanner({ libraryFolders, loadAllTracks, loadAllFolders }: LibraryScannerParams): LibraryScannerAPI {
  const autoScan = useStore(state => state.autoScanOnStartup);
  const watchChanges = useStore(state => state.watchFolderChanges);
  const { showError, showWarning } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const active = useRef(false);
  const scanId = useRef<string | null>(null);
  const cancelled = useRef(false);
  const autoScanned = useRef(false);
  const pendingRoots = useRef(new Set<string>());
  const runRef = useRef<(paths: string[]) => Promise<number>>(async () => 0);
  const mounted = useRef(true);
  const pathsKey = JSON.stringify(libraryFolders.map(folder => folder.path));

  const run = useCallback(async (paths: string[]) => {
    if (active.current) throw new Error('A library scan is already running');
    active.current = true; cancelled.current = false;
    scanId.current = crypto.randomUUID();
    setIsScanning(true); setProgress(EMPTY_PROGRESS);
    let imported = 0;
    const errors: string[] = [];
    let wasCancelled = false;
    try {
      for (const path of paths) {
        if (cancelled.current || !mounted.current) break;
        try {
          const tracks = await TauriAPI.scanFolder(path, scanId.current);
          imported += tracks.length;
          if (watchChanges) await TauriAPI.startFolderWatch(path);
        } catch (error) { if (!cancelled.current) errors.push(path + ': ' + String(error)); }
      }
    } finally {
      wasCancelled = cancelled.current;
      try { await Promise.all([loadAllTracks(), loadAllFolders?.()]); }
      catch (error) { errors.push(String(error)); }
      active.current = false; scanId.current = null;
      if (mounted.current) { setIsScanning(false); setProgress(EMPTY_PROGRESS); }
      if (mounted.current && pendingRoots.current.size > 0) {
        const pending = Array.from(pendingRoots.current); pendingRoots.current.clear();
        queueMicrotask(() => { if (mounted.current) void runRef.current(pending).catch(error => showError(String(error))); });
      }
    }
    if (wasCancelled) throw new Error('Scan cancelled');
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return imported;
  }, [loadAllTracks, loadAllFolders, watchChanges, showError]);
  runRef.current = run;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; cancelled.current = true;
      if (scanId.current) void TauriAPI.cancelScan(scanId.current).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const paths: string[] = JSON.parse(pathsKey);
    let disposed = false;
    void (async () => {
      for (const path of paths) {
        try { if (watchChanges) await TauriAPI.startFolderWatch(path); else await TauriAPI.stopFolderWatch(path); }
        catch (error) { console.warn('Folder watch unavailable:', path, error); }
      }
      if (!disposed && autoScan && paths.length > 0 && !autoScanned.current) {
        autoScanned.current = true;
        if (!active.current) void runRef.current(paths).catch(error => showError(String(error)));
      }
    })();
    return () => { disposed = true; };
  }, [pathsKey, autoScan, watchChanges, showError]);

  useEffect(() => {
    const subscriptions = [
      TauriAPI.onEvent<typeof EMPTY_PROGRESS>(EVENTS.SCAN_PROGRESS, event => { if (active.current) setProgress(event.payload); }),
      TauriAPI.onEvent<number>(EVENTS.SCAN_TOTAL, event => { if (active.current) setProgress({ ...EMPTY_PROGRESS, total: event.payload }); }),
      TauriAPI.onEvent<{ total: number; imported: number; failed: number }>(EVENTS.SCAN_SUMMARY, event => {
        if (event.payload.failed > 0) showWarning('Scan read ' + event.payload.imported + ' of ' + event.payload.total + ' files. Open Library → Folders for persistent failure details.', 10000);
      }),
      TauriAPI.onEvent<string>('folder-changed', event => {
        if (active.current) pendingRoots.current.add(event.payload);
        else void runRef.current([event.payload]).catch(error => showError(String(error)));
      }),
    ];
    return () => { void Promise.allSettled(subscriptions).then(results => results.forEach(result => { if (result.status === 'fulfilled') result.value(); })); };
  }, [showError, showWarning]);

  const refreshFolders = useCallback(() => run(JSON.parse(pathsKey)), [run, pathsKey]);
  const scanNewFolder = useCallback(async (path: string) => { await run([path]); }, [run]);
  const cancelScan = useCallback(async () => {
    cancelled.current = true;
    if (scanId.current) await TauriAPI.cancelScan(scanId.current);
  }, []);
  return { isScanning, scanCurrent: progress.current, scanTotal: progress.total, scanCurrentFile: progress.current_file,
    scanProgress: progress.total > 0 ? Math.round(progress.current / progress.total * 100) : 0,
    refreshFolders, scanNewFolder, cancelScan };
}
