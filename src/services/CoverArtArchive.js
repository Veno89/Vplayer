/**
 * Cover Art Archive API Service
 * 
 * Handles fetching album cover art from the Cover Art Archive (coverartarchive.org)
 * Works with MusicBrainz release group IDs.
 * 
 * @see https://musicbrainz.org/doc/Cover_Art_Archive/API
 */

const CAA_BASE_URL = 'https://coverartarchive.org';

// Storage key for cover art cache
const COVER_ART_CACHE_KEY = 'vplayer_caa_cache';

// Maximum cache size (in entries)
const MAX_CACHE_SIZE = 500;

/**
 * Cover art result
 * @typedef {Object} CoverArtResult
 * @property {string} releaseGroupId - MusicBrainz release group ID
 * @property {string} [thumbnailUrl] - Small thumbnail URL (250px)
 * @property {string} [smallUrl] - Small image URL (500px)
 * @property {string} [largeUrl] - Large image URL
 * @property {string} [imageUrl] - Full size image URL
 * @property {boolean} found - Whether cover art was found
 */

class CoverArtArchiveService {
  constructor() {
    this.cache = this._loadCache();
    this.pendingRequests = new Map(); // Prevent duplicate requests
  }

  /**
   * Load cache from localStorage
   * @private
   */
  _loadCache() {
    try {
      const cached = localStorage.getItem(COVER_ART_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        // Check cache expiration (30 days for cover art)
        const expirationTime = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - (data.timestamp || 0) < expirationTime) {
          return data.entries || {};
        }
      }
    } catch (err) {
      console.warn('[CoverArtArchive] Failed to load cache:', err);
    }
    return {};
  }

  /**
   * Save cache to localStorage
   * @private
   */
  _saveCache() {
    try {
      // Limit cache size
      const keys = Object.keys(this.cache);
      if (keys.length > MAX_CACHE_SIZE) {
        // Remove oldest entries (simple FIFO)
        const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE);
        toRemove.forEach(key => delete this.cache[key]);
      }

      const data = {
        timestamp: Date.now(),
        entries: this.cache,
      };
      localStorage.setItem(COVER_ART_CACHE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('[CoverArtArchive] Failed to save cache:', err);
    }
  }

  /**
   * Fetch cover art for a release group
   * @param {string} releaseGroupId - MusicBrainz release group ID
   * @returns {Promise<CoverArtResult>}
   */
  async getCoverArt(releaseGroupId) {
    if (!releaseGroupId) {
      return { releaseGroupId: '', found: false };
    }

    // Check cache
    if (this.cache[releaseGroupId]) {
      return this.cache[releaseGroupId];
    }

    // Check for pending request (deduplication)
    if (this.pendingRequests.has(releaseGroupId)) {
      return this.pendingRequests.get(releaseGroupId);
    }

    // Create promise for this request
    const requestPromise = this._fetchCoverArt(releaseGroupId);
    this.pendingRequests.set(releaseGroupId, requestPromise);

    try {
      const result = await requestPromise;
      
      // Cache result
      this.cache[releaseGroupId] = result;
      this._saveCache();

      return result;
    } finally {
      this.pendingRequests.delete(releaseGroupId);
    }
  }

  /**
   * Actually fetch cover art from API
   * @private
   */
  async _fetchCoverArt(releaseGroupId) {
    try {
      // First try to get front cover directly (most efficient)
      const frontUrl = `${CAA_BASE_URL}/release-group/${releaseGroupId}/front`;
      
      const response = await fetch(frontUrl, { method: 'HEAD' });
      
      if (response.ok || response.status === 307 || response.status === 302) {
        // Cover exists, construct URLs
        return {
          releaseGroupId,
          thumbnailUrl: `${CAA_BASE_URL}/release-group/${releaseGroupId}/front-250`,
          smallUrl: `${CAA_BASE_URL}/release-group/${releaseGroupId}/front-500`,
          largeUrl: `${CAA_BASE_URL}/release-group/${releaseGroupId}/front-1200`,
          imageUrl: `${CAA_BASE_URL}/release-group/${releaseGroupId}/front`,
          found: true,
        };
      }

      // No cover art found
      return {
        releaseGroupId,
        found: false,
      };
    } catch (err) {
      // Network error or timeout - treat as not found but don't cache
      console.warn('[CoverArtArchive] Failed to fetch cover art:', releaseGroupId, err);
      return {
        releaseGroupId,
        found: false,
      };
    }
  }

  /**
   * Batch fetch cover art for multiple release groups
   * Respects rate limits and returns a map of results
   * @param {string[]} releaseGroupIds - Array of release group IDs
   * @param {Function} [onProgress] - Progress callback (current, total)
   * @returns {Promise<Map<string, CoverArtResult>>}
   */
  async batchGetCoverArt(releaseGroupIds, onProgress) {
    const results = new Map();
    const uniqueIds = [...new Set(releaseGroupIds)];
    
    for (let i = 0; i < uniqueIds.length; i++) {
      const id = uniqueIds[i];
      const result = await this.getCoverArt(id);
      results.set(id, result);

      if (onProgress) {
        onProgress(i + 1, uniqueIds.length);
      }

      // Small delay between requests to be nice to the server
      if (i < uniqueIds.length - 1 && !this.cache[uniqueIds[i + 1]]) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Clear cover art cache
   */
  clearCache() {
    this.cache = {};
    localStorage.removeItem(COVER_ART_CACHE_KEY);
    console.log('[CoverArtArchive] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const entries = Object.values(this.cache);
    return {
      totalEntries: entries.length,
      foundCovers: entries.filter(e => e.found).length,
      missingCovers: entries.filter(e => !e.found).length,
    };
  }
}

// Export singleton instance
export const CoverArtArchive = new CoverArtArchiveService();
