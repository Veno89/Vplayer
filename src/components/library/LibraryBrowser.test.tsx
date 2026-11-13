import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryBrowser } from './LibraryBrowser';
import { EMPTY_LIBRARY_FILTERS } from '../../hooks/library/useLibraryFilters';
import { useStore } from '../../store/useStore';

const mocks = vi.hoisted(() => ({ library: {} as any, playlists: { playlists: [], addTracksToPlaylist: vi.fn() },
  toast: { showError: vi.fn(), showInfo: vi.fn(), showSuccess: vi.fn() },
  fullTracks: vi.fn(), selectedTracks: vi.fn(), facets: vi.fn().mockResolvedValue([]) }));
vi.mock('../../context/PlaybackContext', () => ({ usePlaybackContext: () => ({ library: mocks.library, playlists: mocks.playlists, toast: mocks.toast }) }));
vi.mock('../../services/TauriAPI', () => ({ TauriAPI: { getFilteredTracks: mocks.fullTracks, getSelectedLibraryTracks: mocks.selectedTracks, getLibraryFacets: mocks.facets } }));
vi.mock('../AutoSizer', () => ({ AutoSizer: ({ children }: any) => children({ height: 400, width: 650 }) }));

const tracks = [
  { id: 'one', path: 'F:/Music/one.mp3', name: 'one.mp3', title: 'One', duration: 60 },
  { id: 'two', path: 'F:/Music/two.mp3', name: 'two.mp3', title: 'Two', duration: 90 },
];
const renderBrowser = () => render(<LibraryBrowser onRemoveFolder={vi.fn()} onAddFolder={vi.fn()} />);

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ queue: [], currentTrack: null, currentTrackId: null, activePlaybackTracks: [], librarySavedViews: [] });
  mocks.library = {
    rows: tracks, tracks, totalMatches: 2, queryRevision: 1, activeParams: { sortBy: 'album', sortDesc: false },
    overview: { totalTracks: 4464, matchingTracks: 2, folders: [{ id: 'root', name: 'Music', path: 'F:/Music', totalTracks: 4464, matchingTracks: 2, availability: 'offline', lastSuccess: 1000, failed: 4, firstError: 'Access denied', accessError: null }] },
    libraryFolders: [{ id: 'root', name: 'Music', path: 'F:/Music', dateAdded: 1 }],
    searchQuery: '', advancedFilters: { ...EMPTY_LIBRARY_FILTERS, format: 'mp3', playCountMax: '0', folderId: 'root' },
    sortBy: 'album', sortOrder: 'asc', isLoading: false, isScanning: false, loadError: null,
    setSearchQuery: vi.fn(), setAdvancedFilters: vi.fn(), setSortBy: vi.fn(), setSortOrder: vi.fn(),
    loadRange: vi.fn(), refreshTracks: vi.fn().mockResolvedValue(undefined), refreshFolders: vi.fn().mockResolvedValue(0), scanFolder: vi.fn(),
  };
  mocks.fullTracks.mockResolvedValue(tracks); mocks.selectedTracks.mockResolvedValue(tracks);
});

describe('Library browser', () => {
  it('keeps collection totals separate from matches and forwards every advanced field', async () => {
    renderBrowser();
    expect(screen.getByText(/2 matches of/)).toHaveTextContent(/2 matches of 4\D?464 tracks/);
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Filters' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Artist' }), { target: { value: 'Band' } });
    expect(mocks.library.setAdvancedFilters).toHaveBeenLastCalledWith(expect.objectContaining({ artist: 'Band', format: 'mp3', playCountMax: '0', folderId: 'root' }));
    expect(screen.getByRole('region', { name: 'Advanced library filters' })).toHaveClass('absolute');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Advanced library filters' })).not.toBeInTheDocument();
  });

  it('plays through the existing playback source when a library row is double clicked', async () => {
    renderBrowser();
    fireEvent.doubleClick(screen.getByTitle('Two - Unknown Artist'));
    await waitFor(() => expect(useStore.getState().currentTrackId).toBe('two'));
    expect(useStore.getState().activePlaybackTracks).toEqual(tracks);
    expect(useStore.getState().playing).toBe(true);
  });

  it('keeps the clicked track identity when catalogue ordering changes before playback', async () => {
    mocks.fullTracks.mockResolvedValue([tracks[1], tracks[0]]);
    renderBrowser();
    fireEvent.doubleClick(screen.getByTitle('Two - Unknown Artist'));
    await waitFor(() => expect(useStore.getState().currentTrackId).toBe('two'));
    expect(useStore.getState().currentTrack).toBe(0);
  });

  it('resolves all selected indices through SQLite even when rows are not cached', async () => {
    mocks.library.rows = new Array(2); mocks.library.rows[0] = tracks[0];
    renderBrowser();
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Track list' }), { key: 'a', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Queue' }));
    await waitFor(() => expect(mocks.selectedTracks).toHaveBeenCalledWith(mocks.library.activeParams, [0, 1]));
    await waitFor(() => expect(useStore.getState().queue).toEqual(tracks));
  });

  it('shows persistent offline diagnostics and prevents rescanning the offline folder', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    expect(screen.getByText(/Drive disconnected or folder missing/)).toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rescan / retry' })).toBeDisabled();
  });

  it('saves a view with its entire filter configuration', async () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Save library view' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Saved view name' }), { target: { value: 'Unplayed MP3s' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await act(async () => {});
    expect(useStore.getState().librarySavedViews[0]).toMatchObject({ name: 'Unplayed MP3s', filters: { format: 'mp3', playCountMax: '0', folderId: 'root' } });
  });
});
