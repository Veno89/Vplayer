/**
 * MusicBrainz / Discography Slice
 * 
 * Manages state for MusicBrainz integration and discography matching.
 * All data is persisted via Zustand's persist middleware — no manual localStorage.
 */
import type {
  AppStore,
  MusicBrainzSlice,
  MusicBrainzSliceState,
  ResolvedArtist,
  ArtistDiscography,
  DiscographyProgress,
  DiscographyConfig,
} from '../types';

type SetFn = (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
type GetFn = () => AppStore;

/** Max age for cached discography data (7 days in ms) */
const DISCOGRAPHY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Filter out expired entries from persisted discography data.
 * Called during store hydration (merge) to prune stale cache entries.
 */
export function pruneExpiredDiscographyData(state: Partial<MusicBrainzSliceState>): Partial<MusicBrainzSliceState> {
  const now = Date.now();
  const result: Partial<MusicBrainzSliceState> = { ...state };

  // Prune expired resolved artists
  if (state.resolvedArtists) {
    const pruned: Record<string, ResolvedArtist> = {};
    for (const [key, artist] of Object.entries(state.resolvedArtists)) {
      if (now - (artist.resolvedAt || 0) < DISCOGRAPHY_MAX_AGE_MS) {
        pruned[key] = artist;
      }
    }
    result.resolvedArtists = pruned;
  }

  // Prune expired artist discographies
  if (state.artistDiscographies) {
    const pruned: Record<string, ArtistDiscography> = {};
    for (const [key, disc] of Object.entries(state.artistDiscographies)) {
      if (now - (disc.fetchedAt || 0) < DISCOGRAPHY_MAX_AGE_MS) {
        pruned[key] = disc;
      }
    }
    result.artistDiscographies = pruned;
  }

  return result;
}

/**
 * MusicBrainz slice creator
 */
export const createMusicBrainzSlice = (set: SetFn, get: GetFn): MusicBrainzSlice => {
  return {
    // === MusicBrainz State ===
    
    // Map of artist name (lowercase) -> MusicBrainz artist data
    resolvedArtists: {},
    
    // Map of artist MBID -> discography data with matches
    artistDiscographies: {},
    
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
    setResolvedArtist: (artistName: string, mbArtistData: Omit<ResolvedArtist, 'resolvedAt'>) =>
      set((state) => {
        const normalizedName = artistName.toLowerCase().trim();
        const newResolved: Record<string, ResolvedArtist> = {
          ...state.resolvedArtists,
          [normalizedName]: {
            ...mbArtistData,
            resolvedAt: Date.now(),
          } as ResolvedArtist,
        };
        return { resolvedArtists: newResolved };
      }),

    /**
     * Remove a resolved artist mapping
     */
    removeResolvedArtist: (artistName: string) =>
      set((state) => {
        const normalizedName = artistName.toLowerCase().trim();
        const { [normalizedName]: removed, ...rest } = state.resolvedArtists;
        return { resolvedArtists: rest };
      }),

    /**
     * Set discography for an artist
     */
    setArtistDiscography: (artistMbid: string, discographyData: Omit<ArtistDiscography, 'fetchedAt'>) =>
      set((state) => {
        const newDiscographies = {
          ...state.artistDiscographies,
          [artistMbid]: {
            ...discographyData,
            fetchedAt: Date.now(),
          } as ArtistDiscography,
        };
        return { artistDiscographies: newDiscographies };
      }),

    /**
     * Update album match status manually
     */
    updateAlbumMatchStatus: (artistMbid: string, releaseGroupId: string, newStatus: string, localAlbum: string | null = null) =>
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

        return { artistDiscographies: newDiscographies };
      }),

    /**
     * Set selected artist for viewing
     */
    setSelectedArtistMbid: (mbid: string | null) => set({ selectedArtistMbid: mbid }),

    /**
     * Set loading state
     */
    setDiscographyLoading: (loading: boolean) => set({ discographyLoading: loading }),

    /**
     * Set progress state
     */
    setDiscographyProgress: (progress: DiscographyProgress) => set({ discographyProgress: progress }),

    /**
     * Set error state
     */
    setDiscographyError: (error: string | null) => set({ discographyError: error }),

    /**
     * Update configuration
     */
    setDiscographyConfig: (config: Partial<DiscographyConfig>) =>
      set((state) => ({
        discographyConfig: { ...state.discographyConfig, ...config },
      })),

    /**
     * Clear all discography data
     */
    clearDiscographyData: () => {
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
    getResolvedArtist: (artistName: string): ResolvedArtist | null => {
      const state = get();
      const normalizedName = artistName.toLowerCase().trim();
      return state.resolvedArtists[normalizedName] || null;
    },

    /**
     * Get discography for an artist
     */
    getArtistDiscography: (artistMbid: string): ArtistDiscography | null => {
      const state = get();
      return state.artistDiscographies[artistMbid] || null;
    },

    /**
     * Check if discography needs refresh
     */
    needsDiscographyRefresh: (artistMbid: string): boolean => {
      const state = get();
      const discography = state.artistDiscographies[artistMbid];
      if (!discography) return true;
      
      const refreshInterval = state.discographyConfig.refreshIntervalDays * 24 * 60 * 60 * 1000;
      return Date.now() - (discography.fetchedAt || 0) > refreshInterval;
    },
  };
};

/**
 * MusicBrainz state to persist via Zustand persist middleware.
 * Includes all cached data — expiration is handled by pruneExpiredDiscographyData() during hydration.
 */
export const musicBrainzPersistState = (state: MusicBrainzSliceState) => ({
  discographyConfig: state.discographyConfig,
  resolvedArtists: state.resolvedArtists,
  artistDiscographies: state.artistDiscographies,
});
