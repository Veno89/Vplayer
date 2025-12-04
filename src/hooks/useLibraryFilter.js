import { useState, useMemo, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import { SEARCH_DEBOUNCE_MS } from '../utils/constants';

/**
 * Hook for filtering and sorting library tracks
 * Handles search, advanced filters, and sorting
 */
export function useLibraryFilter({ tracks = [], libraryFolders = [] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc');
  const [advancedFilters, setAdvancedFilters] = useState({
    genre: '',
    artist: '',
    album: '',
    yearFrom: '',
    yearTo: '',
    minRating: 0,
    durationFrom: '',
    durationTo: '',
    playCountMin: '',
    playCountMax: '',
    format: '',
    bitrateMin: '',
    folderId: ''
  });

  // Debounce search query to reduce filtering operations
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setSortBy('title');
    setSortOrder('asc');
    setAdvancedFilters({
      genre: '',
      artist: '',
      album: '',
      yearFrom: '',
      yearTo: '',
      minRating: 0,
      durationFrom: '',
      durationTo: '',
      playCountMin: '',
      playCountMax: '',
      format: '',
      bitrateMin: '',
      folderId: ''
    });
  }, []);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      debouncedSearchQuery ||
      advancedFilters.genre ||
      advancedFilters.artist ||
      advancedFilters.album ||
      advancedFilters.yearFrom ||
      advancedFilters.yearTo ||
      advancedFilters.minRating > 0 ||
      advancedFilters.durationFrom ||
      advancedFilters.durationTo ||
      advancedFilters.playCountMin ||
      advancedFilters.playCountMax ||
      advancedFilters.format ||
      advancedFilters.bitrateMin ||
      advancedFilters.folderId
    );
  }, [debouncedSearchQuery, advancedFilters]);

  // Filter and sort tracks - memoized for performance
  const filteredTracks = useMemo(() => {
    let filtered = [...tracks];

    // Basic text search
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(track =>
        (track.title || track.name || '').toLowerCase().includes(query) ||
        (track.artist || '').toLowerCase().includes(query) ||
        (track.album || '').toLowerCase().includes(query)
      );
    }

    // Advanced filters
    if (advancedFilters.genre) {
      const genreQuery = advancedFilters.genre.toLowerCase();
      filtered = filtered.filter(track =>
        (track.genre || '').toLowerCase().includes(genreQuery)
      );
    }

    if (advancedFilters.artist) {
      const artistQuery = advancedFilters.artist.toLowerCase();
      filtered = filtered.filter(track =>
        (track.artist || '').toLowerCase().includes(artistQuery)
      );
    }

    if (advancedFilters.album) {
      const albumQuery = advancedFilters.album.toLowerCase();
      filtered = filtered.filter(track =>
        (track.album || '').toLowerCase().includes(albumQuery)
      );
    }

    if (advancedFilters.yearFrom) {
      const yearFrom = parseInt(advancedFilters.yearFrom);
      filtered = filtered.filter(track => {
        const trackYear = track.year ? parseInt(track.year) : 0;
        return trackYear >= yearFrom;
      });
    }

    if (advancedFilters.yearTo) {
      const yearTo = parseInt(advancedFilters.yearTo);
      filtered = filtered.filter(track => {
        const trackYear = track.year ? parseInt(track.year) : 9999;
        return trackYear <= yearTo;
      });
    }

    if (advancedFilters.minRating > 0) {
      filtered = filtered.filter(track => 
        (track.rating || 0) >= advancedFilters.minRating
      );
    }

    if (advancedFilters.durationFrom) {
      const durationFrom = parseFloat(advancedFilters.durationFrom) * 60;
      filtered = filtered.filter(track => 
        (track.duration || 0) >= durationFrom
      );
    }

    if (advancedFilters.durationTo) {
      const durationTo = parseFloat(advancedFilters.durationTo) * 60;
      filtered = filtered.filter(track => 
        (track.duration || 0) <= durationTo
      );
    }

    if (advancedFilters.playCountMin) {
      const playCountMin = parseInt(advancedFilters.playCountMin);
      filtered = filtered.filter(track =>
        (track.play_count || 0) >= playCountMin
      );
    }

    if (advancedFilters.playCountMax) {
      const playCountMax = parseInt(advancedFilters.playCountMax);
      filtered = filtered.filter(track =>
        (track.play_count || 0) <= playCountMax
      );
    }

    if (advancedFilters.format) {
      const formatQuery = advancedFilters.format.toLowerCase();
      filtered = filtered.filter(track => {
        const ext = (track.path || '').split('.').pop()?.toLowerCase();
        return ext === formatQuery;
      });
    }

    if (advancedFilters.bitrateMin) {
      const bitrateMin = parseInt(advancedFilters.bitrateMin);
      filtered = filtered.filter(track =>
        (track.bitrate || 0) >= bitrateMin * 1000
      );
    }

    // Filter by folder
    if (advancedFilters.folderId) {
      filtered = filtered.filter(track => {
        const folder = libraryFolders.find(f => f.id === advancedFilters.folderId);
        if (folder) {
          return track.path.startsWith(folder.path);
        }
        return true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortBy] || '';
      let bVal = b[sortBy] || '';
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [tracks, debouncedSearchQuery, sortBy, sortOrder, advancedFilters, libraryFolders]);

  return {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    advancedFilters,
    setAdvancedFilters,
    filteredTracks,
    hasActiveFilters,
    resetFilters,
  };
}

export default useLibraryFilter;
