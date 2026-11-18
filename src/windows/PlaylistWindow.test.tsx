import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistWindow } from './PlaylistWindow';
import { useStore } from '../store/useStore';
import { TauriAPI } from '../services/TauriAPI';
import { playlistColumns } from '../hooks/usePlaylistView';
import { useState } from 'react';
import { nativeConfirm } from '../utils/nativeDialog';

const fixture = vi.hoisted(() => ({
  context: {} as Record<string, any>,
  layout: true,
}));
vi.mock('../context/PlayerProvider', () => ({
  usePlaybackContext: () => fixture.context,
}));
vi.mock('../utils/nativeDialog', () => ({ nativeConfirm: vi.fn() }));
vi.mock('../components/AutoSizer', () => ({
  AutoSizer: ({ children }: any) => {
    const [ready, setReady] = useState(fixture.layout);
    return ready ? (
      children({ width: 900, height: 180 })
    ) : (
      <button onClick={() => setReady(true)}>Mount list</button>
    );
  },
}));
const tracks = [
  {
    id: 'b',
    name: 'b.mp3',
    title: 'Bravo',
    path: 'C:/Music/b.mp3',
    duration: 100,
  },
  {
    id: 'a',
    name: 'a.mp3',
    title: 'Alpha',
    path: 'C:/Music/a.mp3',
    duration: 120,
  },
  {
    id: 'c',
    name: 'c.mp3',
    title: 'Charlie',
    path: 'C:/Music/c.mp3',
    duration: 150,
  },
];
const scroll = vi.fn();
beforeEach(() => {
  vi.restoreAllMocks();
  fixture.layout = true;
  scroll.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: scroll,
  });
  useStore.setState({
    ...useStore.getInitialState(),
    currentTrackId: null,
    currentTrack: null,
    activePlaybackTracks: tracks,
    playing: false,
    confirmBeforeDelete: false,
  });
  fixture.context = {
    playlists: {
      currentPlaylist: 'p',
      playlistTracks: tracks,
      playlists: [{ id: 'p', name: 'Test playlist', createdAt: 0 }],
      isReady: true,
      isLoading: false,
      addingProgress: { isAdding: false },
      setCurrentPlaylist: vi.fn(),
      removeTracksFromPlaylist: vi.fn().mockResolvedValue({
        playlistId: 'p',
        before: ['b', 'a', 'c'],
        after: ['a', 'c'],
        removed: 1,
      }),
      refreshPlaylistTracks: vi.fn().mockResolvedValue(undefined),
      updateTrackRating: vi.fn().mockResolvedValue(undefined),
      undoRemoval: vi.fn().mockResolvedValue(undefined),
    },
    library: { refreshTracks: vi.fn().mockResolvedValue(undefined) },
    toast: { showError: vi.fn(), showInfo: vi.fn(), showSuccess: vi.fn() },
  };
});
afterEach(cleanup);
const row = (name: string) =>
  screen.getByText(name).closest<HTMLElement>('[role="option"]')!;

