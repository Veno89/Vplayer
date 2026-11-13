import { LibraryBrowser } from '../components/library/LibraryBrowser';
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
  const tracksCount = library.overview?.totalTracks ?? 0;
  const currentColors = useCurrentColors();

  // ── Library action handlers ───────────────────────────────────────
  const handleAddFolder = useCallback(async () => {
    setAddingFolder(true);
    try {
      const result = await addFolder();
      if (result) toast.showSuccess('Folder added successfully');
    } catch (error) {
      toast.showError(`Failed to add folder: ${error instanceof Error ? error.message : String(error)}`);
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
    <div className="flex min-h-0 flex-col gap-3 h-full overflow-hidden" data-library-dragging={isDragging}>
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

      <LibraryBrowser onRemoveFolder={handleRemove} onAddFolder={handleAddFolder} />
    </div>
  );
}
