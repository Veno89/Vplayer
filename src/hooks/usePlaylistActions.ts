import { useRef, useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { TauriAPI, type PlaylistRemoval } from '../services/TauriAPI';
import { useStore } from '../store/useStore';
import { nativeConfirm } from '../utils/nativeDialog';
import { useToast } from './useToast';
import type { PlaylistsAPI } from './usePlaylists';

export function usePlaylistActions(playlists: PlaylistsAPI) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [receipt, setReceipt] = useState<PlaylistRemoval | null>(null);
  const [nameDialog, setNameDialog] = useState<{
    kind: 'New' | 'Rename' | 'Duplicate';
    id?: string;
  } | null>(null);
  const [name, setName] = useState('');
  const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
    if (lock.current)
      throw new Error('Please wait for the current playlist operation.');
    lock.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const run = (action: () => Promise<unknown>) => {
    void exclusive(action).catch((error) => toast.showError(String(error)));
  };
  const promptName = (kind: 'New' | 'Rename' | 'Duplicate') => {
    const playlist = playlists.playlists.find(
      (item) => item.id === playlists.currentPlaylist
    );
    setName(
      kind === 'New'
        ? ''
        : `${playlist?.name ?? ''}${kind === 'Duplicate' ? ' (copy)' : ''}`
    );
    setNameDialog({ kind, id: playlist?.id });
  };
  const submitName = () =>
    run(async () => {
      if (!name.trim() || !nameDialog) return;
      if (nameDialog.kind === 'New')
        playlists.setCurrentPlaylist(
          await playlists.createPlaylist(name.trim())
        );
      else if (nameDialog.id && nameDialog.kind === 'Rename')
        await playlists.renamePlaylist(nameDialog.id, name.trim());
      else if (nameDialog.id)
        playlists.setCurrentPlaylist(
          await playlists.duplicatePlaylist(nameDialog.id, name.trim())
        );
      setNameDialog(null);
    });
  const remove = async (
    playlistId: string,
    ids: string[],
    missingOnly = false
  ) => {
    if (!ids.length) return false;
    if (
      !missingOnly &&
      useStore.getState().confirmBeforeDelete &&
      !(await nativeConfirm(
        `Remove ${ids.length} track${ids.length === 1 ? '' : 's'} from this playlist? Music files and library entries are kept.`,
        'Remove from playlist'
      ))
    )
      return false;
    const result = await playlists.removeTracksFromPlaylist(
      playlistId,
      ids,
      missingOnly
    );
    if (result.removed > 0) setReceipt(result);
    toast.showInfo(
      result.removed
        ? `Removed ${result.removed} track${result.removed === 1 ? '' : 's'} from playlist`
        : 'No entries removed. Files may have become available again.'
    );
    return true;
  };
  const undo = () =>
    run(async () => {
      if (!receipt) return;
      await playlists.undoRemoval(receipt);
      setReceipt(null);
      toast.showSuccess('Playlist entries restored');
    });
  const deletePlaylist = () =>
    run(async () => {
      const playlist = playlists.playlists.find(
        (item) => item.id === playlists.currentPlaylist
      );
      if (
        playlist &&
        (await nativeConfirm(
          `Delete playlist “${playlist.name}”? Your library and music files are kept.`,
          'Delete playlist'
        ))
      ) {
        await playlists.deletePlaylist(playlist.id);
        if (receipt?.playlistId === playlist.id) setReceipt(null);
      }
    });
  const importPlaylist = () =>
    run(async () => {
      const path = await open({
        multiple: false,
        filters: [{ name: 'M3U playlist', extensions: ['m3u', 'm3u8'] }],
      });
      if (typeof path !== 'string') return;
      const name =
        path
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.m3u8?$/i, '') || 'Imported playlist';
      await TauriAPI.importPlaylist(name, path);
      await playlists.loadPlaylists();
      toast.showSuccess(`Imported ${name}`);
    });
  const exportPlaylist = () =>
    run(async () => {
      const playlist = playlists.playlists.find(
        (item) => item.id === playlists.currentPlaylist
      );
      if (!playlist) return;
      const path = await save({
        defaultPath: `${playlist.name.replace(/[<>:"/\\|?*]/g, '_')}.m3u`,
        filters: [{ name: 'M3U playlist', extensions: ['m3u'] }],
      });
      if (path) {
        await TauriAPI.exportPlaylist(playlist.id, path);
        toast.showSuccess('Playlist exported');
      }
    });
  return {
    busy,
    run,
    receipt,
    setReceipt,
    nameDialog,
    setNameDialog,
    name,
    setName,
    promptName,
    submitName,
    remove,
    undo,
    deletePlaylist,
    importPlaylist,
    exportPlaylist,
    exclusive,
  };
}
