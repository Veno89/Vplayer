import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import type { Track } from '../types';
import type { TrackListHandle } from '../components/TrackList';
import type {
  SortConfig,
  ColumnWidths,
} from '../components/playlist/PlaylistColumnHeaders';

export function playlistMatches(track: Track, query: string): boolean {
  const search = query.toLowerCase().trim();
  if (!search) return true;
  return [
    track.title || track.name,
    track.artist,
    track.album,
    track.genre,
  ].some((value) => {
    if (!value) return false;
    return (
      value.toLowerCase().includes(search) ||
      (search.length > 1 &&
        /^[a-z]+$/.test(search) &&
        value
          .toLowerCase()
          .split(/\s+/)
          .map((word) => word[0])
          .join('')
          .includes(search))
    );
  });
}

export function playlistColumns(
  width: number,
  saved: Record<string, number>,
  album: boolean,
  rating: boolean
) {
  const showArtist = width >= 430;
  const showAlbum = album && width >= 760;
  const showRating = rating && width >= 650;
  const showNumber = width >= 370;
  const widths: ColumnWidths = {
    number: 36,
    title: 220,
    artist: 150,
    album: 150,
    rating: 100,
    duration: 60,
    ...saved,
  };
  const fixed =
    80 +
    (showNumber ? widths.number : 0) +
    widths.duration +
    (showRating ? widths.rating : 0);
  const desired =
    widths.title +
    (showArtist ? widths.artist : 0) +
    (showAlbum ? widths.album : 0);
  const scale = Math.min(1, Math.max(0, width - fixed) / desired);
  for (const key of ['title', 'artist', 'album'])
    widths[key] = Math.floor(widths[key] * scale);
  widths.title = Math.max(
    80,
    widths.title + Math.max(0, width - fixed - desired)
  );
  return { widths, showArtist, showAlbum, showRating, showNumber };
}

export function usePlaylistView(tracks: Track[], playlistId: string | null) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setSelectedIds(new Set());
    setQuery('');
    setDebouncedQuery('');
    setSort({ key: null, direction: 'asc' });
  }, [playlistId]);
  const displayTracks = useMemo(() => {
    const filtered = tracks.filter((track) =>
      playlistMatches(track, debouncedQuery)
    );
    if (!sort.key) return filtered;
    const text = (a?: string, b?: string) =>
      (a || '').localeCompare(b || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    return filtered.sort((a, b) => {
      let value = 0;
      switch (sort.key) {
        case 'title':
          value = text(a.title || a.name, b.title || b.name);
          break;
        case 'artist':
          value = text(a.artist, b.artist) || text(a.album, b.album);
          break;
        case 'album':
          value =
            text(a.artist, b.artist) ||
            text(a.album, b.album) ||
            (a.disc_number || 0) - (b.disc_number || 0) ||
            (a.track_number || 0) - (b.track_number || 0);
          break;
        case 'duration':
          value = (a.duration || 0) - (b.duration || 0);
          break;
        case 'rating':
          value = (a.rating || 0) - (b.rating || 0);
          break;
      }
      return value * (sort.direction === 'asc' ? 1 : -1);
    });
  }, [tracks, debouncedQuery, sort]);
  const selectedTracks = useMemo(
    () => tracks.filter((track) => selectedIds.has(track.id)),
    [tracks, selectedIds]
  );
  const selectedIndices = useMemo(
    () =>
      new Set(
        displayTracks.flatMap((track, index) =>
          selectedIds.has(track.id) ? [index] : []
        )
      ),
    [displayTracks, selectedIds]
  );
  const setSelectedIndices = useCallback(
    (update: SetStateAction<Set<number>>) => {
      // Resolve indices against this render, then store identities. Hidden selections survive filtering.
      const indices =
        typeof update === 'function' ? update(selectedIndices) : update;
      setSelectedIds((previous) => {
        const next = new Set(previous);
        for (const track of displayTracks) next.delete(track.id);
        for (const index of indices)
          if (displayTracks[index]) next.add(displayTracks[index].id);
        return next;
      });
    },
    [displayTracks, selectedIndices]
  );
  return {
    query,
    setQuery,
    debouncedQuery,
    sort,
    setSort,
    selectedIds,
    setSelectedIds,
    selectedTracks,
    selectedIndices,
    setSelectedIndices,
    displayTracks,
  };
}

export function usePlaylistFollow(
  tracks: Track[],
  currentId: string | null,
  enabled: boolean,
  ready: boolean
) {
  const listRef = useRef<TrackListHandle>(null);
  const [revision, setRevision] = useState(0);
  const onListReady = useCallback(() => setRevision((value) => value + 1), []);
  const index = currentId
    ? tracks.findIndex((track) => track.id === currentId)
    : -1;
  // Metadata refreshes (e.g. ratings) must not recenter a list the user scrolled.
  // An actual row/track change, mounting, or enabling follow still reveals it.
  useEffect(() => {
    if (enabled && ready && index >= 0)
      listRef.current?.scrollToItem(index, 'center');
  }, [enabled, ready, index, currentId, revision]);
  return { listRef, onListReady, revision, currentIndex: index };
}
