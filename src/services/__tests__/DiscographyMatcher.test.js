/**
 * Tests for MusicBrainz API Service
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock fetch
global.fetch = vi.fn();

describe('MusicBrainzAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeString', () => {
    it('should lowercase strings', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      expect(DiscographyMatcher.normalizeString('THE BEATLES')).toBe('the beatles');
    });

    it('should remove deluxe edition markers', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      expect(DiscographyMatcher.normalizeString('Abbey Road (Deluxe Edition)')).toBe('abbey road');
    });

    it('should remove remastered markers', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      expect(DiscographyMatcher.normalizeString('Abbey Road (Remastered 2009)')).toBe('abbey road');
    });

    it('should normalize punctuation', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      expect(DiscographyMatcher.normalizeString("Rock'n'Roll")).toBe("rock'n'roll");
    });

    it('should normalize ampersands', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      expect(DiscographyMatcher.normalizeString('Simon & Garfunkel')).toBe('simon and garfunkel');
    });
  });

  describe('matchAlbumNames', () => {
    it('should match exact names after normalization', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.matchAlbumNames('Abbey Road', 'Abbey Road');
      expect(result.matches).toBe(true);
      expect(result.confidence).toBe(100);
    });

    it('should match with different casing', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.matchAlbumNames('ABBEY ROAD', 'Abbey Road');
      expect(result.matches).toBe(true);
      expect(result.confidence).toBe(100);
    });

    it('should match deluxe editions', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.matchAlbumNames('Abbey Road (Deluxe Edition)', 'Abbey Road');
      expect(result.matches).toBe(true);
      expect(result.confidence).toBeGreaterThan(90);
    });

    it('should return low confidence for different albums', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.matchAlbumNames('Abbey Road', 'Let It Be');
      expect(result.matches).toBe(false);
      expect(result.confidence).toBeLessThan(75);
    });
  });

  describe('extractArtistsFromTracks', () => {
    it('should group tracks by artist', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const tracks = [
        { id: '1', artist: 'The Beatles', album: 'Abbey Road' },
        { id: '2', artist: 'The Beatles', album: 'Abbey Road' },
        { id: '3', artist: 'The Beatles', album: 'Let It Be' },
        { id: '4', artist: 'Pink Floyd', album: 'The Wall' },
      ];

      const artists = DiscographyMatcher.extractArtistsFromTracks(tracks);

      expect(artists.size).toBe(2);
      expect(artists.has('the beatles')).toBe(true);
      expect(artists.has('pink floyd')).toBe(true);

      const beatles = artists.get('the beatles');
      expect(beatles.albumCount).toBe(2);
      expect(beatles.albums.size).toBe(2);
    });

    it('should skip unknown artists', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const tracks = [
        { id: '1', artist: 'Unknown Artist', album: 'Some Album' },
        { id: '2', artist: 'Real Artist', album: 'Real Album' },
      ];

      const artists = DiscographyMatcher.extractArtistsFromTracks(tracks);

      expect(artists.size).toBe(1);
      expect(artists.has('real artist')).toBe(true);
    });

    it('should group collaborative tracks under primary artist', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const tracks = [
        { id: '1', artist: 'Electric Callboy', album: 'TEKKNO' },
        { id: '2', artist: 'Electric Callboy, Conquer Divide', album: 'Fuckboi' },
        { id: '3', artist: 'Electric Callboy, Finch', album: 'Spaceman' },
        { id: '4', artist: 'Electric Callboy feat. Finch', album: 'Another Song' },
      ];

      const artists = DiscographyMatcher.extractArtistsFromTracks(tracks);

      // Should all be grouped under "Electric Callboy"
      expect(artists.size).toBe(1);
      expect(artists.has('electric callboy')).toBe(true);

      const electricCallboy = artists.get('electric callboy');
      expect(electricCallboy.albumCount).toBe(4);
      expect(electricCallboy.collaborations.size).toBe(3); // The 3 collab tracks
    });
  });

  describe('extractPrimaryArtist', () => {
    it('should extract primary artist from comma-separated string', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.extractPrimaryArtist('Electric Callboy, Conquer Divide');
      expect(result.primary).toBe('Electric Callboy');
      expect(result.full).toBe('Electric Callboy, Conquer Divide');
      expect(result.isCollaboration).toBe(true);
    });

    it('should extract primary artist from feat. string', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.extractPrimaryArtist('Artist1 feat. Artist2');
      expect(result.primary).toBe('Artist1');
      expect(result.isCollaboration).toBe(true);
    });

    it('should extract primary artist from ft. string', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.extractPrimaryArtist('Artist1 ft. Artist2');
      expect(result.primary).toBe('Artist1');
      expect(result.isCollaboration).toBe(true);
    });

    it('should extract primary artist from x collab string', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.extractPrimaryArtist('Artist1 x Artist2');
      expect(result.primary).toBe('Artist1');
      expect(result.isCollaboration).toBe(true);
    });

    it('should extract primary artist from & string', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.extractPrimaryArtist('Artist1 & Artist2');
      expect(result.primary).toBe('Artist1');
      expect(result.isCollaboration).toBe(true);
    });

    it('should extract primary artist from "with" string', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.extractPrimaryArtist('Artist1 with Artist2');
      expect(result.primary).toBe('Artist1');
      expect(result.isCollaboration).toBe(true);
    });

    it('should return full string for solo artists', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result = DiscographyMatcher.extractPrimaryArtist('Electric Callboy');
      expect(result.primary).toBe('Electric Callboy');
      expect(result.full).toBe('Electric Callboy');
      expect(result.isCollaboration).toBe(false);
    });

    it('should handle empty/null input', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      const result1 = DiscographyMatcher.extractPrimaryArtist('');
      expect(result1.primary).toBe('');
      expect(result1.isCollaboration).toBe(false);

      const result2 = DiscographyMatcher.extractPrimaryArtist(null);
      expect(result2.primary).toBe('');
      expect(result2.isCollaboration).toBe(false);
    });
  });

  describe('matchDiscography', () => {
    it('should match albums correctly', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');

      const mbAlbums = [
        { id: 'mb1', title: 'Abbey Road', firstReleaseDate: '1969', primaryType: 'Album' },
        { id: 'mb2', title: 'Let It Be', firstReleaseDate: '1970', primaryType: 'Album' },
        { id: 'mb3', title: 'Revolver', firstReleaseDate: '1966', primaryType: 'Album' },
      ];

      const localAlbums = new Map([
        ['abbey road', { name: 'Abbey Road', artist: 'The Beatles', trackCount: 17, trackIds: [] }],
        ['let it be', { name: 'Let It Be', artist: 'The Beatles', trackCount: 12, trackIds: [] }],
      ]);

      const results = DiscographyMatcher.matchDiscography(mbAlbums, localAlbums);

      expect(results.length).toBe(3);

      const abbeyRoad = results.find(r => r.mbTitle === 'Abbey Road');
      expect(abbeyRoad.status).toBe('present');

      const letItBe = results.find(r => r.mbTitle === 'Let It Be');
      expect(letItBe.status).toBe('present');

      const revolver = results.find(r => r.mbTitle === 'Revolver');
      expect(revolver.status).toBe('missing');
    });
  });

  describe('getMatchSummary', () => {
    it('should calculate summary correctly', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');

      const matches = [
        { status: 'present' },
        { status: 'present' },
        { status: 'missing' },
        { status: 'uncertain' },
      ];

      const summary = DiscographyMatcher.getMatchSummary(matches);

      expect(summary.total).toBe(4);
      expect(summary.present).toBe(2);
      expect(summary.missing).toBe(1);
      expect(summary.uncertain).toBe(1);
    });
  });

  describe('parseReleaseYear', () => {
    it('should parse full date', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      expect(DiscographyMatcher.parseReleaseYear('1969-09-26')).toBe(1969);
    });

    it('should parse year only', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      expect(DiscographyMatcher.parseReleaseYear('1969')).toBe(1969);
    });

    it('should return null for invalid date', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');
      expect(DiscographyMatcher.parseReleaseYear('')).toBe(null);
      expect(DiscographyMatcher.parseReleaseYear(null)).toBe(null);
    });
  });

  describe('verifyArtistByAlbums', () => {
    it('should verify artist when albums match', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');

      const mbAlbums = [
        { id: 'mb1', title: 'Tales & Travels', primaryType: 'Album' },
        { id: 'mb2', title: 'Another Album', primaryType: 'Album' },
      ];

      const localAlbums = new Map([
        ['tales & travels', { name: 'Tales & Travels', artist: "My Dream's Over", trackCount: 10, trackIds: [] }],
      ]);

      const result = DiscographyMatcher.verifyArtistByAlbums(mbAlbums, localAlbums);

      expect(result.verified).toBe(true);
      expect(result.matchedAlbums).toBe(1);
      expect(result.confidence).toBeGreaterThanOrEqual(85);
    });

    it('should not verify when no albums match', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');

      const mbAlbums = [
        { id: 'mb1', title: 'Completely Different Album', primaryType: 'Album' },
        { id: 'mb2', title: 'Another Random Album', primaryType: 'Album' },
      ];

      const localAlbums = new Map([
        ['tales & travels', { name: 'Tales & Travels', artist: "My Dream's Over", trackCount: 10, trackIds: [] }],
      ]);

      const result = DiscographyMatcher.verifyArtistByAlbums(mbAlbums, localAlbums);

      expect(result.verified).toBe(false);
      expect(result.matchedAlbums).toBe(0);
    });

    it('should verify with multiple album matches', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');

      const mbAlbums = [
        { id: 'mb1', title: 'Abbey Road', primaryType: 'Album' },
        { id: 'mb2', title: 'Let It Be', primaryType: 'Album' },
        { id: 'mb3', title: 'Revolver', primaryType: 'Album' },
      ];

      const localAlbums = new Map([
        ['abbey road', { name: 'Abbey Road', artist: 'The Beatles', trackCount: 17, trackIds: [] }],
        ['let it be', { name: 'Let It Be', artist: 'The Beatles', trackCount: 12, trackIds: [] }],
      ]);

      const result = DiscographyMatcher.verifyArtistByAlbums(mbAlbums, localAlbums);

      expect(result.verified).toBe(true);
      expect(result.matchedAlbums).toBe(2);
    });

    it('should return not verified for empty inputs', async () => {
      const { DiscographyMatcher } = await import('../DiscographyMatcher');

      const result1 = DiscographyMatcher.verifyArtistByAlbums([], new Map());
      expect(result1.verified).toBe(false);

      const result2 = DiscographyMatcher.verifyArtistByAlbums(null, null);
      expect(result2.verified).toBe(false);
    });
  });
});
