/**
 * MusicBrainz API Service
 * 
 * Handles all interactions with the MusicBrainz API (musicbrainz.org/ws/2)
 * Implements rate limiting (1 request/second) and caching.
 * 
 * @see https://musicbrainz.org/doc/MusicBrainz_API
 */

const MB_BASE_URL = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'VPlayer/0.6.2 (https://github.com/veno/vplayer)';
const RATE_LIMIT_MS = 1100; // Slightly over 1 second to be safe

// Storage keys for persistent caching
const STORAGE_KEYS = {
  ARTIST_CACHE: 'vplayer_mb_artist_cache',
  DISCOGRAPHY_CACHE: 'vplayer_mb_discography_cache',
  LAST_REQUEST_TIME: 'vplayer_mb_last_request',
};

/**
 * Artist search result from MusicBrainz
 * @typedef {Object} MBArtistResult
 * @property {string} id - MusicBrainz Artist ID (MBID)
 * @property {string} name - Artist name
 * @property {string} [sortName] - Sort name
 * @property {string} [type] - Artist type (Person, Group, etc.)
 * @property {string} [country] - Country code
 * @property {string} [disambiguation] - Disambiguation text
 * @property {number} score - Search match score (0-100)
 */

/**
 * Release group (album) from MusicBrainz
 * @typedef {Object} MBReleaseGroup
 * @property {string} id - Release group MBID
 * @property {string} title - Album title
 * @property {string} [firstReleaseDate] - First release date (YYYY or YYYY-MM-DD)
 * @property {string} primaryType - Primary type (Album, EP, Single, etc.)
 * @property {string[]} [secondaryTypes] - Secondary types (Compilation, Live, etc.)
 */

class MusicBrainzAPIService {
  constructor() {
    this.lastRequestTime = this._getLastRequestTime();
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.artistCache = this._loadCache(STORAGE_KEYS.ARTIST_CACHE);
    this.discographyCache = this._loadCache(STORAGE_KEYS.DISCOGRAPHY_CACHE);
  }

