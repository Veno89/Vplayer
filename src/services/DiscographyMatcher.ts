/**
 * Discography Matching Service
 * 
 * Handles matching logic between local library albums and MusicBrainz discography.
 * Implements normalization rules for accurate matching.
 */

export type AlbumMatchStatus = 'present' | 'missing' | 'uncertain';

export interface LocalAlbum {
  name: string;
  artist: string;
  fullArtist?: string;
  trackCount: number;
  trackIds: string[];
}

export interface AlbumMatch {
  mbReleaseGroupId: string;
  mbTitle: string;
  mbFirstReleaseDate?: string;
  mbPrimaryType: string;
  mbSecondaryTypes: string[];
  status: AlbumMatchStatus;
  localAlbum: LocalAlbum | null;
  matchConfidence: number;
  coverArtUrl?: string;
}

interface MatchResult {
  matches: boolean;
  confidence: number;
}

interface ArtistExtraction {
  primary: string;
  full: string;
  isCollaboration: boolean;
}

interface ArtistData {
  name: string;
  fullNames: Set<string>;
  nameVariants: Set<string>;
  albumCount: number;
  albums: Map<string, LocalAlbum>;
  collaborations: Set<string>;
}

interface VerificationResult {
  verified: boolean;
  matchedAlbums: number;
  confidence: number;
  matchRatio?: number;
}

interface MatchSummary {
  total: number;
  present: number;
  missing: number;
  uncertain: number;
}

interface MBAlbum {
  id: string;
  title: string;
  firstReleaseDate?: string;
  primaryType: string;
  secondaryTypes?: string[];
}

