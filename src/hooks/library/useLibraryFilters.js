import { useState, useMemo } from 'react';
import { useDebounce } from '../useDebounce';
import { SEARCH_DEBOUNCE_MS } from '../../utils/constants';

/**
 * Hook to manage library filtering and sorting
 * Handles search, advanced filters, and sorting logic
 * 
 * @param {Array} tracks - Raw tracks array to filter
 * @param {Array} libraryFolders - Library folders (needed for folder filtering)
 */
export function useLibraryFilters(tracks, libraryFolders = []) {
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
        folderId: '' // Filter by specific folder
    });

    // Debounce search query to reduce filtering operations
    const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

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
            const durationFrom = parseFloat(advancedFilters.durationFrom) * 60; // Convert to seconds
            filtered = filtered.filter(track =>
                (track.duration || 0) >= durationFrom
            );
        }

        if (advancedFilters.durationTo) {
            const durationTo = parseFloat(advancedFilters.durationTo) * 60; // Convert to seconds
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
                (track.bitrate || 0) >= bitrateMin * 1000 // Convert kbps to bps
            );
        }

        // Filter by folder
        if (advancedFilters.folderId) {
            filtered = filtered.filter(track => {
                // Match tracks from the selected folder by comparing paths
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
    }, [tracks, debouncedSearchQuery, sortBy, sortOrder, advancedFilters /* libraryFolders will be needed */]);

    return {
        searchQuery,
        setSearchQuery,
        sortBy,
        setSortBy,
        sortOrder,
        setSortOrder,
        advancedFilters,
        setAdvancedFilters,
        filteredTracks
    };
}
