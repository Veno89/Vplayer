import { TauriAPI } from './TauriAPI';
import { devCounters } from '../utils/devCounters';

interface QueueItem {
  trackId: string;
  trackPath: string;
  resolve: (data: string | null) => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
}

const MAX_FAILED_CACHE_SIZE = 1000;

class AlbumArtLoaderService {
  private inFlight = new Map<string, Promise<string | null>>();
  private queue: QueueItem[] = [];
  private activeCount = 0;
  private maxConcurrent = 4;
  private failedSet = new Set<string>();

  private updateQueueMetrics() {
    const depth = this.queue.length;
    const currentCounters = devCounters.counters;
    
    // We don't have a specific set value method for depth, so we'll just track max
    if (depth > currentCounters.albumArt.maxQueueDepth) {
      // In a real app we might expose a setAlbumArtValue method, but for now we can mutate internal state via a hack,
      // or better: add a method in devCounters.ts. Wait, I didn't add setAlbumArtValue.
      // I'll add a helper to track max queue depth manually here.
    }
    
    // Actually, devCounters has no setAlbumArtValue, only incAlbumArt.
    // Let's assume we just want to track max queue depth.
  }

  async loadArt(trackId: string, trackPath: string, signal?: AbortSignal): Promise<string | null> {
    if (signal?.aborted) {
      devCounters.incAlbumArt('requestsCancelledWhileQueued');
      throw new Error('Aborted');
    }

    // Retry/failure suppression: If we already know it failed or has no art, return fast
    if (this.failedSet.has(trackId)) {
      devCounters.incAlbumArt('requestsSkippedDueToFailedCache');
      return null;
    }

    // Deduplication: If already in flight, return the existing promise
    if (this.inFlight.has(trackId)) {
      devCounters.incAlbumArt('requestsDeduplicated');
      return this.inFlight.get(trackId)!;
    }

    const promise = new Promise<string | null>((resolve, reject) => {
      this.queue.push({ trackId, trackPath, resolve, reject, signal });
      devCounters.incAlbumArt('requestsQueued');
      devCounters.setAlbumArtValue('currentQueueDepth', this.queue.length);
      
      const currentMax = devCounters.counters.albumArt.maxQueueDepth;
      if (this.queue.length > currentMax) {
        devCounters.setAlbumArtValue('maxQueueDepth', this.queue.length);
      }

      this.processQueue();
    });

    this.inFlight.set(trackId, promise);
    return promise;
  }

  private addFailedCache(trackId: string) {
    this.failedSet.add(trackId);
    if (this.failedSet.size > MAX_FAILED_CACHE_SIZE) {
      const firstKey = this.failedSet.keys().next().value;
      if (firstKey) this.failedSet.delete(firstKey);
    }
  }

  private async processQueue() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift()!;
    devCounters.setAlbumArtValue('currentQueueDepth', this.queue.length);
    
    if (item.signal?.aborted) {
      devCounters.incAlbumArt('requestsCancelledWhileQueued');
      this.inFlight.delete(item.trackId);
      item.reject(new Error('Aborted'));
      this.processQueue();
      return;
    }

    this.activeCount++;
    devCounters.updateAlbumArtMaxConcurrency(this.activeCount);
    devCounters.incAlbumArt('requestsStarted');

    try {
      const data = await TauriAPI.extractAndCacheAlbumArt(item.trackId, item.trackPath);
      
      if (!data) {
        this.addFailedCache(item.trackId);
      }
      
      devCounters.incAlbumArt('requestsCompleted');
      item.resolve(data);
    } catch (err) {
      devCounters.incAlbumArt('requestsFailed');
      this.addFailedCache(item.trackId);
      item.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.inFlight.delete(item.trackId);
      this.activeCount--;
      this.processQueue();
    }
  }

  // Clear caches for maintenance if needed
  clearFailedCache() {
    this.failedSet.clear();
  }
}

export const AlbumArtLoader = new AlbumArtLoaderService();
