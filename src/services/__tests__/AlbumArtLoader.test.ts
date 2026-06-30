import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlbumArtLoader } from '../AlbumArtLoader';
import { TauriAPI } from '../TauriAPI';
import { devCounters } from '../../utils/devCounters';

// Mock TauriAPI
vi.mock('../TauriAPI', () => ({
  TauriAPI: {
    extractAndCacheAlbumArt: vi.fn(),
  },
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('AlbumArtLoader', () => {
  beforeEach(() => {
    AlbumArtLoader.clearFailedCache();
    vi.clearAllMocks();
  });

  it('limits concurrency to maxConcurrentRequests (4)', async () => {
    vi.mocked(TauriAPI.extractAndCacheAlbumArt).mockImplementation(async () => {
      await sleep(50);
      return 'base64data';
    });

    const initialCompleted = devCounters.counters.albumArt.requestsCompleted;
    const initialQueued = devCounters.counters.albumArt.requestsQueued;
    
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(AlbumArtLoader.loadArt(`track-${i}`, `/path/to/track-${i}.mp3`));
    }

    await sleep(10);
    
    expect(devCounters.counters.albumArt.maxConcurrentRequests).toBeLessThanOrEqual(4);
    
    await Promise.all(promises);
    expect(devCounters.counters.albumArt.requestsCompleted - initialCompleted).toBe(10);
    expect(devCounters.counters.albumArt.requestsQueued - initialQueued).toBe(10);
  });

  it('deduplicates concurrent requests for the same track', async () => {
    vi.mocked(TauriAPI.extractAndCacheAlbumArt).mockImplementation(async () => {
      await sleep(10);
      return 'data';
    });

    const initialDedupe = devCounters.counters.albumArt.requestsDeduplicated;

    const p1 = AlbumArtLoader.loadArt('dedupe-track', '/path');
    const p2 = AlbumArtLoader.loadArt('dedupe-track', '/path');

    await Promise.all([p1, p2]);

    expect(TauriAPI.extractAndCacheAlbumArt).toHaveBeenCalledTimes(1);
    expect(devCounters.counters.albumArt.requestsDeduplicated - initialDedupe).toBe(1);
  });

  it('cancels queued requests if AbortSignal is aborted', async () => {
    const controller = new AbortController();
    
    vi.mocked(TauriAPI.extractAndCacheAlbumArt).mockImplementation(async () => {
      await sleep(50);
      return 'data';
    });
    
    AlbumArtLoader.loadArt('b1', '/b1');
    AlbumArtLoader.loadArt('b2', '/b2');
    AlbumArtLoader.loadArt('b3', '/b3');
    AlbumArtLoader.loadArt('b4', '/b4');

    const initialCancelled = devCounters.counters.albumArt.requestsCancelledWhileQueued;

    const p5 = AlbumArtLoader.loadArt('b5', '/b5', controller.signal);
    controller.abort();

    await expect(p5).rejects.toThrow('Aborted');
    expect(devCounters.counters.albumArt.requestsCancelledWhileQueued - initialCancelled).toBe(1);
  });

  it('suppresses requests that hit the failedCache', async () => {
    vi.mocked(TauriAPI.extractAndCacheAlbumArt).mockResolvedValueOnce(null);

    const p1 = await AlbumArtLoader.loadArt('fail-track', '/fail');
    expect(p1).toBeNull();
    expect(TauriAPI.extractAndCacheAlbumArt).toHaveBeenCalledTimes(1);

    const initialSkipped = devCounters.counters.albumArt.requestsSkippedDueToFailedCache;

    const p2 = await AlbumArtLoader.loadArt('fail-track', '/fail');
    expect(p2).toBeNull();
    expect(TauriAPI.extractAndCacheAlbumArt).toHaveBeenCalledTimes(1); 
    expect(devCounters.counters.albumArt.requestsSkippedDueToFailedCache - initialSkipped).toBe(1);
  });
});
