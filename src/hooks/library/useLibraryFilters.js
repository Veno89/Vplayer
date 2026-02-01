import { useState, useMemo } from 'react';
import { useDebounce } from '../useDebounce';
import { SEARCH_DEBOUNCE_MS } from '../../utils/constants';

/**
 * Hook to manage library filtering and sorting
 * Handles search, advanced filters, and sorting logic
 * 
 * @param {Array} tracks - Raw tracks array to filter
 */
export function useLibraryFilters() {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('album'); // Default to album sorting (artist + album)
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
        folderId: '' // Filter by specific folder
    });

    // Debounce search query to reduce filtering operations
    const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

    // Construct backend filter object (memoized)
    const activeParams = useMemo(() => {
        const filter = {}; // TrackFilter

        if (debouncedSearchQuery) filter.searchQuery = debouncedSearchQuery;

        if (advancedFilters.artist) filter.artist = advancedFilters.artist;
        if (advancedFilters.album) filter.album = advancedFilters.album;
        if (advancedFilters.genre) filter.genre = advancedFilters.genre;

        if (advancedFilters.minRating > 0) filter.minRating = advancedFilters.minRating;

        if (advancedFilters.playCountMin) filter.playCountMin = parseInt(advancedFilters.playCountMin);
        if (advancedFilters.playCountMax) filter.playCountMax = parseInt(advancedFilters.playCountMax);

        if (advancedFilters.durationFrom) filter.durationFrom = parseFloat(advancedFilters.durationFrom) * 60;
        if (advancedFilters.durationTo) filter.durationTo = parseFloat(advancedFilters.durationTo) * 60;

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
