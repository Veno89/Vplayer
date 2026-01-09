/**
 * Discography Matching Service
 * 
 * Handles matching logic between local library albums and MusicBrainz discography.
 * Implements normalization rules for accurate matching.
 */

/**
 * Album match status
 * @typedef {'present' | 'missing' | 'uncertain'} AlbumMatchStatus
 */

/**
 * Local album data
 * @typedef {Object} LocalAlbum
 * @property {string} name - Album name
 * @property {string} artist - Artist name
 * @property {number} trackCount - Number of tracks in library
 * @property {string[]} trackIds - Track IDs in library
 */

/**
 * Match result for an album
 * @typedef {Object} AlbumMatch
 * @property {string} mbReleaseGroupId - MusicBrainz release group ID
 * @property {string} mbTitle - MusicBrainz album title
 * @property {string} [mbFirstReleaseDate] - First release year
 * @property {string} mbPrimaryType - Album type (Album, EP)
 * @property {string[]} mbSecondaryTypes - Secondary types
 * @property {AlbumMatchStatus} status - Match status
 * @property {LocalAlbum|null} localAlbum - Local album if present
 * @property {number} matchConfidence - Match confidence 0-100
 * @property {string} [coverArtUrl] - Cover art URL if available
 */

/**
 * Artist discography result
 * @typedef {Object} ArtistDiscography
 * @property {string} mbArtistId - MusicBrainz artist ID
 * @property {string} artistName - Artist name
 * @property {string} [disambiguation] - Disambiguation text
 * @property {number} totalAlbums - Total albums in discography
 * @property {number} presentAlbums - Albums in local library
 * @property {number} missingAlbums - Missing albums
 * @property {number} uncertainAlbums - Uncertain matches
 * @property {AlbumMatch[]} albums - All album matches
 */

// Patterns to remove during normalization
const NORMALIZATION_PATTERNS = [
  /\(deluxe\s*(?:edition|version)?\)/gi,
  /\(remastered\s*(?:\d{4})?\)/gi,
  /\(expanded\s*(?:edition)?\)/gi,
  /\(anniversary\s*(?:edition)?\)/gi,
  /\(\d{4}\s*(?:remaster|edition|version)?\)/gi,
  /\[deluxe\s*(?:edition|version)?\]/gi,
  /\[remastered\s*(?:\d{4})?\]/gi,
  /\[expanded\s*(?:edition)?\]/gi,
  /\[\d{4}\s*(?:remaster|edition|version)?\]/gi,
  /\s*-\s*deluxe\s*(?:edition|version)?$/gi,
  /\s*-\s*remastered$/gi,
  /\s*-\s*expanded$/gi,
  /\s*\(\s*\)$/g, // Empty parentheses
  /\s*\[\s*\]$/g, // Empty brackets
];

// Common subtitle patterns
const SUBTITLE_PATTERNS = [
  /:\s*.+$/,  // After colon
  /\s+-\s+.+$/, // After dash
];

class DiscographyMatchingService {
  /**
   * Normalize a string for comparison
   * @param {string} str - String to normalize
   * @returns {string} Normalized string
   */
  normalizeString(str) {
    if (!str) return '';

    let normalized = str.toLowerCase().trim();

    // Remove common edition/remaster suffixes
    for (const pattern of NORMALIZATION_PATTERNS) {
      normalized = normalized.replace(pattern, '');
    }

    // Normalize punctuation and whitespace
    normalized = normalized
      .replace(/['']/g, "'")  // Smart quotes to regular
      .replace(/[""]/g, '"')  // Smart double quotes
      .replace(/[–—]/g, '-')  // Em/en dashes to hyphens
      .replace(/\s+/g, ' ')   // Multiple spaces to single
      .replace(/\s*&\s*/g, ' and ') // & to and
      .trim();

    return normalized;
  }

  /**
   * Calculate similarity between two normalized strings
   * Uses Levenshtein distance normalized to 0-100
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} Similarity score 0-100
   */
  calculateSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 100;

    const lenA = a.length;
    const lenB = b.length;
    
    // Quick length check
    if (Math.abs(lenA - lenB) > Math.max(lenA, lenB) * 0.5) {
      return 0;
    }

