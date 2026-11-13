import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryTab } from './LibraryTab';

const mocks = vi.hoisted(() => ({
  addFolder: vi.fn(),
  refreshFolders: vi.fn(),
  getAllFolders: vi.fn(),
  getAllTracks: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('../../context/PlayerProvider', () => ({
  usePlayerContext: () => ({
    library: { addFolder: mocks.addFolder, refreshFolders: mocks.refreshFolders },
    toast: { showError: mocks.showError },
  }),
}));

vi.mock('../../services/TauriAPI', () => ({
  TauriAPI: { getAllFolders: mocks.getAllFolders, getAllTracks: mocks.getAllTracks },
}));

describe('Settings library scanning', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAllFolders.mockResolvedValue([['music', 'F:\\Music', 'Music', 0]]);
    mocks.getAllTracks.mockResolvedValue([]);
    mocks.addFolder.mockResolvedValue(null);
    mocks.refreshFolders.mockResolvedValue(0);
  });

  it('rescans through the shared library and reloads persisted counts', async () => {
    render(<LibraryTab />);
    await screen.findByText('0 tracks');
    mocks.refreshFolders.mockImplementation(async () => {
      mocks.getAllTracks.mockResolvedValue([{ id: 'recovered', path: 'F:\\Music\\recovered.mp3' }]);
      return 1;
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }));

    await screen.findByText('1 tracks');
    expect(mocks.refreshFolders).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Rescan' })).toBeEnabled();
  });

  it('shows the underlying scan error when rescanning fails', async () => {
    mocks.refreshFolders.mockRejectedValue(new Error('Found 4000 audio files, but none could be read'));
    render(<LibraryTab />);
    await screen.findByText('0 tracks');

    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }));

    await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith(
      'Library scan failed: Found 4000 audio files, but none could be read',
    ));
    expect(screen.getByRole('button', { name: 'Rescan' })).toBeEnabled();
  });

  it('adds folders through the shared library and exposes detailed failures', async () => {
    mocks.addFolder.mockRejectedValue(new Error('Unable to scan folder: access denied'));
    render(<LibraryTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Folder' }));

    await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith(
      'Failed to add folder: Unable to scan folder: access denied',
    ));
    expect(mocks.addFolder).toHaveBeenCalledOnce();
  });
});
