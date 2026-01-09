/**
 * MusicBrainz / Discography Slice
 * 
 * Manages state for MusicBrainz integration and discography matching.
 */

// Storage key for persisted discography data
const DISCOGRAPHY_STORAGE_KEY = 'vplayer_discography_data';

/**
 * Load persisted discography data
 */
const loadPersistedData = () => {
  try {
    const stored = localStorage.getItem(DISCOGRAPHY_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      // Check expiration (7 days)
      if (Date.now() - (data.timestamp || 0) < 7 * 24 * 60 * 60 * 1000) {
        return {
          resolvedArtists: data.resolvedArtists || {},
          artistDiscographies: data.artistDiscographies || {},
        };
      }
    }
  } catch (err) {
    console.warn('[MusicBrainzSlice] Failed to load persisted data:', err);
  }
  return { resolvedArtists: {}, artistDiscographies: {} };
};

/**
 * MusicBrainz slice creator
 */
export const createMusicBrainzSlice = (set, get) => {
  const persistedData = loadPersistedData();

  return {
    // === MusicBrainz State ===
    
    // Map of artist name (lowercase) -> MusicBrainz artist data
    resolvedArtists: persistedData.resolvedArtists,
    
    // Map of artist MBID -> discography data with matches
    artistDiscographies: persistedData.artistDiscographies,
    
    // Currently selected artist for viewing
    selectedArtistMbid: null,
    
    // Loading/progress state
    discographyLoading: false,
    discographyProgress: { current: 0, total: 0, artist: '' },
    discographyError: null,
    
    // Configuration
    discographyConfig: {
      includeEPs: false,
      includeLive: false,
      includeCompilations: false,
      includeBootlegs: false,
      autoFetchOnOpen: true,
      refreshIntervalDays: 7,
    },

    // === MusicBrainz Actions ===

    /**
     * Set a resolved artist mapping
     */
    setResolvedArtist: (artistName, mbArtistData) =>
      set((state) => {
        const normalizedName = artistName.toLowerCase().trim();
        const newResolved = {
          ...state.resolvedArtists,
          [normalizedName]: {
            ...mbArtistData,
            resolvedAt: Date.now(),
          },
        };
        // Persist
        saveDiscographyData(newResolved, state.artistDiscographies);
        return { resolvedArtists: newResolved };
      }),

    /**
     * Remove a resolved artist mapping
     */
    removeResolvedArtist: (artistName) =>
      set((state) => {
        const normalizedName = artistName.toLowerCase().trim();
        const { [normalizedName]: removed, ...rest } = state.resolvedArtists;
        saveDiscographyData(rest, state.artistDiscographies);
        return { resolvedArtists: rest };
      }),

    /**
     * Set discography for an artist
     */
    setArtistDiscography: (artistMbid, discographyData) =>
      set((state) => {
        const newDiscographies = {
          ...state.artistDiscographies,
          [artistMbid]: {
            ...discographyData,
            fetchedAt: Date.now(),
          },
        };
        saveDiscographyData(state.resolvedArtists, newDiscographies);
        return { artistDiscographies: newDiscographies };
      }),

    /**
     * Update album match status manually
     */
    updateAlbumMatchStatus: (artistMbid, releaseGroupId, newStatus, localAlbum = null) =>
      set((state) => {
        const discography = state.artistDiscographies[artistMbid];
        if (!discography || !discography.albums) return state;

        const updatedAlbums = discography.albums.map((album) => {
          if (album.mbReleaseGroupId === releaseGroupId) {
            return {
              ...album,
              status: newStatus,
              localAlbum: localAlbum || album.localAlbum,
              manuallySet: true,
            };
          }
          return album;
        });

        const newDiscographies = {
          ...state.artistDiscographies,
          [artistMbid]: {
            ...discography,
            albums: updatedAlbums,
          },
        };

        saveDiscographyData(state.resolvedArtists, newDiscographies);
        return { artistDiscographies: newDiscographies };
      }),

    /**
     * Set selected artist for viewing
     */
    setSelectedArtistMbid: (mbid) => set({ selectedArtistMbid: mbid }),

    /**
     * Set loading state
     */
    setDiscographyLoading: (loading) => set({ discographyLoading: loading }),

    /**
     * Set progress state
     */
    setDiscographyProgress: (progress) => set({ discographyProgress: progress }),

    /**
     * Set error state
     */
    setDiscographyError: (error) => set({ discographyError: error }),

    /**
     * Update configuration
     */
    setDiscographyConfig: (config) =>
      set((state) => ({
        discographyConfig: { ...state.discographyConfig, ...config },
      })),

    /**
     * Clear all discography data
     */
    clearDiscographyData: () => {
      localStorage.removeItem(DISCOGRAPHY_STORAGE_KEY);
      set({
        resolvedArtists: {},
        artistDiscographies: {},
        selectedArtistMbid: null,
        discographyError: null,
      });
    },

    /**
     * Get resolved artist by name
     */
    getResolvedArtist: (artistName) => {
      const state = get();
      const normalizedName = artistName.toLowerCase().trim();
      return state.resolvedArtists[normalizedName] || null;
    },

    /**
     * Get discography for an artist
     */
    getArtistDiscography: (artistMbid) => {
      const state = get();
      return state.artistDiscographies[artistMbid] || null;
    },

    /**
     * Check if discography needs refresh
     */
    needsDiscographyRefresh: (artistMbid) => {
      const state = get();
      const discography = state.artistDiscographies[artistMbid];
      if (!discography) return true;
      
      const refreshInterval = state.discographyConfig.refreshIntervalDays * 24 * 60 * 60 * 1000;
      return Date.now() - (discography.fetchedAt || 0) > refreshInterval;
    },
  };
};

/**
 * Save discography data to localStorage
 */
function saveDiscographyData(resolvedArtists, artistDiscographies) {
  try {
    const data = {
      timestamp: Date.now(),
      resolvedArtists,
      artistDiscographies,
    };
    localStorage.setItem(DISCOGRAPHY_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[MusicBrainzSlice] Failed to save data:', err);
  }
}

/**
 * MusicBrainz state to persist
 */
export const musicBrainzPersistState = (state) => ({
  discographyConfig: state.discographyConfig,
});