    // Levenshtein distance
    const matrix = [];
    for (let i = 0; i <= lenB; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= lenA; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= lenB; i++) {
      for (let j = 1; j <= lenA; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[lenB][lenA];
    const maxLen = Math.max(lenA, lenB);
    return Math.round((1 - distance / maxLen) * 100);
  }

  /**
   * Check if two album names match with confidence score
   * @param {string} localAlbum - Local album name
   * @param {string} mbAlbum - MusicBrainz album name
   * @returns {{ matches: boolean, confidence: number }}
   */
  matchAlbumNames(localAlbum, mbAlbum) {
    const normLocal = this.normalizeString(localAlbum);
    const normMb = this.normalizeString(mbAlbum);

    // Exact match after normalization
    if (normLocal === normMb) {
      return { matches: true, confidence: 100 };
    }

    // Check if one contains the other (for subtitle variations)
    if (normLocal.includes(normMb) || normMb.includes(normLocal)) {
      const shorter = normLocal.length < normMb.length ? normLocal : normMb;
      const longer = normLocal.length < normMb.length ? normMb : normLocal;
      const containmentRatio = shorter.length / longer.length;
      if (containmentRatio > 0.6) {
        return { matches: true, confidence: Math.round(containmentRatio * 95) };
      }
    }

    // Calculate string similarity
    const similarity = this.calculateSimilarity(normLocal, normMb);

    if (similarity >= 90) {
      return { matches: true, confidence: similarity };
    }

    if (similarity >= 75) {
      return { matches: false, confidence: similarity }; // Uncertain
    }

    return { matches: false, confidence: similarity };
  }

  /**
   * Extract unique artists from track list
   * @param {Object[]} tracks - Track objects with artist property
   * @returns {Map<string, { name: string, albumCount: number, albums: Map<string, LocalAlbum> }>}
   */
  extractArtistsFromTracks(tracks) {
    const artistsMap = new Map();

    for (const track of tracks) {
      const artistName = track.artist?.trim();
      if (!artistName || artistName.toLowerCase() === 'unknown artist') continue;

      const normalizedArtist = artistName.toLowerCase();

      if (!artistsMap.has(normalizedArtist)) {
        artistsMap.set(normalizedArtist, {
          name: artistName,
          albumCount: 0,
          albums: new Map(),
        });
      }

      const artistData = artistsMap.get(normalizedArtist);
      const albumName = track.album?.trim() || 'Unknown Album';
      const normalizedAlbum = albumName.toLowerCase();

      if (!artistData.albums.has(normalizedAlbum)) {
        artistData.albums.set(normalizedAlbum, {
          name: albumName,
          artist: artistName,
          trackCount: 0,
          trackIds: [],
        });
        artistData.albumCount++;
      }

      const albumData = artistData.albums.get(normalizedAlbum);
      albumData.trackCount++;
      albumData.trackIds.push(track.id);
    }

    return artistsMap;
  }

  /**
   * Match MusicBrainz discography against local library
   * @param {Object[]} mbAlbums - MusicBrainz release groups
   * @param {Map<string, LocalAlbum>} localAlbums - Local albums map
   * @returns {AlbumMatch[]}
   */
  matchDiscography(mbAlbums, localAlbums) {
    const results = [];
    const matchedLocalAlbums = new Set();

    for (const mbAlbum of mbAlbums) {
      let bestMatch = null;
      let bestConfidence = 0;

      for (const [key, localAlbum] of localAlbums) {
        if (matchedLocalAlbums.has(key)) continue;

        const { matches, confidence } = this.matchAlbumNames(
          localAlbum.name,
          mbAlbum.title
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = { key, localAlbum, matches };
        }
      }

      let status;
      let matchedLocal = null;

      if (bestMatch && bestMatch.matches && bestConfidence >= 90) {
        status = 'present';
        matchedLocal = bestMatch.localAlbum;
        matchedLocalAlbums.add(bestMatch.key);
      } else if (bestMatch && bestConfidence >= 75) {
        status = 'uncertain';
        matchedLocal = bestMatch.localAlbum;
        // Don't mark as matched so it can still be matched by another album
      } else {
        status = 'missing';
      }

      results.push({
        mbReleaseGroupId: mbAlbum.id,
        mbTitle: mbAlbum.title,
        mbFirstReleaseDate: mbAlbum.firstReleaseDate,
        mbPrimaryType: mbAlbum.primaryType,
        mbSecondaryTypes: mbAlbum.secondaryTypes || [],
        status,
        localAlbum: matchedLocal,
        matchConfidence: bestConfidence,
      });
    }

    return results;
  }

  /**
   * Get summary statistics from album matches
   * @param {AlbumMatch[]} matches - Array of album matches
   * @returns {{ total: number, present: number, missing: number, uncertain: number }}
   */
  getMatchSummary(matches) {
    return {
      total: matches.length,
      present: matches.filter(m => m.status === 'present').length,
      missing: matches.filter(m => m.status === 'missing').length,
      uncertain: matches.filter(m => m.status === 'uncertain').length,
    };
  }

  /**
   * Parse release year from MusicBrainz date string
   * @param {string} dateStr - Date string (YYYY or YYYY-MM-DD)
   * @returns {number|null}
   */
  parseReleaseYear(dateStr) {
    if (!dateStr) return null;
    const year = parseInt(dateStr.substring(0, 4), 10);
    return isNaN(year) ? null : year;
  }
}

// Export singleton instance
export const DiscographyMatcher = new DiscographyMatchingService();
