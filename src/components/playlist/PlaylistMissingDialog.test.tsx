import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistMissingDialog } from './PlaylistMissingDialog';
import {
  TauriAPI,
  type PlaylistCheckProgress,
  type PlaylistFileIssue,
} from '../../services/TauriAPI';

const issues: PlaylistFileIssue[] = [
  {
    trackId: 'missing',
    title: 'Deleted song',
    path: 'E:/Music/deleted.mp3',
    status: 'missing',
    reason: 'File missing',
  },
  {
    trackId: 'offline',
    title: 'Offline song',
    path: 'F:/Music/offline.mp3',
    status: 'rootUnavailable',
    reason: 'Drive offline',
  },
  {
    trackId: 'denied',
    title: 'Locked song',
    path: 'E:/Music/locked.mp3',
    status: 'inaccessible',
    reason: 'Access denied',
  },
];
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(TauriAPI, 'cancelScan').mockResolvedValue(undefined);
});
afterEach(cleanup);
describe('Playlist missing-file review', () => {
  it('shows progress and previews missing, offline and access failures, removing only selected missing IDs', async () => {
    let progress: (event: {
      payload: PlaylistCheckProgress;
    }) => void = () => {};
    let finish: (issues: PlaylistFileIssue[]) => void = () => {};
    const unlisten = vi.fn();
    vi.spyOn(TauriAPI, 'onEvent').mockImplementation(
      async (_name, callback: any) => {
        progress = callback;
        return unlisten;
      }
    );
    const check = vi.spyOn(TauriAPI, 'checkPlaylistTracks').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const remove = vi.fn().mockResolvedValue(undefined),
      close = vi.fn();
    render(
      <PlaylistMissingDialog
        playlistId="p"
        playlistName="My playlist"
        onClose={close}
        onRemove={remove}
      />
    );
    await waitFor(() => expect(check).toHaveBeenCalledOnce());
    const scanId = check.mock.calls[0][1];
    act(() =>
      progress({ payload: { scanId: 'other', checked: 100, total: 100 } })
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0');
    act(() => progress({ payload: { scanId, checked: 2, total: 3 } }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '2');
    await act(async () => finish(issues));
    expect(
      screen.getByText('1 missing · 2 unavailable or inaccessible')
    ).toBeInTheDocument();
    expect(screen.getByText('F:/Music/offline.mp3')).toBeInTheDocument();
    const checks = screen.getAllByRole('checkbox');
    expect(
      checks.filter((element) => (element as HTMLInputElement).disabled)
    ).toHaveLength(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove 1 from playlist' })
    );
    await waitFor(() =>
      expect(remove).toHaveBeenCalledExactlyOnceWith(['missing'])
    );
    expect(close).toHaveBeenCalledOnce();
    expect(unlisten).toHaveBeenCalled();
  });

  it('cancels an active check and removes its listener when closed', async () => {
    const unlisten = vi.fn();
    vi.spyOn(TauriAPI, 'onEvent').mockResolvedValue(unlisten);
    let finish: (issues: PlaylistFileIssue[]) => void = () => {};
    const check = vi.spyOn(TauriAPI, 'checkPlaylistTracks').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = render(
      <PlaylistMissingDialog
        playlistId="p"
        playlistName="Playlist"
        onClose={() => {}}
        onRemove={vi.fn()}
      />
    );
    await waitFor(() => expect(check).toHaveBeenCalledOnce());
    view.unmount();
    expect(TauriAPI.cancelScan).toHaveBeenCalledWith(check.mock.calls[0][1]);
    expect(unlisten).toHaveBeenCalled();
    await act(async () => finish([]));
  });
});