interface TrackInput {
  id: string;
  artist?: string;
  album?: string;
}

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
   * Common patterns used to separate multiple artists in a single artist field
   */
  static ARTIST_SEPARATORS = [
    /\s*,\s*/,           // Comma: "Artist1, Artist2"
    /\s*;\s*/,           // Semicolon: "Artist1; Artist2"
    /\s+feat\.?\s+/i,    // feat. or feat: "Artist1 feat. Artist2"
    /\s+ft\.?\s+/i,      // ft. or ft: "Artist1 ft. Artist2"
    /\s+featuring\s+/i,  // featuring: "Artist1 featuring Artist2"
    /\s+with\s+/i,       // with: "Artist1 with Artist2"
    /\s+&\s+/,           // Ampersand: "Artist1 & Artist2"
    /\s+x\s+/i,          // x (common in collabs): "Artist1 x Artist2"
    /\s+vs\.?\s+/i,      // vs or vs.: "Artist1 vs Artist2"
    /\s+and\s+/i,        // and: "Artist1 and Artist2"
  ];

  /**
   * Extract the primary (first) artist from a potentially multi-artist string
   * @param {string} artistString - Full artist string which may contain multiple artists
   * @returns {{ primary: string, full: string, isCollaboration: boolean }}
   */
  extractPrimaryArtist(artistString: string): ArtistExtraction {
    if (!artistString) {
      return { primary: '', full: '', isCollaboration: false };
    }

    const trimmed = artistString.trim();

    // Try each separator pattern and find the one that splits earliest
    let earliestSplit = trimmed;
    let foundSeparator = false;

    for (const separator of DiscographyMatchingService.ARTIST_SEPARATORS) {
      const match = trimmed.match(separator);
      if (match && match.index !== undefined) {
        const potentialPrimary = trimmed.substring(0, match.index).trim();
        // Only accept if the result is non-empty and shorter than current best
        if (potentialPrimary.length > 0 && potentialPrimary.length < earliestSplit.length) {
          earliestSplit = potentialPrimary;
          foundSeparator = true;
        }
      }
    }

    return {
      primary: earliestSplit,
      full: trimmed,
      isCollaboration: foundSeparator,
    };
  }

  /**
   * Normalize an artist name for grouping purposes
   * More aggressive than normalizeString - strips all punctuation to catch variants
   * like "Leave's Eyes" vs "Leaves' Eyes"
   * @param {string} str - Artist name to normalize
   * @returns {string} Normalized artist name
   */
  normalizeArtistName(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .trim()
      .replace(/[''`´]/g, '')     // Remove apostrophes entirely
      .replace(/["""]/g, '')      // Remove quotes
      .replace(/[–—-]/g, ' ')     // Dashes to spaces
      .replace(/[.,:;!?]/g, '')   // Remove punctuation
      .replace(/\s+/g, ' ')       // Multiple spaces to single
      .trim();
  }

  /**
   * Normalize a string for comparison
   * @param {string} str - String to normalize
   * @returns {string} Normalized string
   */
  normalizeString(str: string): string {
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
  calculateSimilarity(a: string, b: string): number {
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
  matchAlbumNames(localAlbum: string, mbAlbum: string): MatchResult {
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
   * Groups by PRIMARY artist to avoid duplicates from collaborations
   * Also uses fuzzy matching to group spelling variants (e.g., "Leave's Eyes" vs "Leaves' Eyes")
   * @param {Object[]} tracks - Track objects with artist property
   * @returns {Map<string, { name: string, albumCount: number, albums: Map<string, LocalAlbum>, collaborations: Set<string>, nameVariants: Set<string> }>}
   */
  extractArtistsFromTracks(tracks: TrackInput[]): Map<string, ArtistData> {
    const artistsMap = new Map();
    // Secondary index for fuzzy matching - maps normalized names to their canonical key
    const fuzzyIndex = new Map();

    for (const track of tracks) {
      const artistName = track.artist?.trim();
      if (!artistName || artistName.toLowerCase() === 'unknown artist') continue;

      // Extract the primary artist for grouping
      const { primary, full, isCollaboration } = this.extractPrimaryArtist(artistName);

      if (!primary) continue;

      const normalizedPrimary = primary.toLowerCase();

      // Check for exact match first
      let canonicalKey = normalizedPrimary;
      let existingArtistData = artistsMap.get(normalizedPrimary);

      // If no exact match, try punctuation-normalized matching for spelling variants
      // This catches "Leave's Eyes" vs "Leaves' Eyes" without false positives
      if (!existingArtistData) {
        // Check if we've already mapped this name
        if (fuzzyIndex.has(normalizedPrimary)) {
          canonicalKey = fuzzyIndex.get(normalizedPrimary);
          existingArtistData = artistsMap.get(canonicalKey);
        } else {
          const normalizedForComparison = this.normalizeArtistName(primary);

          // Look for matching artists via punctuation-normalized names
          for (const [existingKey, existingData] of artistsMap) {
            const existingNormalized = this.normalizeArtistName(existingData.name);

            // First check: exact match after punctuation normalization
            if (normalizedForComparison === existingNormalized) {
              canonicalKey = existingKey;
              existingArtistData = existingData;
              fuzzyIndex.set(normalizedPrimary, existingKey);
              break;
            }

            // Second check: very high fuzzy threshold (95%) as fallback
            // This is conservative to avoid grouping distinct artists
            const similarity = this.calculateSimilarity(normalizedForComparison, existingNormalized);
            if (similarity >= 95) {
              canonicalKey = existingKey;
              existingArtistData = existingData;
              fuzzyIndex.set(normalizedPrimary, existingKey);
              break;
            }
          }
        }
      }

      if (!existingArtistData) {
        artistsMap.set(normalizedPrimary, {
          name: primary,  // Use the primary artist name for display
          fullNames: new Set([full]),  // Track all full artist strings seen
          nameVariants: new Set([primary]),  // Track spelling variants
          albumCount: 0,
          albums: new Map(),
          collaborations: new Set(),  // Track collaboration partners
        });
        existingArtistData = artistsMap.get(normalizedPrimary);
        canonicalKey = normalizedPrimary;
      }

      // Track the full artist string, variants, and collaborations
      existingArtistData.fullNames.add(full);
      existingArtistData.nameVariants.add(primary);
      if (isCollaboration) {
        existingArtistData.collaborations.add(full);
      }

      const albumName = track.album?.trim() || 'Unknown Album';
      const normalizedAlbum = albumName.toLowerCase();

      if (!existingArtistData.albums.has(normalizedAlbum)) {
        existingArtistData.albums.set(normalizedAlbum, {
          name: albumName,
          artist: primary,  // Use primary artist
          fullArtist: full,  // Keep full artist string for reference
          trackCount: 0,
          trackIds: [],
        });
        existingArtistData.albumCount++;
      }

      const albumData = existingArtistData.albums.get(normalizedAlbum);
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
  matchDiscography(mbAlbums: MBAlbum[], localAlbums: Map<string, LocalAlbum>): AlbumMatch[] {
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
  getMatchSummary(matches: AlbumMatch[]): MatchSummary {
    return {
      total: matches.length,
      present: matches.filter(m => m.status === 'present').length,
      missing: matches.filter(m => m.status === 'missing').length,
      uncertain: matches.filter(m => m.status === 'uncertain').length,
    };
  }

  /**
   * Verify an artist by checking if any of their albums match our local library
   * This helps disambiguate artists with similar names
   * @param {Object[]} mbAlbums - MusicBrainz release groups for the candidate artist
   * @param {Map<string, LocalAlbum>} localAlbums - Local albums for this artist
   * @returns {{ verified: boolean, matchedAlbums: number, confidence: number }}
   */
  verifyArtistByAlbums(mbAlbums: MBAlbum[], localAlbums: Map<string, LocalAlbum>): VerificationResult {
    if (!mbAlbums || mbAlbums.length === 0 || !localAlbums || localAlbums.size === 0) {
      return { verified: false, matchedAlbums: 0, confidence: 0 };
    }

    let matchedCount = 0;
    let totalConfidence = 0;

    for (const [key, localAlbum] of localAlbums) {
      let bestConfidence = 0;

      for (const mbAlbum of mbAlbums) {
        const { matches, confidence } = this.matchAlbumNames(localAlbum.name, mbAlbum.title);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
        }

        // If we found a good match, no need to check more MB albums
        if (matches && confidence >= 85) {
          break;
        }
      }

      if (bestConfidence >= 75) {
        matchedCount++;
        totalConfidence += bestConfidence;
      }
    }

    const localAlbumCount = localAlbums.size;
    const matchRatio = matchedCount / localAlbumCount;
    const avgConfidence = matchedCount > 0 ? totalConfidence / matchedCount : 0;

    // Consider verified if:
    // - At least one album matches with high confidence (>=85), OR
    // - Multiple albums match (helps with common album names)
    const verified = matchedCount > 0 && (avgConfidence >= 85 || matchedCount >= 2);

    return {
      verified,
      matchedAlbums: matchedCount,
      confidence: Math.round(avgConfidence),
      matchRatio: Math.round(matchRatio * 100),
    };
  }

  /**
   * Parse release year from MusicBrainz date string
   * @param {string} dateStr - Date string (YYYY or YYYY-MM-DD)
   * @returns {number|null}
   */
  parseReleaseYear(dateStr: string): number | null {
    if (!dateStr) return null;
    const year = parseInt(dateStr.substring(0, 4), 10);
    return isNaN(year) ? null : year;
  }
}

// Export singleton instance
export const DiscographyMatcher = new DiscographyMatchingService();
