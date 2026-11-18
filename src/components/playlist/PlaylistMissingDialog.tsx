import { useEffect, useState } from 'react';
import {
  TauriAPI,
  type PlaylistCheckProgress,
  type PlaylistFileIssue,
} from '../../services/TauriAPI';
import { PlaylistDialog } from './PlaylistDialog';

export function PlaylistMissingDialog({
  playlistId,
  playlistName,
  onClose,
  onRemove,
}: {
  playlistId: string;
  playlistName: string;
  onClose: () => void;
  onRemove: (ids: string[]) => Promise<void>;
}) {
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const [issues, setIssues] = useState<PlaylistFileIssue[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const scanId = `playlist-${crypto.randomUUID()}`;
    let disposed = false;
    let running = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await TauriAPI.onEvent<PlaylistCheckProgress>(
          'playlist-check-progress',
          (event) => {
            if (!disposed && event.payload.scanId === scanId)
              setProgress(event.payload);
          }
        );
        if (disposed) return;
        running = true;
        const result = await TauriAPI.checkPlaylistTracks(playlistId, scanId);
        if (!disposed) {
          setIssues(result);
          setSelected(
            new Set(
              result
                .filter((issue) => issue.status === 'missing')
                .map((issue) => issue.trackId)
            )
          );
        }
      } catch (failure) {
        if (!disposed) setError(String(failure));
      } finally {
        // Also cancel after an IPC timeout; a timeout alone does not stop native work.
        if (running) void TauriAPI.cancelScan(scanId).catch(() => {});
        running = false;
        unlisten?.();
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
      if (running) void TauriAPI.cancelScan(scanId).catch(() => {});
    };
  }, [playlistId]);
  const missing = issues?.filter((issue) => issue.status === 'missing') ?? [];
  const unavailable = (issues?.length ?? 0) - missing.length;
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <PlaylistDialog title="Check for missing tracks" onClose={close} wide>
      <p className="mb-3 text-sm text-slate-400">{playlistName}</p>
      {!issues && !error && (
        <div role="status" className="space-y-3">
          <p>
            Checking files… {progress.checked} / {progress.total || '…'}
          </p>
          <progress
            className="w-full"
            value={progress.checked}
            max={Math.max(1, progress.total)}
          />
          <button onClick={close} className="rounded-sm bg-slate-700 px-3 py-2">
            Cancel check
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {issues && (
        <>
          <p role="status" className="mb-2 text-sm">
            {missing.length} missing · {unavailable} unavailable or inaccessible
          </p>
          {unavailable > 0 && (
            <p className="mb-3 text-sm text-amber-300">
              Unavailable folders, disconnected drives and access errors are
              kept. Reconnect the drive and run the check again.
            </p>
          )}
          <p className="mb-3 text-sm text-slate-400">
            Remove selected entries from this playlist only. Your library and
            music files are kept. Undo is available afterwards.
          </p>
          {missing.length > 0 && (
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.size === missing.length}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? new Set(missing.map((issue) => issue.trackId))
                      : new Set()
                  )
                }
              />
              Select all missing tracks
            </label>
          )}
          <div className="max-h-72 overflow-y-auto rounded-sm border border-slate-700">
            {issues.length === 0 && (
              <p className="p-3 text-sm">All tracks are available.</p>
            )}
            {issues.slice(page * 100, page * 100 + 100).map((issue) => (
              <label
                key={issue.trackId}
                className="flex items-start gap-2 border-b border-slate-800 p-2 text-sm"
              >
                <input
                  type="checkbox"
                  disabled={issue.status !== 'missing' || busy}
                  checked={selected.has(issue.trackId)}
                  onChange={(event) =>
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (event.target.checked) next.add(issue.trackId);
                      else next.delete(issue.trackId);
                      return next;
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block font-medium">{issue.title}</span>
                  <span className="block break-all text-xs text-slate-400">
                    {issue.path}
                  </span>
                  <span
                    className={`text-xs ${issue.status === 'missing' ? 'text-red-300' : 'text-amber-300'}`}
                  >
                    {issue.reason}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {issues.length > 100 && (
            <div className="my-2 flex items-center justify-between text-sm">
              <button
                disabled={page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} / {Math.ceil(issues.length / 100)}
              </span>
              <button
                disabled={(page + 1) * 100 >= issues.length}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              disabled={busy}
              onClick={close}
              className="rounded-sm bg-slate-700 px-3 py-2"
            >
              Close
            </button>
            <button
              disabled={busy || selected.size === 0}
              className="rounded-sm bg-red-900 px-3 py-2 disabled:opacity-40"
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await onRemove([...selected]);
                  onClose();
                } catch (failure) {
                  setError(String(failure));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Removing…' : `Remove ${selected.size} from playlist`}
            </button>
          </div>
        </>
      )}
    </PlaylistDialog>
  );
}
