import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerWindow } from './PlayerWindow';
import { useStore } from '../store/useStore';
import { TauriAPI } from '../services/TauriAPI';

const context = vi.hoisted(() => ({ playback: {} as Record<string, any>, audio: {} as Record<string, any> }));
vi.mock('../context/PlaybackContext', () => ({ usePlaybackContext: () => context.playback }));
vi.mock('../context/AudioEngineContext', () => ({ useAudioEngine: () => context.audio }));
const tracks = [{ id: 'a', name: 'filename.mp3', path: '/a.mp3', duration: 100, artist: 'Artist', album: 'Album', rating: 0 }];
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ ...useStore.getInitialState(), currentTrack: 0, currentTrackId: 'a', activePlaybackTracks: tracks, duration: 100, progress: 10 });
  context.audio = { audioBackendError: null, audioIsLoading: false };
  context.playback = {
    handleNextTrack: vi.fn(), handlePrevTrack: vi.fn(), handleSeek: vi.fn(), handleVolumeChange: vi.fn(), handleToggleMute: vi.fn(), togglePlay: vi.fn(),
    loadedTrackId: 'a', trackLoadError: null, retryCurrentTrack: vi.fn(), playbackTracks: tracks,
    library: { overview: { totalTracks: 100 }, setSearchQuery: vi.fn(), setAdvancedFilters: vi.fn(), refreshTracks: vi.fn().mockResolvedValue(undefined) },
    playlists: { currentPlaylist: 'p', playlistTracks: tracks, playlists: [{ id: 'p', name: 'My playlist' }] },
    toast: { showError: vi.fn() },
  };
});
afterEach(cleanup);
describe('Player actions and feedback', () => {
  it('shows filename fallback, source and actionable artist navigation', () => {
    render(<PlayerWindow />);
    expect(screen.getByRole('heading', { name: 'filename.mp3' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Artist' }));
    expect(context.playback.library.setAdvancedFilters).toHaveBeenCalledWith(expect.objectContaining({ artist: 'Artist', album: '' }));
    expect(useStore.getState().windows.library.visible).toBe(true);
    fireEvent.click(screen.getByTitle('Show current track in its source'));
    expect(useStore.getState().trackRevealRequest?.target).toBe('playlist');
  });
  it('shows loading and disables seeks until the selected track is loaded', () => {
    context.playback.loadedTrackId = 'previous';
    render(<PlayerWindow />);
    expect(screen.getByRole('status')).toHaveTextContent('Opening track');
    expect(screen.getByRole('button', { name: 'Opening track' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Playback position' })).toHaveAttribute('aria-disabled', 'true');
  });
  it('offers retry and opens Settings directly while keeping quick tools separate', () => {
    context.playback.trackLoadError = 'Music drive unavailable';
    render(<PlayerWindow />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry playback' })[0]);
    expect(context.playback.retryCurrentTrack).toHaveBeenCalledOnce();
    useStore.getState().updateWindow('options', { minimized: true, visible: false });
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(useStore.getState().windows.options).toMatchObject({ visible: true, minimized: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(useStore.getState().windows.options.visible).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Playback tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'All settings' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useStore.getState().windows.options.visible).toBe(true);
  });
  it('persists track ratings from the details dialog', async () => {
    const rate = vi.spyOn(TauriAPI, 'setTrackRating').mockResolvedValue(undefined);
    render(<PlayerWindow />);
    fireEvent.click(screen.getByRole('button', { name: 'Track details and actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set rating to 4 stars' }));
    await waitFor(() => expect(useStore.getState().activePlaybackTracks[0].rating).toBe(4));
    expect(rate).toHaveBeenCalledWith('a', 4);
  });
});
