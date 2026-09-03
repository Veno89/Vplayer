import React, { useState, useCallback, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import { FolderOpen, FolderPlus, Trash2, X, Loader, AlertCircle, FileQuestion, Copy, ShieldAlert, ChevronDown, ChevronRight, Music, GripVertical } from 'lucide-react';
import { AdvancedSearch } from '../components/AdvancedSearch';
import { TauriAPI } from '../services/TauriAPI';
import { formatDuration } from '../utils/formatters';
import { nativeConfirm, nativeError } from '../utils/nativeDialog';
import { StarRating } from '../components/StarRating';
import { List, type RowComponentProps } from 'react-window';
import { notifyDragStart, notifyDragEnd } from '../hooks/useAutoResize';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { usePlayerContext } from '../context/PlayerProvider';
import type { Track } from '../types';
import type { LibraryIntegrityReport, LibraryRepairResult, MissingFile } from '../services/TauriAPI';
import { isTrackWithinFolder, shouldStopPlaybackAfterFolderRemoval } from '../utils/libraryPaths';

interface VirtualTrackRowData {
  tracks: Track[];
  onTrackDragStart: ((data: Record<string, unknown>[]) => void) | null;
  onTrackDragEnd: (() => void) | null;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
}

const libraryTrackRowKey = (index: number, data: VirtualTrackRowData) => data.tracks[index]?.id ?? index;

interface VirtualFolderTrackListProps extends VirtualTrackRowData {
  label: string;
}

interface LibraryMaintenanceActionsProps {
  addingFolder: boolean;
  checkingMissing: boolean;
  missingProgress: { checked: number; total: number } | null;
  removingDuplicates: boolean;
  repairingLibrary: boolean;
  isScanning: boolean;
  scanProgress: number;
  orphanTracks: number;
  onAddFolder: () => void;
  onCheckMissing: () => void;
  onRemoveDuplicates: () => void;
  onRepairLibrary: () => void;
}

export function LibraryMaintenanceActions({
  addingFolder,
  checkingMissing,
  missingProgress,
  removingDuplicates,
  repairingLibrary,
  isScanning,
  scanProgress,
  orphanTracks,
  onAddFolder,
  onCheckMissing,
  onRemoveDuplicates,
  onRepairLibrary,
}: LibraryMaintenanceActionsProps) {
  const busy = addingFolder || checkingMissing || removingDuplicates || repairingLibrary || isScanning;
  const status = repairingLibrary
    ? 'Repairing library records...'
    : removingDuplicates
      ? 'Removing duplicate records...'
      : checkingMissing
        ? missingProgress
          ? `Checking missing files: ${missingProgress.checked} / ${missingProgress.total}`
          : 'Checking missing files...'
        : addingFolder || isScanning
          ? isScanning
            ? `Scanning folder: ${scanProgress}%`
            : 'Choosing a folder...'
          : null;
  const baseClass = 'inline-flex h-8 w-8 items-center justify-center rounded-sm border transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      {status && (
        <div
          role="status"
          aria-live="polite"
          className="flex min-w-0 items-center gap-1.5 rounded-sm border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-300"
        >
          <Loader className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
          <span className="truncate">{status}</span>
        </div>
      )}
      <div className="flex items-center gap-1" role="group" aria-label="Library maintenance">
        <button
          type="button"
          onMouseDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); onAddFolder(); }}
          disabled={busy}
          className={`${baseClass} border-blue-700/60 bg-blue-900/30 text-blue-300 hover:bg-blue-800/50`}
          aria-label="Add music folder"
          title="Add music folder"
        >
          <FolderPlus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onMouseDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); onCheckMissing(); }}
          disabled={busy}
          className={`${baseClass} border-orange-700/60 bg-orange-900/30 text-orange-300 hover:bg-orange-800/50`}
          aria-label="Check for missing files"
          title="Check for missing files"
        >
          <FileQuestion className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onMouseDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); onRemoveDuplicates(); }}
          disabled={busy}
          className={`${baseClass} border-purple-700/60 bg-purple-900/30 text-purple-300 hover:bg-purple-800/50`}
          aria-label="Remove duplicate library entries"
          title="Remove duplicate tracks and folders"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
        </button>
        {orphanTracks > 0 && (
          <button
            type="button"
            onMouseDown={event => event.stopPropagation()}
            onClick={event => { event.stopPropagation(); onRepairLibrary(); }}
            disabled={busy}
            className={`${baseClass} border-amber-700/60 bg-amber-900/30 text-amber-300 hover:bg-amber-800/50`}
            aria-label={`Repair ${orphanTracks} orphaned library records`}
            title={`Repair ${orphanTracks.toLocaleString()} orphaned library records (creates a database backup; audio files are untouched)`}
          >
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

// Virtual list row component for track rendering
const VirtualTrackRow = ({
  ariaAttributes,
  index,
  style,
  ...data
}: RowComponentProps<VirtualTrackRowData>) => {
  const { tracks, onTrackDragStart, onTrackDragEnd, setIsDragging } = data;
  const track = tracks[index];

  return (
    <div
      {...ariaAttributes}
      draggable
      onDragStart={(e) => {
        console.log('[LibraryWindow] Track drag start:', track.title);
        const trackData = [{
          id: track.id,
          path: track.path,
          title: track.title || track.name,
          artist: track.artist,
          album: track.album
        }];

        e.dataTransfer.setData('application/json', JSON.stringify(trackData));
        // Add fallback for Windows/WebView2
        e.dataTransfer.setData('text/plain', JSON.stringify(trackData));
        e.dataTransfer.effectAllowed = 'copy';
        console.log('[LibraryWindow] setData called, onTrackDragStart:', typeof onTrackDragStart);

        // Set drag image explicitly (helps with Tauri webview)
        const dragImg = document.createElement('div');
        dragImg.textContent = `${trackData.length} track(s)`;
        dragImg.style.position = 'absolute';
        dragImg.style.top = '-1000px';
        document.body.appendChild(dragImg);
        e.dataTransfer.setDragImage(dragImg, 0, 0);
        setTimeout(() => {
          try { document.body.removeChild(dragImg); } catch { /* already removed on unmount */ }
        }, 0);

        notifyDragStart(); // Prevent window resize during drag
        setIsDragging(true);
        if (onTrackDragStart) onTrackDragStart(trackData);
        console.log('[LibraryWindow] dragStart handler complete');
      }}
      onDragEnd={(e) => {
        console.log('[LibraryWindow] Track drag end');
        notifyDragEnd(); // Re-enable window resize
        setIsDragging(false);
        if (onTrackDragEnd) onTrackDragEnd();
      }}
      className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800/50 cursor-move transition-colors border-b border-slate-800"
      title="Drag to add to playlist"
      style={{
        ...style,
        userSelect: 'none',
        WebkitUserDrag: 'element',
        MozUserSelect: 'none',
        msUserSelect: 'none'
      } as React.CSSProperties}
    >
      <Music className="w-3 h-3 text-slate-500 shrink-0" />
      <span className="flex-1 truncate text-white">{track.title || track.name}</span>
      <span className="w-24 truncate text-slate-400">{track.artist || 'Unknown'}</span>
      <span className="w-20 truncate text-slate-500">{track.album || ''}</span>
      <span className="w-10 text-right text-slate-500">
        {track.duration ? formatDuration(track.duration) : ''}
      </span>
    </div>
  );
};

export function VirtualFolderTrackList({
  label,
  tracks,
  onTrackDragStart,
  onTrackDragEnd,
  setIsDragging,
}: VirtualFolderTrackListProps) {
  return (
    <List
      aria-label={label}
      overscanCount={5}
      rowComponent={VirtualTrackRow}
      rowCount={tracks.length}
      rowHeight={36}
      rowKey={libraryTrackRowKey}
      rowProps={{ tracks, onTrackDragStart, onTrackDragEnd, setIsDragging }}
      style={{
        height: Math.min(256, tracks.length * 36),
        width: '100%',
      }}
    />
  );
}

export function LibraryWindow() {
  // ── Store state (only fields that actually exist in the Zustand store) ──
  const setIsDraggingTracks = useStore(s => s.setIsDraggingTracks);
  const setCurrentTrack = useStore(s => s.setCurrentTrack);
  const setPlaying = useStore(s => s.setPlaying);
  const duplicateSensitivity = useStore(s => s.duplicateSensitivity);

  // ── Context / derived ─────────────────────────────────────────────
  const { library, toast } = usePlayerContext();
  const {
    tracks: allTracks,
    filteredTracks: tracks,
    libraryFolders,
    isScanning,
    scanProgress,
    scanCurrent,
    scanTotal,
    scanCurrentFile,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    advancedFilters,
    setAdvancedFilters,
    addFolder,
    removeFolder,
    refreshTracks,
    cancelScan,
  } = library;
  const tracksCount = allTracks?.length ?? 0;
  const currentColors = useCurrentColors();

  // ── Library action handlers ───────────────────────────────────────
  const handleAddFolder = useCallback(async () => {
    setAddingFolder(true);
    try {
      const result = await addFolder();
      if (result) toast.showSuccess('Folder added successfully');
    } catch {
      toast.showError('Failed to add folder');
    } finally {
      setAddingFolder(false);
    }
  }, [addFolder, toast]);

  const handleRefreshFolders = useCallback(async () => {
    await refreshTracks();
  }, [refreshTracks]);

  const handleRemoveFolder = useCallback(async (folderId: string, folderPath: string) => {
    try {
      const currentTrackBeforeRemoval = useStore.getState().getCurrentTrackData();
      await removeFolder(folderId, folderPath);
      toast.showSuccess('Folder removed successfully');

      if (currentTrackBeforeRemoval && isTrackWithinFolder(currentTrackBeforeRemoval.path, folderPath)) {
        try {
          const remainingTracks = await TauriAPI.getAllTracks();
          if (shouldStopPlaybackAfterFolderRemoval(currentTrackBeforeRemoval, folderPath, remainingTracks)) {
            setCurrentTrack(null);
            setPlaying(false);
          }
        } catch (verificationError) {
          console.error('Failed to verify playback after folder removal:', verificationError);
          setCurrentTrack(null);
          setPlaying(false);
          toast.showError('Folder removed, but playback was stopped because its track could not be verified');
        }
      }
    } catch { toast.showError('Failed to remove folder'); }
  }, [removeFolder, setCurrentTrack, setPlaying, toast]);

  // ── Drag callbacks ────────────────────────────────────────────────
  const onTrackDragStart = useCallback((data: Record<string, unknown>[]) => {
    setTimeout(() => setIsDraggingTracks(true), 0);
  }, [setIsDraggingTracks]);

  const onTrackDragEnd = useCallback(() => {
    setIsDraggingTracks(false);
  }, [setIsDraggingTracks]);
  const [removingFolder, setRemovingFolder] = useState<string | null>(null);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [missingFiles, setMissingFiles] = useState<MissingFile[]>([]);
  const [showMissingFiles, setShowMissingFiles] = useState(false);
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [missingProgress, setMissingProgress] = useState<{ checked: number; total: number } | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [removingDuplicates, setRemovingDuplicates] = useState(false);
  const [repairingLibrary, setRepairingLibrary] = useState(false);
  const [libraryIntegrity, setLibraryIntegrity] = useState<LibraryIntegrityReport | null>(null);
  const [repairNotice, setRepairNotice] = useState<LibraryRepairResult | null>(null);
  const [duplicateBackupPath, setDuplicateBackupPath] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { showSuccess, showError, showInfo } = useToast();

  useEffect(() => {
    let active = true;
    TauriAPI.getLibraryIntegrity()
      .then(report => { if (active) setLibraryIntegrity(report); })
      .catch(error => console.error('Failed to inspect library integrity:', error));
    return () => { active = false; };
  }, [libraryFolders.length, tracksCount]);

  // Memoize folder tracks calculations to prevent lag
  const folderTracksMap = React.useMemo(() => {
    const map = new Map<string, Track[]>();
    libraryFolders.forEach(folder => {
      map.set(folder.id, tracks.filter((track: Track) => isTrackWithinFolder(track.path, folder.path)));
    });
    return map;
  }, [libraryFolders, tracks]);

  // Check for missing files
  const handleCheckMissingFiles = async () => {
    setCheckingMissing(true);
    setMissingProgress(null);
    let unlisten: (() => void) | undefined;
    try {
      // Subscribe to progress events emitted every 500 tracks.
      unlisten = await TauriAPI.onEvent<[number, number]>('missing-files-progress', (e) => {
        const [checked, total] = e.payload;
        setMissingProgress({ checked, total });
      });
      const missing = await TauriAPI.checkMissingFiles();
      setMissingFiles(missing);
      setShowMissingFiles(true);
      if (missing.length === 0) showInfo('No missing files found');
    } catch (err) {
      console.error('Failed to check missing files:', err);
      await nativeError('Failed to check for missing files');
    } finally {
      unlisten?.();
      setMissingProgress(null);
      setCheckingMissing(false);
    }
  };

  // Handle folder removal with confirmation
  const handleRemove = async (folderId: string, folderPath: string, folderName: string) => {
    const shouldConfirm = useStore.getState().confirmBeforeDelete;
    if (shouldConfirm) {
      let confirmed = false;
      try {
        confirmed = await nativeConfirm(`Remove "${folderName}" and all its tracks from library?`);
      } catch {
        // Dialog error — treat as cancelled
        return;
      }
      if (!confirmed) return;
    }

    setRemovingFolder(folderId);
    try {
      await handleRemoveFolder(folderId, folderPath);
    } catch (err) {
      await nativeError(`Failed to remove folder: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRemovingFolder(null);
    }
  };

  // Toggle sort order
  const handleSortClick = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleRemoveDuplicates = async () => {
    setRemovingDuplicates(true);
    try {
      const groups = await TauriAPI.findDuplicates(duplicateSensitivity);
      const duplicateCount = groups.reduce((total, group) => total + Math.max(0, group.length - 1), 0);
      if (duplicateCount === 0) {
        showInfo('No duplicates found');
        return;
      }

      const confirmed = await nativeConfirm(
        `Remove ${duplicateCount.toLocaleString()} duplicate library record(s) using ${duplicateSensitivity} matching?\n\n` +
        'VPlayer will create a recoverable database snapshot first and preserve playlist memberships on the retained copies. ' +
        'Your audio files will not be changed or deleted.'
      );
      if (!confirmed) return;

      const result = await TauriAPI.removeLibraryDuplicates(duplicateSensitivity);
      if (result.removedFolders > 0 || result.removedTracks > 0) {
        const parts = [];
        if (result.removedFolders > 0) parts.push(`${result.removedFolders} duplicate folder record(s)`);
        if (result.removedTracks > 0) parts.push(`${result.removedTracks} duplicate track record(s)`);
        const message = `Removed ${parts.join(' and ')}`;
        setDuplicateBackupPath(result.backupPath);
        showSuccess(message);
        await handleRefreshFolders();
      } else {
        showInfo('No duplicates found');
      }
    } catch (error) {
      console.error('Failed to remove duplicates:', error);
      showError('Failed to remove duplicates');
    } finally {
      setRemovingDuplicates(false);
    }
  };

  const handleRepairLibrary = async () => {
    const orphanTracks = libraryIntegrity?.orphanTracks ?? 0;
    if (orphanTracks === 0) return;

    let confirmed = false;
    try {
      confirmed = await nativeConfirm(
        `Repair ${orphanTracks.toLocaleString()} orphaned library record(s)?\n\n` +
        'VPlayer will create a recoverable database snapshot first, then remove only records outside your registered music folders. ' +
        'Playlist links to those records will also be removed. Your audio files will not be changed or deleted.'
      );
    } catch {
      return;
    }
    if (!confirmed) return;

    setRepairingLibrary(true);
    try {
      const result = await TauriAPI.repairLibraryIntegrity();
      setRepairNotice(result);
      setLibraryIntegrity(result.after);
      await handleRefreshFolders();
      showSuccess(`Repaired ${result.removedTracks} orphaned library record(s)`);
    } catch (error) {
      console.error('Failed to repair library integrity:', error);
      showError('Library repair failed; see the detailed error before trying again');
      await nativeError(`Failed to repair library: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRepairingLibrary(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full" data-library-dragging={isDragging}>
      {/* Header with Actions */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <FolderOpen className={`w-5 h-5 ${currentColors.accent}`} />
          Music Library
        </h3>
        <LibraryMaintenanceActions
          addingFolder={addingFolder}
          checkingMissing={checkingMissing}
          missingProgress={missingProgress}
          removingDuplicates={removingDuplicates}
          repairingLibrary={repairingLibrary}
          isScanning={isScanning}
          scanProgress={scanProgress}
          orphanTracks={libraryIntegrity?.orphanTracks ?? 0}
          onAddFolder={handleAddFolder}
          onCheckMissing={handleCheckMissingFiles}
          onRemoveDuplicates={handleRemoveDuplicates}
          onRepairLibrary={handleRepairLibrary}
        />
      </div>

      {repairNotice && (
        <div className="flex items-start gap-2 rounded-sm border border-emerald-700/50 bg-emerald-900/20 p-2 text-xs text-emerald-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              Removed {repairNotice.removedTracks.toLocaleString()} orphaned library record(s). No audio files were changed or deleted.
            </div>
            <div className="mt-1 truncate text-emerald-300/80" title={repairNotice.backupPath}>
              Recoverable database snapshot: {repairNotice.backupPath}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRepairNotice(null)}
            className="text-emerald-300/70 hover:text-white"
            aria-label="Dismiss library repair details"
            title="Dismiss"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {duplicateBackupPath && (
        <div className="flex items-start gap-2 rounded-sm border border-purple-700/50 bg-purple-900/20 p-2 text-xs text-purple-200">
          <Copy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Duplicate records removed. Playlist memberships were preserved and no audio files were changed.</div>
            <div className="mt-1 truncate text-purple-300/80" title={duplicateBackupPath}>
              Recoverable database snapshot: {duplicateBackupPath}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDuplicateBackupPath(null)}
            className="text-purple-300/70 hover:text-white"
            aria-label="Dismiss duplicate cleanup details"
            title="Dismiss"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Missing Files Alert */}
      {showMissingFiles && missingFiles.length > 0 && (
        <div className="bg-orange-900/20 border border-orange-700/50 rounded-sm p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              <AlertCircle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-orange-300 text-sm font-medium mb-1">
                  {missingFiles.length} Missing File{missingFiles.length > 1 ? 's' : ''} Found
                </div>
                <div className="text-orange-400 text-xs mb-2">
                  These tracks can't be found at their original locations. You may want to remove them or relocate them.
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {missingFiles.slice(0, 10).map(([trackId, path]) => (
                    <div key={trackId} className="text-xs text-slate-400 truncate" title={path}>
                      • {path}
                    </div>
                  ))}
                  {missingFiles.length > 10 && (
                    <div className="text-xs text-slate-500">
                      ... and {missingFiles.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowMissingFiles(false)}
              className="text-slate-400 hover:text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Advanced Search */}
      <AdvancedSearch
        filters={{ query: searchQuery, ...advancedFilters }}
        onFiltersChange={(filters) => {
          setSearchQuery(String(filters.query || ''));
          setAdvancedFilters({
            genre: filters.genre || '',
            yearFrom: filters.yearFrom || '',
            yearTo: filters.yearTo || '',
            minRating: filters.minRating || 0,
            durationFrom: filters.durationFrom || '',
            durationTo: filters.durationTo || '',
            folderId: filters.folderId || ''
          });
        }}
        showAdvanced={showAdvancedSearch}
        onToggleAdvanced={() => setShowAdvancedSearch(!showAdvancedSearch)}
      />

      {/* Folder Filter and Sort Controls */}
      <div className="flex items-center justify-between gap-3">
        {/* Folder Filter */}
        {libraryFolders.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Folder:</span>
            <select
              value={advancedFilters.folderId || ''}
              onChange={(e) => setAdvancedFilters({ ...advancedFilters, folderId: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              className="px-2 py-1 bg-slate-800 text-white text-xs rounded-sm border border-slate-700 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="">All Folders</option>
              {libraryFolders.map(folder => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort Controls */}
        <div className="flex gap-2 text-xs" onMouseDown={e => e.stopPropagation()}>
          <span className="text-slate-400">Sort:</span>
          {['title', 'artist', 'album', 'dateAdded'].map(field => (
            <button
              key={field}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                handleSortClick(field);
              }}
              className={`px-2 py-1 rounded-sm transition-colors ${sortBy === field
                ? `${currentColors.primary} text-white`
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
            >
              {field === 'dateAdded' ? 'Date' : field.charAt(0).toUpperCase() + field.slice(1)}
              {sortBy === field && (
                <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Scanning Progress */}
      {isScanning && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-sm p-3 space-y-2">
          <div className="flex items-center gap-3">
            <Loader className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-blue-300 text-sm font-medium mb-1">
                Scanning folders... {scanProgress}%
              </div>
              <div className="text-blue-400 text-xs truncate" title={scanCurrentFile}>
                {scanCurrent > 0 && scanTotal > 0 ? (
                  <>
                    {scanCurrent} / {scanTotal} files
                    {scanCurrentFile && ` • ${scanCurrentFile}`}
                  </>
                ) : (
                  'Initializing...'
                )}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                cancelScan();
              }}
              className="px-3 py-1 bg-blue-700/50 hover:bg-red-600 text-white text-xs rounded-sm transition-colors shrink-0 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-blue-500 to-cyan-500 transition-all duration-300 ease-out"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Folders List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {libraryFolders.length === 0 && !isScanning ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <AlertCircle className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm mb-2">No folders added yet</p>
            <p className="text-slate-500 text-xs mb-4">
              Click "Add Folder" to start building your library
            </p>
          </div>
        ) : (
          libraryFolders.map(folder => {
            const folderTracks = folderTracksMap.get(folder.id) || [];
            const isRemoving = removingFolder === folder.id;
            const isExpanded = expandedFolder === folder.id;

            return (
              <div
                key={folder.id}
                className="bg-slate-800/50 border border-slate-700 rounded-sm overflow-hidden"
              >
                <div className="p-3 hover:bg-slate-800 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                        if ((e.target as HTMLElement).closest('button')) return;
                        if ((e.target as HTMLElement).closest('[draggable="true"]')) return;
                        setExpandedFolder(isExpanded ? null : folder.id);
                      }}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          draggable={!isScanning && !isRemoving}
                          onDragStart={(e) => {
                            console.log('[LibraryWindow] Folder drag start:', folder.name, 'tracks:', folderTracks.length);
                            const folderTracksData = folderTracks.map(t => ({
                              id: t.id,
                              path: t.path,
                              title: t.title || t.name,
                              artist: t.artist,
                              album: t.album
                            }));

                            // Set data FIRST
                            e.dataTransfer.setData('application/json', JSON.stringify(folderTracksData));
                            // Add fallback for Windows/WebView2
                            e.dataTransfer.setData('text/plain', JSON.stringify(folderTracksData));
                            e.dataTransfer.effectAllowed = 'copy';
                            console.log('[LibraryWindow] Folder setData called, onTrackDragStart:', typeof onTrackDragStart);

                            notifyDragStart(); // Prevent window resize during drag
                            if (onTrackDragStart) onTrackDragStart(folderTracksData);
                            console.log('[LibraryWindow] Folder dragStart handler complete');
                          }}
                          onDragEnd={(e) => {
                            console.log('[LibraryWindow] Folder drag end');
                            notifyDragEnd(); // Re-enable window resize
                            if (onTrackDragEnd) onTrackDragEnd();
                          }}
                          className="cursor-move p-1 hover:bg-slate-700/50 rounded-sm"
                          title="Drag to add all tracks to playlist"
                        >
                          <GripVertical className="w-4 h-4 text-slate-500" />
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <FolderOpen className={`w-4 h-4 ${currentColors.accent} shrink-0`} />
                        <h4 className="text-white text-sm font-medium truncate" title={folder.name}>
                          {folder.name}
                        </h4>
                      </div>
                      <div className="text-xs text-slate-500 truncate mb-1 ml-8" title={folder.path}>
                        {folder.path}
                      </div>
                      <div className="flex gap-4 text-xs text-slate-400 ml-8">
                        <span>{folderTracks.length} tracks</span>
                        <span>Added {new Date(folder.dateAdded).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        handleRemove(folder.id, folder.path, folder.name);
                      }}
                      disabled={isScanning || isRemoving}
                      className="p-1.5 bg-red-700/20 hover:bg-red-700/40 text-red-400 rounded-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      title="Remove Folder"
                    >
                      {isRemoving ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Track List */}
                {isExpanded && folderTracks.length > 0 && (
                  <div className="border-t border-slate-700 bg-slate-900/50">
                    <VirtualFolderTrackList
                      label={`Tracks in ${folder.name}`}
                      tracks={folderTracks}
                      onTrackDragStart={onTrackDragStart}
                      onTrackDragEnd={onTrackDragEnd}
                      setIsDragging={setIsDragging}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Stats */}
      <div className="border-t border-slate-700 pt-3 flex justify-between text-xs text-slate-400">
        <span>{libraryFolders.length} folder{libraryFolders.length !== 1 ? 's' : ''}</span>
        <span>{tracksCount} track{tracksCount !== 1 ? 's' : ''}</span>
        {searchQuery && (
          <span className="text-cyan-400">
            {tracks.length} result{tracks.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