describe('Playlist workflows', () => {
  it.each(['Bravo', 'Alpha'])('rates %s without remounting, recentering or changing playback', async (name) => {
    useStore.setState({ currentTrackId: 'b', currentTrack: 0, playing: true, progress: 37 });
    fixture.context.playlists.updateTrackRating.mockImplementation(async (id: string, rating: number) => {
      fixture.context.playlists.playlistTracks = tracks.map(track => track.id === id ? { ...track, rating } : track);
      useStore.getState().setActivePlaybackTracks(fixture.context.playlists.playlistTracks);
    });
    render(<PlaylistWindow />);
    const list = screen.getByRole('listbox');
    const scroller = list.querySelector('[role="presentation"]')!;
    scroller.scrollTop = 48;
    scroll.mockClear();
    const stars = within(row(name)).getByRole('button', { name: 'Set rating to 5 stars' });
    fireEvent.click(stars);
    expect(screen.queryByText('Updating playlist.')).not.toBeInTheDocument();
    await waitFor(() => expect(within(row(name)).getByRole('group', { name: 'Rating: 5 of 5 stars' })).toBeInTheDocument());
    expect(screen.getByRole('listbox')).toBe(list);
    expect(list.querySelector('[role="presentation"]')).toBe(scroller);
    expect(scroller.scrollTop).toBe(48);
    expect(scroll).not.toHaveBeenCalled();
    expect(fixture.context.playlists.refreshPlaylistTracks).not.toHaveBeenCalled();
    expect(fixture.context.library.refreshTracks).toHaveBeenCalledOnce();
    expect(useStore.getState()).toMatchObject({ currentTrackId: 'b', currentTrack: 0, playing: true, progress: 37 });
    fireEvent.doubleClick(stars);
    fireEvent.keyDown(stars, { key: 'Enter' });
    expect(useStore.getState().currentTrackId).toBe('b');
    fireEvent.keyDown(stars, { key: ' ' });
    expect(screen.queryByRole('region', { name: 'Playlist selection tools' })).not.toBeInTheDocument();
  });

  it('reports failed ratings without reloading the list or changing playback', async () => {
    fixture.context.playlists.updateTrackRating.mockRejectedValue(new Error('Could not save rating'));
    render(<PlaylistWindow />);
    const list = screen.getByRole('listbox');
    fireEvent.click(within(row('Alpha')).getByRole('button', { name: 'Set rating to 4 stars' }));
    await waitFor(() => expect(fixture.context.toast.showError).toHaveBeenCalledWith('Error: Could not save rating'));
    expect(screen.getByRole('listbox')).toBe(list);
    expect(within(row('Alpha')).getByRole('group', { name: 'Rating: 0 of 5 stars' })).toBeInTheDocument();
    expect(fixture.context.library.refreshTracks).not.toHaveBeenCalled();
    expect(useStore.getState().currentTrackId).toBeNull();
  });

  it('keeps selection controls closed during normal clicks, keyboard navigation and current-track jumps', async () => {
    useStore.setState({ currentTrackId: 'b', currentTrack: 0 });
    render(<PlaylistWindow />);
    fireEvent.click(row('Bravo'));
    expect(screen.getByRole('listbox')).toHaveFocus();
    fireEvent.click(row('Alpha'), { ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('listbox'), { ctrlKey: true, key: 'a' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: ' ' });
    expect(row('Alpha')).toHaveAttribute('aria-selected', 'false');
    expect(
      screen.queryByRole('region', { name: 'Playlist selection tools' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Select Alpha' })
    ).not.toBeInTheDocument();
    scroll.mockClear();
    fireEvent.click(
      screen.getByRole('button', { name: 'Jump to current track' })
    );
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(
      screen.queryByRole('region', { name: 'Playlist selection tools' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Selection tools' })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(useStore.getState().currentTrackId).toBe('a');
    expect(useStore.getState().playing).toBe(true);
  });

  it('opens checkboxes and bulk actions only from the selection tool, and clears them on Done or toggle off', () => {
    render(<PlaylistWindow />);
    const selection = screen.getByRole('button', { name: 'Selection tools' });
    fireEvent.click(selection);
    expect(selection).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Select Bravo' })
    ).toBeInTheDocument();
    fireEvent.click(row('Bravo'));
    fireEvent.click(row('Alpha'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.doubleClick(row('Bravo'));
    expect(useStore.getState().playing).toBe(false);
    expect(useStore.getState().queue).toEqual([]);
    fireEvent.click(row('Bravo'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));
    expect(useStore.getState().queue.map((track) => track.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(selection).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.queryByRole('region', { name: 'Playlist selection tools' })
    ).not.toBeInTheDocument();
    fireEvent.click(row('Alpha'));
    expect(row('Alpha')).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(selection);
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    fireEvent.click(row('Bravo'));
    fireEvent.click(selection);
    fireEvent.click(selection);
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('closes options on outside clicks inside a window and when the trigger is clicked again', () => {
    render(
      <div
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <PlaylistWindow />
      </div>
    );
    const trigger = screen.getByRole('button', { name: 'Playlist actions' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(
      screen.getByRole('textbox', { name: 'Search playlist' })
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.pointerDown(trigger);
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('can deselect by clicking again, using the checkbox, pressing Escape or clicking empty space', () => {
    useStore.setState({ currentTrackId: 'b', currentTrack: 0 });
    render(<PlaylistWindow />);
    fireEvent.click(screen.getByRole('button', { name: 'Selection tools' }));
    fireEvent.click(row('Bravo'));
    expect(row('Bravo')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('listbox')).toHaveFocus();
    fireEvent.click(row('Bravo'));
    expect(row('Bravo')).toHaveAttribute('aria-selected', 'false');
    expect(row('Bravo')).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', { name: 'Clear selection' })
    ).toBeDisabled();
    fireEvent.click(row('Bravo'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Deselect Bravo' }));
    expect(row('Bravo')).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(row('Bravo'));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(row('Bravo')).toHaveAttribute('aria-selected', 'false');
    expect(
      screen.getByRole('button', { name: 'Selection tools' })
    ).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Selection tools' }));
    fireEvent.click(row('Bravo'));
    fireEvent.click(screen.getByLabelText('Playlist panel'));
    expect(row('Bravo')).toHaveAttribute('aria-selected', 'false');
    expect(useStore.getState().currentTrackId).toBe('b');
    expect(useStore.getState().playing).toBe(false);
  });

  it('uses one icon-only toolbar, keeps only the plus creation action, and explains colored follow state', () => {
    useStore.setState({ currentTrackId: 'b', currentTrack: 0 });
    render(<PlaylistWindow />);
    const toolbar = screen.getByRole('group', { name: 'Playlist tools' });
    expect(toolbar.querySelectorAll('button')).toHaveLength(5);
    const follow = screen.getByRole('button', { name: 'Follow playback' });
    expect(follow.textContent).toBe('');
    expect(follow).toHaveStyle({ color: '#4ade80' });
    fireEvent.mouseEnter(follow.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Follow playback: On.'
    );
    fireEvent.click(follow);
    expect(follow).toHaveAttribute('aria-pressed', 'false');
    expect(follow).toHaveStyle({ color: '#f87171' });
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Follow playback: Off.'
    );
    fireEvent.mouseLeave(follow.parentElement!);
    const jump = screen.getByRole('button', { name: 'Jump to current track' });
    fireEvent.mouseEnter(jump.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Jump to the currently playing track'
    );
    fireEvent.mouseLeave(jump.parentElement!);
    fireEvent.click(screen.getByRole('button', { name: 'Playlist actions' }));
    expect(
      screen.queryByRole('menuitem', { name: /New playlist/ })
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'New playlist' }));
    expect(
      screen.getByRole('dialog', { name: 'New playlist' })
    ).toBeInTheDocument();
  });
  it('confirms playlist deletion even when track-removal confirmations are disabled', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    fixture.context.playlists.deletePlaylist = remove;
    vi.mocked(nativeConfirm).mockResolvedValue(false);
    render(<PlaylistWindow />);
    fireEvent.click(screen.getByRole('button', { name: 'Playlist actions' }));
    fireEvent.click(screen.getByText('Delete playlist…'));
    await waitFor(() => expect(nativeConfirm).toHaveBeenCalled());
    expect(remove).not.toHaveBeenCalled();
    vi.mocked(nativeConfirm).mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Playlist actions' }));
    fireEvent.click(screen.getByText('Delete playlist…'));
    await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('p'));
  });
  it('follows a restored track after delayed list mounting, reopening, and enabling follow', async () => {
    fixture.layout = false;
    useStore.setState({ currentTrackId: 'c', currentTrack: 2 });
    const view = render(<PlaylistWindow />);
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mount list' }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    view.unmount();
    scroll.mockClear();
    fixture.layout = true;
    render(<PlaylistWindow />);
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Follow playback' }));
    scroll.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Follow playback' }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });

  it('keeps selected identities across sorting and filtering, and removes them in one action with Undo', async () => {
    render(<PlaylistWindow />);
    fireEvent.click(screen.getByRole('button', { name: 'Selection tools' }));
    fireEvent.click(row('Bravo'));
    expect(useStore.getState().playing).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Sort by title' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search playlist' }), {
      target: { value: 'Alpha' },
    });
    await waitFor(() =>
      expect(screen.queryByText('Bravo')).not.toBeInTheDocument()
    );
    expect(screen.getByText('1 selected (1 hidden)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(
        fixture.context.playlists.removeTracksFromPlaylist
      ).toHaveBeenCalledExactlyOnceWith('p', ['b'], false)
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(fixture.context.playlists.undoRemoval).toHaveBeenCalledOnce()
    );
  });

  it('plays matches in the full playlist and lets Play results explicitly narrow the source', async () => {
    render(<PlaylistWindow />);
    const search = screen.getByRole('textbox', { name: 'Search playlist' });
    expect(search).not.toHaveAttribute('placeholder');
    fireEvent.change(search, { target: { value: 'Alpha' } });
    await waitFor(() =>
      expect(screen.queryByText('Bravo')).not.toBeInTheDocument()
    );
    fireEvent.click(row('Alpha'));
    expect(useStore.getState().currentTrackId).toBe('a');
    expect(
      useStore.getState().activePlaybackTracks.map((track) => track.id)
    ).toEqual(['b', 'a', 'c']);
    expect(useStore.getState().playing).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Play results' }));
    expect(
      useStore.getState().activePlaybackTracks.map((track) => track.id)
    ).toEqual(['a']);
  });

  it.each(['enqueue', 'playNext'] as const)(
    'plays single and double clicks without queuing when the old double-click preference is %s',
    async (action) => {
      useStore.setState({ doubleClickAction: action });
      render(<PlaylistWindow />);
      fireEvent.click(row('Alpha'));
      expect(useStore.getState().currentTrackId).toBe('a');
      expect(useStore.getState().playing).toBe(true);
      fireEvent.doubleClick(row('Alpha'));
      expect(useStore.getState().queue).toEqual([]);
      act(() => useStore.getState().setPlaying(false));
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
      expect(useStore.getState().playing).toBe(true);
      act(() => useStore.getState().setPlaying(false));
      fireEvent.contextMenu(row('Bravo'));
      fireEvent.click(screen.getByText('Play Now'));
      expect(useStore.getState().currentTrackId).toBe('b');
      expect(useStore.getState().playing).toBe(true);
    }
  );

  it('resumes a paused current track on click without resetting its position', () => {
    useStore.setState({
      currentTrackId: 'a',
      currentTrack: 1,
      progress: 37,
      playing: false,
    });
    render(<PlaylistWindow />);
    fireEvent.click(row('Alpha'));
    expect(useStore.getState().playing).toBe(true);
    expect(useStore.getState().progress).toBe(37);
    expect(
      screen.queryByRole('region', { name: 'Playlist selection tools' })
    ).not.toBeInTheDocument();
  });

  it('keeps right-click queue actions separate from playback', () => {
    render(<PlaylistWindow />);
    fireEvent.contextMenu(row('Bravo'));
    expect(useStore.getState().playing).toBe(false);
    expect(useStore.getState().currentTrackId).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to Queue' }));
    expect(useStore.getState().queue.map((track) => track.id)).toEqual(['b']);
    expect(useStore.getState().playing).toBe(false);
    expect(useStore.getState().currentTrackId).toBeNull();
  });

  it('reveals a track hidden by search and provides local search keyboard shortcuts', async () => {
    useStore.setState({ currentTrackId: 'b', currentTrack: 0 });
    render(<PlaylistWindow />);
    const search = screen.getByRole('textbox', { name: 'Search playlist' });
    fireEvent.keyDown(screen.getByLabelText('Playlist panel'), {
      ctrlKey: true,
      key: 'f',
    });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'Alpha' } });
    await screen.findByText('Current track is hidden by search.');
    fireEvent.click(
      screen.getByRole('button', { name: 'Reveal current track' })
    );
    await screen.findByText('Bravo');
    expect(search).toHaveValue('');
    fireEvent.change(search, { target: { value: 'text' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
  });

  it('disables drag reordering in filtered or sorted views and adapts columns to panel width', async () => {
    render(<PlaylistWindow />);
    expect(row('Bravo')).toHaveAttribute('draggable', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Sort by title' }));
    expect(row('Bravo')).toHaveAttribute('draggable', 'false');
    fireEvent.click(screen.getByText('Original order'));
    expect(row('Bravo')).toHaveAttribute('draggable', 'true');
    expect(playlistColumns(400, {}, true, true)).toMatchObject({
      showAlbum: false,
      showRating: false,
      showArtist: false,
    });
    expect(playlistColumns(900, {}, true, true)).toMatchObject({
      showAlbum: true,
      showRating: true,
      showArtist: true,
    });
  });
});
