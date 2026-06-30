import { renderHook, act } from '@testing-library/react';
import { useLibraryData } from '../useLibraryData';
import { TauriAPI } from '../../../services/TauriAPI';
import { devCounters } from '../../../utils/devCounters';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/TauriAPI', () => ({
  TauriAPI: {
    getTracksPage: vi.fn(),
    getFilteredTracks: vi.fn().mockResolvedValue([]),
    getAllTracks: vi.fn().mockResolvedValue([]),
    getAllFolders: vi.fn(),
    scanFolder: vi.fn(),
  },
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('useLibraryData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(TauriAPI.getAllFolders).mockResolvedValue([]);
  });

  it('ignores stale search results when query changes rapidly', async () => {
    let resolveFirst: any;
    const firstPromise = new Promise((r) => { resolveFirst = r; });
    
    vi.mocked(TauriAPI.getTracksPage)
      .mockReturnValueOnce(firstPromise as any)
      .mockResolvedValueOnce({
        tracks: [{ id: '2', name: 'Track 2', path: '/2.mp3', duration: 100 }],
        total: 1
      } as any);

    const { result, rerender } = renderHook(({ filter }) => useLibraryData(filter), {
      initialProps: { filter: { searchQuery: 'a' } }
    });

    // Wait a tick for the first fetch to start
    await act(async () => {
      await sleep(10);
    });

    const initialIgnored = devCounters.counters.library.staleSearchResultsIgnored;

    // Change query before first resolves
    rerender({ filter: { searchQuery: 'ab' } });

    // Resolve the first query now
    await act(async () => {
      resolveFirst({
        tracks: [{ id: '1', name: 'Track 1', path: '/1.mp3', duration: 100 }],
        total: 1
      });
      await sleep(10);
    });

    // It should have ignored the first response
    expect(devCounters.counters.library.staleSearchResultsIgnored - initialIgnored).toBeGreaterThan(0);
    expect(result.current.tracks.length).toBe(1);
    expect(result.current.tracks[0].id).toBe('2');
  });

  it('loads folders only once and not tied to search filter changes', async () => {
    const initialFolderCount = devCounters.counters.library.loadAllFoldersCount;
    
    const { rerender } = renderHook(({ filter }) => useLibraryData(filter), {
      initialProps: { filter: { searchQuery: '' } }
    });

    await act(async () => {
      await sleep(10);
    });

    const afterMount = devCounters.counters.library.loadAllFoldersCount;
    expect(afterMount - initialFolderCount).toBe(1);

    // Change filter multiple times
    rerender({ filter: { searchQuery: 'a' } });
    rerender({ filter: { searchQuery: 'ab' } });
    
    await act(async () => {
      await sleep(10);
    });

    // Still exactly 1 folder load
    expect(devCounters.counters.library.loadAllFoldersCount).toBe(afterMount);
  });
});
