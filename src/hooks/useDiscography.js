/**
 * useDiscography Hook
 * 
 * Provides discography lookup and matching functionality.
 * Orchestrates the MusicBrainz API, Cover Art Archive, and matching services.
 */
import { useState, useCallback, useMemo, useRef } from 'react';
import { useStore } from '../store/useStore';
import { MusicBrainzAPI } from '../services/MusicBrainzAPI';
import { CoverArtArchive } from '../services/CoverArtArchive';
import { DiscographyMatcher } from '../services/DiscographyMatcher';

/**
 * Hook for discography lookup and matching
 * @param {Object[]} tracks - Library tracks for matching
 * @returns {Object} Discography management interface
 */
export function useDiscography(tracks = []) {
  // Store state
  const resolvedArtists = useStore((state) => state.resolvedArtists);
  const artistDiscographies = useStore((state) => state.artistDiscographies);
  const selectedArtistMbid = useStore((state) => state.selectedArtistMbid);
  const discographyLoading = useStore((state) => state.discographyLoading);
  const discographyProgress = useStore((state) => state.discographyProgress);
  const discographyError = useStore((state) => state.discographyError);
  const discographyConfig = useStore((state) => state.discographyConfig);

  // Store actions
  const setResolvedArtist = useStore((state) => state.setResolvedArtist);
  const removeResolvedArtist = useStore((state) => state.removeResolvedArtist);
  const setArtistDiscography = useStore((state) => state.setArtistDiscography);
  const updateAlbumMatchStatus = useStore((state) => state.updateAlbumMatchStatus);
  const setSelectedArtistMbid = useStore((state) => state.setSelectedArtistMbid);
  const setDiscographyLoading = useStore((state) => state.setDiscographyLoading);
  const setDiscographyProgress = useStore((state) => state.setDiscographyProgress);
  const setDiscographyError = useStore((state) => state.setDiscographyError);
  const setDiscographyConfig = useStore((state) => state.setDiscographyConfig);
  const clearDiscographyData = useStore((state) => state.clearDiscographyData);
  const needsDiscographyRefresh = useStore((state) => state.needsDiscographyRefresh);

  // Local state for search
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Abort controller for cancellation
  const abortRef = useRef(null);

  // Extract unique artists from tracks
  const libraryArtists = useMemo(() => {
    return DiscographyMatcher.extractArtistsFromTracks(tracks);
  }, [tracks]);

  // Get list of artists with their album counts
  const artistList = useMemo(() => {
    const list = [];
    for (const [key, data] of libraryArtists) {
      const resolved = resolvedArtists[key];
      const discography = resolved ? artistDiscographies[resolved.id] : null;
      
      list.push({
        name: data.name,
        normalizedName: key,
        localAlbumCount: data.albumCount,
        localAlbums: data.albums,
        mbArtist: resolved || null,
        discography: discography || null,
        isResolved: !!resolved,
        hasMissingAlbums: discography?.albums?.some(a => a.status === 'missing') || false,
      });
    }
    
    // Sort by name
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [libraryArtists, resolvedArtists, artistDiscographies]);

  // Get statistics
  const stats = useMemo(() => {
    let totalArtists = artistList.length;
    let resolvedCount = artistList.filter(a => a.isResolved).length;
    let artistsWithMissing = artistList.filter(a => a.hasMissingAlbums).length;
    let totalMissing = 0;
    let totalPresent = 0;
    let totalUncertain = 0;

    for (const artist of artistList) {
      if (artist.discography?.albums) {
        for (const album of artist.discography.albums) {
          if (album.status === 'missing') totalMissing++;
          else if (album.status === 'present') totalPresent++;
          else if (album.status === 'uncertain') totalUncertain++;
        }
      }
    }

    return {
      totalArtists,
      resolvedCount,
      artistsWithMissing,
      totalMissing,
      totalPresent,
      totalUncertain,
    };
  }, [artistList]);

  /**
   * Search for an artist on MusicBrainz
   */
  const searchArtist = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return [];
    }

    setIsSearching(true);
    setDiscographyError(null);

    try {
      const results = await MusicBrainzAPI.searchArtist(query, 10);
      setSearchResults(results);
      return results;
    } catch (err) {
      console.error('[useDiscography] Artist search failed:', err);
      setDiscographyError(`Search failed: ${err.message}`);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, [setDiscographyError]);

  /**
   * Resolve an artist (link local artist to MusicBrainz)
   */
  const resolveArtist = useCallback(async (artistName, mbArtistData) => {
    setResolvedArtist(artistName, mbArtistData);
    
    // Auto-fetch discography if configured
    if (discographyConfig.autoFetchOnOpen) {
      await fetchArtistDiscography(artistName, mbArtistData.id);
    }
  }, [setResolvedArtist, discographyConfig]);

  /**
   * Fetch discography for a resolved artist
   */
  const fetchArtistDiscography = useCallback(async (artistName, artistMbid) => {
    setDiscographyLoading(true);
    setDiscographyError(null);
    setDiscographyProgress({ current: 0, total: 0, artist: artistName });

    try {
      // Get local albums for this artist
      const normalizedName = artistName.toLowerCase().trim();
      const artistData = libraryArtists.get(normalizedName);
      const localAlbums = artistData?.albums || new Map();

      // Fetch from MusicBrainz
      const mbAlbums = await MusicBrainzAPI.getArtistDiscography(artistMbid, {
        includeEPs: discographyConfig.includeEPs,
        includeLive: discographyConfig.includeLive,
        includeCompilations: discographyConfig.includeCompilations,
        includeBootlegs: discographyConfig.includeBootlegs,
      });

      setDiscographyProgress({ current: 1, total: 2, artist: artistName });

      // Match against local library
      const matchedAlbums = DiscographyMatcher.matchDiscography(mbAlbums, localAlbums);

      // Fetch cover art for albums (in background)
      fetchCoverArtInBackground(matchedAlbums);

      const summary = DiscographyMatcher.getMatchSummary(matchedAlbums);

      // Store discography
      setArtistDiscography(artistMbid, {
        artistName,
        mbArtistId: artistMbid,
        albums: matchedAlbums,
        ...summary,
        localAlbumCount: localAlbums.size,
      });

      setDiscographyProgress({ current: 2, total: 2, artist: artistName });

      return matchedAlbums;
    } catch (err) {
      console.error('[useDiscography] Failed to fetch discography:', err);
      setDiscographyError(`Failed to fetch discography: ${err.message}`);
      return [];
    } finally {
      setDiscographyLoading(false);
    }
  }, [
    libraryArtists,
    discographyConfig,
    setDiscographyLoading,
    setDiscographyError,
    setDiscographyProgress,
    setArtistDiscography,
  ]);

  /**
   * Fetch cover art for albums in background
   */
  const fetchCoverArtInBackground = useCallback(async (albums) => {
    const releaseGroupIds = albums.map(a => a.mbReleaseGroupId);
    
    // This runs in background, no need to await
    CoverArtArchive.batchGetCoverArt(releaseGroupIds).catch(err => {
      console.warn('[useDiscography] Background cover art fetch failed:', err);
    });
  }, []);

  /**
   * Auto-resolve all unresolved artists
   */
  const autoResolveAllArtists = useCallback(async () => {
    const unresolvedArtists = artistList.filter(a => !a.isResolved);
    
    if (unresolvedArtists.length === 0) {
      return { resolved: 0, failed: 0 };
    }

    setDiscographyLoading(true);
    setDiscographyError(null);
    
    let resolved = 0;
    let failed = 0;
    abortRef.current = { aborted: false };

    try {
      for (let i = 0; i < unresolvedArtists.length; i++) {
        if (abortRef.current.aborted) break;

        const artist = unresolvedArtists[i];
        setDiscographyProgress({
          current: i + 1,
          total: unresolvedArtists.length,
          artist: artist.name,
        });

        try {
          const results = await MusicBrainzAPI.searchArtist(artist.name, 1);
          
          if (results.length > 0 && results[0].score >= 90) {
            setResolvedArtist(artist.name, results[0]);
            resolved++;
          } else {
            failed++;
          }
        } catch (err) {
          console.warn(`[useDiscography] Failed to resolve artist: ${artist.name}`, err);
          failed++;
        }
      }

      return { resolved, failed };
    } finally {
      setDiscographyLoading(false);
      abortRef.current = null;
    }
  }, [artistList, setDiscographyLoading, setDiscographyError, setDiscographyProgress, setResolvedArtist]);

  /**
   * Fetch discographies for all resolved artists
   */
  const fetchAllDiscographies = useCallback(async () => {
    const resolvedArtistsList = artistList.filter(a => a.isResolved && a.mbArtist);
    const needsRefresh = resolvedArtistsList.filter(a => 
      !a.discography || needsDiscographyRefresh(a.mbArtist.id)
    );

    if (needsRefresh.length === 0) {
      return { fetched: 0, failed: 0 };
    }

    setDiscographyLoading(true);
    setDiscographyError(null);
    
    let fetched = 0;
    let failed = 0;
    abortRef.current = { aborted: false };

    try {
      for (let i = 0; i < needsRefresh.length; i++) {
        if (abortRef.current.aborted) break;

        const artist = needsRefresh[i];
        setDiscographyProgress({
          current: i + 1,
          total: needsRefresh.length,
          artist: artist.name,
        });

        try {
          await fetchArtistDiscography(artist.name, artist.mbArtist.id);
          fetched++;
        } catch (err) {
          console.warn(`[useDiscography] Failed to fetch discography: ${artist.name}`, err);
          failed++;
        }
      }

      return { fetched, failed };
    } finally {
      setDiscographyLoading(false);
      abortRef.current = null;
    }
  }, [artistList, needsDiscographyRefresh, setDiscographyLoading, setDiscographyError, setDiscographyProgress, fetchArtistDiscography]);

  /**
   * Cancel ongoing operation
   */
  const cancelOperation = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.aborted = true;
    }
  }, []);

  /**
   * Get cover art URL for a release group
   */
  const getCoverArtUrl = useCallback((releaseGroupId, size = 'small') => {
    if (!releaseGroupId) return null;
    
    const sizeMap = {
      small: 'front-250',
      medium: 'front-500',
      large: 'front-1200',
    };
    
    return `https://coverartarchive.org/release-group/${releaseGroupId}/${sizeMap[size] || 'front-250'}`;
  }, []);

  /**
   * Mark album as owned/present manually
   */
  const markAlbumAsOwned = useCallback((artistMbid, releaseGroupId) => {
    updateAlbumMatchStatus(artistMbid, releaseGroupId, 'present');
  }, [updateAlbumMatchStatus]);

  /**
   * Mark album as missing manually
   */
  const markAlbumAsMissing = useCallback((artistMbid, releaseGroupId) => {
    updateAlbumMatchStatus(artistMbid, releaseGroupId, 'missing');
  }, [updateAlbumMatchStatus]);

  /**
   * Get currently selected artist's discography
   */
  const selectedDiscography = useMemo(() => {
    if (!selectedArtistMbid) return null;
    return artistDiscographies[selectedArtistMbid] || null;
  }, [selectedArtistMbid, artistDiscographies]);

  /**
   * Clear all cached data
   */
  const clearAllData = useCallback(() => {
    clearDiscographyData();
    MusicBrainzAPI.clearCache();
    CoverArtArchive.clearCache();
  }, [clearDiscographyData]);

  return {
    // State
    artistList,
    stats,
    selectedArtistMbid,
    selectedDiscography,
    searchResults,
    isSearching,
    loading: discographyLoading,
    progress: discographyProgress,
    error: discographyError,
    config: discographyConfig,
    
    // Actions
    searchArtist,
    resolveArtist,
    removeResolvedArtist,
    fetchArtistDiscography,
    autoResolveAllArtists,
    fetchAllDiscographies,
    cancelOperation,
    setSelectedArtistMbid,
    setConfig: setDiscographyConfig,
    getCoverArtUrl,
    markAlbumAsOwned,
    markAlbumAsMissing,
    clearAllData,
  };
}
