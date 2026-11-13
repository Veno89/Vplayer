import { useState, useMemo } from 'react';
import { useDebounce } from '../useDebounce';
import { SEARCH_DEBOUNCE_MS } from '../../utils/constants';
import type { TrackFilter } from '../../types';

export interface AdvancedFilters {
  genre: string;
  artist: string;
  album: string;
  yearFrom: string;
  yearTo: string;
  minRating: number;
  durationFrom: string;
  durationTo: string;
  playCountMin: string;
  playCountMax: string;
  format: string;
  bitrateMin: string;
  folderId: string;
}

export const EMPTY_LIBRARY_FILTERS: AdvancedFilters = {
  genre: '', artist: '', album: '', yearFrom: '', yearTo: '', minRating: 0,
  durationFrom: '', durationTo: '', playCountMin: '', playCountMax: '', format: '', bitrateMin: '', folderId: '',
};

export interface LibraryFiltersAPI {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
  sortOrder: string;
  setSortOrder: (order: string) => void;
  advancedFilters: AdvancedFilters;
  setAdvancedFilters: React.Dispatch<React.SetStateAction<AdvancedFilters>>;
    activeParams: TrackFilter;
}

/**
 * Hook to manage library filtering and sorting
 * Handles search, advanced filters, and sorting logic
 * 
 * @param {Array} tracks - Raw tracks array to filter
 */
export function useLibraryFilters(): LibraryFiltersAPI {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('album'); // Default to album sorting (artist + album)
    const [sortOrder, setSortOrder] = useState('asc');
    const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(EMPTY_LIBRARY_FILTERS);
    // Debounce search query to reduce filtering operations
    const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

    // Construct backend filter object (memoized)
    const activeParams = useMemo(() => {
        const filter: TrackFilter = {};

        if (debouncedSearchQuery) filter.searchQuery = debouncedSearchQuery;

        if (advancedFilters.artist) filter.artist = advancedFilters.artist;
        if (advancedFilters.album) filter.album = advancedFilters.album;
        if (advancedFilters.genre) filter.genre = advancedFilters.genre;

        if (advancedFilters.minRating > 0) filter.minRating = advancedFilters.minRating;

        if (advancedFilters.playCountMin && Number.isFinite(Number(advancedFilters.playCountMin))) filter.playCountMin = parseInt(advancedFilters.playCountMin);
        if (advancedFilters.playCountMax && Number.isFinite(Number(advancedFilters.playCountMax))) filter.playCountMax = parseInt(advancedFilters.playCountMax);

        if (advancedFilters.durationFrom && Number.isFinite(Number(advancedFilters.durationFrom))) filter.durationFrom = parseFloat(advancedFilters.durationFrom) * 60;
        if (advancedFilters.durationTo && Number.isFinite(Number(advancedFilters.durationTo))) filter.durationTo = parseFloat(advancedFilters.durationTo) * 60;

        if (advancedFilters.yearFrom && Number.isFinite(Number(advancedFilters.yearFrom))) filter.yearFrom = Number(advancedFilters.yearFrom);
        if (advancedFilters.yearTo && Number.isFinite(Number(advancedFilters.yearTo))) filter.yearTo = Number(advancedFilters.yearTo);
        if (advancedFilters.format) filter.format = advancedFilters.format;
        if (advancedFilters.bitrateMin && Number.isFinite(Number(advancedFilters.bitrateMin))) filter.bitrateMin = Number(advancedFilters.bitrateMin);

        // Folder logic: Pass ID to backend for subquery resolution
        if (advancedFilters.folderId) {
            filter.folderId = advancedFilters.folderId;
        }

        filter.sortBy = sortBy;
        filter.sortDesc = sortOrder === 'desc';

        return filter;
    }, [debouncedSearchQuery, advancedFilters, sortBy, sortOrder]);

    return {
        searchQuery,
        setSearchQuery,
        sortBy,
        setSortBy,
        sortOrder,
        setSortOrder,
        advancedFilters,
        setAdvancedFilters,
        activeParams
    };
}