  /**
   * Load cache from localStorage
   * @private
   */
  _loadCache(key) {
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        const data = JSON.parse(cached);
        // Check cache expiration (7 days)
        const expirationTime = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - (data.timestamp || 0) < expirationTime) {
          return data.entries || {};
        }
      }
    } catch (err) {
      console.warn('[MusicBrainzAPI] Failed to load cache:', err);
    }
    return {};
  }

  /**
   * Save cache to localStorage
   * @private
   */
  _saveCache(key, entries) {
    try {
      const data = {
        timestamp: Date.now(),
        entries,
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.warn('[MusicBrainzAPI] Failed to save cache:', err);
    }
  }

  /**
   * Get last request time from storage
   * @private
   */
  _getLastRequestTime() {
    try {
      return parseInt(localStorage.getItem(STORAGE_KEYS.LAST_REQUEST_TIME) || '0', 10);
    } catch {
      return 0;
    }
  }

  /**
   * Update last request time in storage
   * @private
   */
  _setLastRequestTime(time) {
    this.lastRequestTime = time;
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_REQUEST_TIME, time.toString());
    } catch (err) {
      console.warn('[MusicBrainzAPI] Failed to save last request time:', err);
    }
  }

  /**
   * Rate-limited fetch wrapper
   * @private
   */
  async _rateLimitedFetch(url) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < RATE_LIMIT_MS) {
      const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this._setLastRequestTime(Date.now());

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 503) {
        // Rate limited - wait and retry
        console.warn('[MusicBrainzAPI] Rate limited, waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this._rateLimitedFetch(url);
      }
      throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search for artists by name
   * @param {string} artistName - The artist name to search for
   * @param {number} [limit=5] - Maximum number of results
   * @returns {Promise<MBArtistResult[]>}
   */
  async searchArtist(artistName, limit = 5) {
    if (!artistName || artistName.trim() === '') {
      return [];
    }

    const normalizedName = artistName.trim().toLowerCase();
    
    // Check cache first
    const cacheKey = `search:${normalizedName}`;
    if (this.artistCache[cacheKey]) {
      console.log('[MusicBrainzAPI] Artist search cache hit:', artistName);
      return this.artistCache[cacheKey];
    }

    const encodedQuery = encodeURIComponent(artistName);
    const url = `${MB_BASE_URL}/artist/?query=artist:${encodedQuery}&fmt=json&limit=${limit}`;

    try {
      const data = await this._rateLimitedFetch(url);
      
      const results = (data.artists || []).map(artist => ({
        id: artist.id,
        name: artist.name,
        sortName: artist['sort-name'],
        type: artist.type,
        country: artist.country,
        disambiguation: artist.disambiguation,
        score: artist.score || 0,
      }));

      // Cache results
      this.artistCache[cacheKey] = results;
      this._saveCache(STORAGE_KEYS.ARTIST_CACHE, this.artistCache);

      return results;
    } catch (err) {
      console.error('[MusicBrainzAPI] Artist search failed:', err);
      throw err;
    }
  }

  /**
   * Get artist by MBID
   * @param {string} mbid - MusicBrainz Artist ID
   * @returns {Promise<MBArtistResult|null>}
   */
  async getArtist(mbid) {
    if (!mbid) return null;

    // Check cache
    const cacheKey = `artist:${mbid}`;
    if (this.artistCache[cacheKey]) {
      return this.artistCache[cacheKey];
    }

    const url = `${MB_BASE_URL}/artist/${mbid}?fmt=json`;

    try {
      const data = await this._rateLimitedFetch(url);
      
      const result = {
        id: data.id,
        name: data.name,
        sortName: data['sort-name'],
        type: data.type,
        country: data.country,
        disambiguation: data.disambiguation,
        score: 100,
      };

      // Cache result
      this.artistCache[cacheKey] = result;
      this._saveCache(STORAGE_KEYS.ARTIST_CACHE, this.artistCache);

      return result;
    } catch (err) {
      console.error('[MusicBrainzAPI] Get artist failed:', err);
      return null;
    }
  }

  /**
   * Get release groups (albums) for an artist
   * @param {string} artistMbid - Artist MBID
   * @param {Object} [options] - Filter options
   * @param {boolean} [options.includeEPs=false] - Include EPs
   * @param {boolean} [options.includeLive=false] - Include live albums
   * @param {boolean} [options.includeCompilations=false] - Include compilations
   * @param {boolean} [options.includeBootlegs=false] - Include bootlegs
   * @param {boolean} [options.quickCheck=false] - Only fetch first page for quick validation
   * @returns {Promise<MBReleaseGroup[]>}
   */
  async getArtistDiscography(artistMbid, options = {}) {
    if (!artistMbid) return [];

    const {
      includeEPs = false,
      includeLive = false,
      includeCompilations = false,
      includeBootlegs = false,
      quickCheck = false,
    } = options;

    // Create cache key with options (exclude quickCheck from cache key)
    const optionsKey = `${includeEPs}-${includeLive}-${includeCompilations}-${includeBootlegs}`;
    const cacheKey = `discography:${artistMbid}:${optionsKey}`;
    
    // Don't use cache for quick checks, and don't cache quick check results
    if (!quickCheck && this.discographyCache[cacheKey]) {
      console.log('[MusicBrainzAPI] Discography cache hit:', artistMbid);
      return this.discographyCache[cacheKey];
    }

    // Fetch all release groups for artist, paginated
    const allReleaseGroups = [];
    let offset = 0;
    const limit = quickCheck ? 25 : 100; // Smaller limit for quick checks
    let hasMore = true;

    while (hasMore) {
      const url = `${MB_BASE_URL}/release-group?artist=${artistMbid}&type=album&fmt=json&limit=${limit}&offset=${offset}`;
      
      try {
        const data = await this._rateLimitedFetch(url);
        const releaseGroups = data['release-groups'] || [];
        
        allReleaseGroups.push(...releaseGroups);
        
        // For quick checks, only fetch first page
        if (quickCheck) {
          hasMore = false;
        } else {
          hasMore = offset + releaseGroups.length < (data['release-group-count'] || 0);
          offset += limit;

          // Safety limit to prevent infinite loops
          if (offset > 1000) break;
        }
      } catch (err) {
        console.error('[MusicBrainzAPI] Discography fetch failed:', err);
        break;
      }
    }

    // Filter and transform results
    const filteredAlbums = allReleaseGroups
      .filter(rg => {
        const primaryType = rg['primary-type'];
        const secondaryTypes = rg['secondary-types'] || [];

        // Filter by primary type
        if (primaryType !== 'Album' && primaryType !== 'EP') return false;
        if (primaryType === 'EP' && !includeEPs) return false;

        // Filter by secondary types
        if (secondaryTypes.includes('Compilation') && !includeCompilations) return false;
        if (secondaryTypes.includes('Live') && !includeLive) return false;
        if (secondaryTypes.includes('Bootleg') && !includeBootlegs) return false;

        return true;
      })
      .map(rg => ({
        id: rg.id,
        title: rg.title,
        firstReleaseDate: rg['first-release-date'],
        primaryType: rg['primary-type'],
        secondaryTypes: rg['secondary-types'] || [],
      }))
      .sort((a, b) => {
        // Sort by release date, oldest first
        const dateA = a.firstReleaseDate || '9999';
        const dateB = b.firstReleaseDate || '9999';
        return dateA.localeCompare(dateB);
      });

    // Cache results (but not quick checks)
    if (!quickCheck) {
      this.discographyCache[cacheKey] = filteredAlbums;
      this._saveCache(STORAGE_KEYS.DISCOGRAPHY_CACHE, this.discographyCache);
    }

    return filteredAlbums;
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.artistCache = {};
    this.discographyCache = {};
    localStorage.removeItem(STORAGE_KEYS.ARTIST_CACHE);
    localStorage.removeItem(STORAGE_KEYS.DISCOGRAPHY_CACHE);
    console.log('[MusicBrainzAPI] Cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return {
      artistCacheSize: Object.keys(this.artistCache).length,
      discographyCacheSize: Object.keys(this.discographyCache).length,
    };
  }
}

// Export singleton instance
export const MusicBrainzAPI = new MusicBrainzAPIService();
