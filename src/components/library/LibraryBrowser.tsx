import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, RefreshCw, Play, ListPlus, ListEnd, Music, Disc, User, X, Save, Trash2, ArrowDownUp } from 'lucide-react';
import { usePlaybackContext } from '../../context/PlaybackContext';
import { useStore } from '../../store/useStore';
import { useCurrentColors } from '../../hooks/useStoreHooks';
import { EMPTY_LIBRARY_FILTERS, type AdvancedFilters } from '../../hooks/library/useLibraryFilters';
import { TauriAPI, type LibraryFacet } from '../../services/TauriAPI';
import { AdvancedSearch, type AdvancedSearchFilters } from '../AdvancedSearch';
import { TrackList } from '../TrackList';
import type { TrackListHandle } from '../TrackList';
import { AutoSizer } from '../AutoSizer';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { BatchPlaylistPickerDialog } from '../playlist/PlaylistDialogs';
import type { Track } from '../../types';
import { notifyDragStart, notifyDragEnd } from '../../hooks/useAutoResize';

type BrowseMode = 'tracks' | 'artists' | 'albums' | 'folders';
interface Props {
  onRemoveFolder: (id: string, path: string, name: string) => void;
  onAddFolder: () => void;
}

export function LibraryBrowser({ onRemoveFolder, onAddFolder }: Props) {
  const { library, playlists, toast } = usePlaybackContext();
  const colors = useCurrentColors();
  const currentTrackId = useStore(state => state.currentTrackId);
  const reveal = useStore(state => state.trackRevealRequest);
  const trackListRef = useRef<TrackListHandle>(null);
  const savedViews = useStore(state => state.librarySavedViews);
  const updateSetting = useStore(state => state.updateSetting);
  const [mode, setMode] = useState<BrowseMode>('tracks');
  const [advanced, setAdvanced] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [facets, setFacets] = useState<LibraryFacet[]>([]);
  const [facetLoading, setFacetLoading] = useState(false);
  const [facetError, setFacetError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; indices: number[] } | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState('');
  const [savedId, setSavedId] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const controls = useRef<HTMLDivElement>(null);
  const actionVersion = useRef(0);
  const queryKey = JSON.stringify(library.activeParams);

  useEffect(() => {
    if (reveal?.target === 'library') { setMode('tracks'); setSavedId(''); }
  }, [reveal]);
  useEffect(() => {
    if (reveal?.target !== 'library') return;
    const index = library.rows.findIndex(track => track?.id === reveal.trackId);
    if (index >= 0 && mode === 'tracks') {
      if (!trackListRef.current) return;
      trackListRef.current.scrollToItem(index, 'center');
      setSelected(new Set([index]));
      useStore.setState({ trackRevealRequest: null });
    }
  }, [reveal, library.rows, mode]);

  useEffect(() => {
    setSelected(new Set()); setMenu(null); actionVersion.current++;
  }, [library.queryRevision]);
  useEffect(() => () => { actionVersion.current++; notifyDragEnd(); useStore.getState().setIsDraggingTracks(false); }, []);

  useEffect(() => {
    if (!advanced) return;
    const close = (event: MouseEvent) => {
      if (!controls.current?.contains(event.target as Node)) setAdvanced(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setAdvanced(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape, true); };
  }, [advanced]);

  useEffect(() => {
    if (mode !== 'artists' && mode !== 'albums') return;
    let active = true;
    setFacetLoading(true); setFacetError(null);
    TauriAPI.getLibraryFacets(mode, JSON.parse(queryKey)).then(value => { if (active) setFacets(value); })
      .catch(error => { if (active) setFacetError(String(error)); })
      .finally(() => { if (active) setFacetLoading(false); });
    return () => { active = false; };
  }, [mode, queryKey, library.queryRevision]);

  const playAt = useCallback(async (index: number) => {
    const version = actionVersion.current;
    const clickedId = library.rows[index]?.id;
    setActionBusy(true);
    try {
      // Playback owns its explicit source; subsequent searches never change it.
      const tracks = await TauriAPI.getFilteredTracks(library.activeParams);
      const position = clickedId ? tracks.findIndex(track => track.id === clickedId) : index;
      if (version !== actionVersion.current || !tracks[position]) return;
      const state = useStore.getState();
      state.setActivePlaybackTracks(tracks);
      state.setCurrentTrack(position);
      state.setPlaying(true);
    } catch (error) { toast.showError('Unable to play: ' + String(error)); }
    finally { setActionBusy(false); }
  }, [library.activeParams, library.rows, toast]);

  const batchAction = useCallback(async (action: string, indices: number[]) => {
    if (action === 'delete') { toast.showInfo('Use folder management to remove music from this library.'); return; }
    const version = actionVersion.current;
    setActionBusy(true);
    try {
      const tracks = await TauriAPI.getSelectedLibraryTracks(library.activeParams, indices);
      if (version !== actionVersion.current || tracks.length === 0) return;
      if (action === 'playlist') setPlaylistTracks(tracks);
      else {
        useStore.getState().addToQueue(tracks, action === 'next' ? 'next' : 'end');
        toast.showSuccess('Added ' + tracks.length + ' track(s) to queue');
      }
    } catch (error) { toast.showError('Track action failed: ' + String(error)); }
    finally { setActionBusy(false); }
  }, [library.activeParams, toast]);

  const menuItems: MenuItem[] = menu ? [
    { label: 'Play', icon: Play, onClick: () => { void playAt(menu.indices[0]); } },
    { label: 'Play next', icon: ListPlus, onClick: () => { void batchAction('next', menu.indices); } },
    { label: 'Add to queue', icon: ListEnd, onClick: () => { void batchAction('queue', menu.indices); } },
    { label: 'Add to playlist', icon: Music, onClick: () => { void batchAction('playlist', menu.indices); } },
  ] : [];

  const changeFilters = (filters: AdvancedSearchFilters) => {
    library.setSearchQuery(filters.query);
    const { query: _query, ...values } = filters;
    library.setAdvancedFilters({ ...EMPTY_LIBRARY_FILTERS, ...values, folderId: filters.folderId || '' });
    setSavedId('');
  };
  const clearFilters = () => {
    library.setSearchQuery(''); library.setAdvancedFilters({ ...EMPTY_LIBRARY_FILTERS }); setSavedId('');
  };
  const chooseView = (id: string) => {
    clearFilters(); setSavedId(id); setMode('tracks');
    if (id === 'recent') { library.setSortBy('dateAdded'); library.setSortOrder('desc'); }
    else if (id === 'unplayed') library.setAdvancedFilters({ ...EMPTY_LIBRARY_FILTERS, playCountMax: '0' });
    else if (id === 'rated') library.setAdvancedFilters({ ...EMPTY_LIBRARY_FILTERS, minRating: 4 });
    else if (id) {
      const view = savedViews.find(item => item.id === id);
      if (view) {
        library.setSearchQuery(view.query);
        library.setAdvancedFilters({ ...EMPTY_LIBRARY_FILTERS, ...view.filters } as AdvancedFilters);
        library.setSortBy(view.sortBy); library.setSortOrder(view.sortOrder);
      }
    }
  };

  const activeChips = Object.entries(library.advancedFilters).filter(([key, value]) => key !== 'folderId' && value !== '' && !(key === 'minRating' && value === 0));
  const activeIndex = useMemo(() => library.rows.findIndex(track => track?.id === currentTrackId), [library.rows, currentTrackId]);
  const buttonClass = 'rounded-sm border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40';
  const overview = library.overview;
  const scan = (path: string) => { void library.scanFolder(path).catch(error => toast.showError(String(error))); };

  return <div className="flex min-h-0 flex-1 flex-col gap-2 relative">
    <div className="flex flex-wrap gap-1" role="group" aria-label="Browse library">
      {(['tracks', 'artists', 'albums', 'folders'] as BrowseMode[]).map(value => <button key={value} type="button" aria-pressed={mode === value} className={buttonClass + (mode === value ? ' border-cyan-400 text-cyan-200' : '')} onClick={() => setMode(value)}>{value.charAt(0).toUpperCase() + value.slice(1)}</button>)}
    </div>
    <div ref={controls}>
      <AdvancedSearch filters={{ query: library.searchQuery, ...library.advancedFilters }} onFiltersChange={changeFilters} showAdvanced={advanced} onToggleAdvanced={() => setAdvanced(value => !value)} />
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      <select aria-label="Music folder" className={buttonClass + ' min-w-0 max-w-[45%]'} value={library.advancedFilters.folderId} onChange={event => { setSavedId(''); library.setAdvancedFilters(current => ({ ...current, folderId: event.target.value })); }}>
        <option value="">All folders</option>{library.libraryFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
      </select>
      <select aria-label="Sort library" className={buttonClass} value={library.sortBy} onChange={event => { setSavedId(''); library.setSortBy(event.target.value); }}>
        <option value="title">Title</option><option value="artist">Artist</option><option value="album">Album</option><option value="dateAdded">Date added</option>
      </select>
      <button className={buttonClass} title="Reverse sort order" aria-label="Reverse sort order" onClick={() => { setSavedId(''); library.setSortOrder(library.sortOrder === 'asc' ? 'desc' : 'asc'); }}><ArrowDownUp className="h-3 w-3" /></button>
      <button className={buttonClass} disabled={library.isScanning} title="Rescan registered folders" aria-label="Rescan library" onClick={() => { void library.refreshFolders().catch(error => toast.showError(String(error))); }}><RefreshCw className="h-3 w-3" /></button>
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      <select aria-label="Library views" className={buttonClass + ' min-w-0 flex-1'} value={savedId} onChange={event => chooseView(event.target.value)}>
        <option value="">All music / custom filters</option><option value="recent">Recently added</option><option value="unplayed">Unplayed</option><option value="rated">Highly rated</option>
        {savedViews.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
      </select>
      <button className={buttonClass} title="Save current filters and sort" aria-label="Save library view" onClick={() => setSaving(value => !value)}><Save className="h-3 w-3" /></button>
      {savedViews.some(view => view.id === savedId) && <button className={buttonClass} aria-label="Remove saved view" onClick={() => { updateSetting('librarySavedViews', savedViews.filter(view => view.id !== savedId)); setSavedId(''); }}><X className="h-3 w-3" /></button>}
    </div>
    {saving && <form className="flex gap-1" onSubmit={event => {
      event.preventDefault(); if (!viewName.trim()) return;
      const id = crypto.randomUUID();
      updateSetting('librarySavedViews', [...savedViews, { id, name: viewName.trim(), query: library.searchQuery, filters: { ...library.advancedFilters }, sortBy: library.sortBy, sortOrder: library.sortOrder }]);
      setSavedId(id); setViewName(''); setSaving(false);
    }}><input autoFocus aria-label="Saved view name" maxLength={60} value={viewName} onChange={event => setViewName(event.target.value)} className="min-w-0 flex-1 rounded-sm bg-slate-800 text-white px-2 text-sm" /><button className={buttonClass}>Save</button></form>}
    {activeChips.length > 0 && <div className="flex flex-wrap gap-1" aria-label="Active library filters">
      {activeChips.map(([key, value]) => <button key={key} className={buttonClass} title="Remove filter" onClick={() => { setSavedId(''); library.setAdvancedFilters(current => ({ ...current, [key]: EMPTY_LIBRARY_FILTERS[key as keyof AdvancedFilters] })); }}>{key.replace(/([A-Z])/g, ' $1')}: {value} ×</button>)}
      <button className={buttonClass} onClick={clearFilters}>Clear all</button>
    </div>}
    {library.loadError && <div role="alert" className="text-xs text-amber-300">{library.loadError} <button className={buttonClass} onClick={() => { void library.refreshTracks().catch(error => toast.showError(String(error))); }}>Retry</button></div>}
    {actionBusy && <div role="status" className="text-xs text-slate-300">Preparing tracks...</div>}
    {(mode === 'artists' || mode === 'albums') ? <div className="min-h-0 flex-1 overflow-y-auto space-y-1">
      {facetLoading ? <p role="status" className="text-sm text-slate-300">Loading groups...</p> : facetError ? <p role="alert" className="text-amber-300 text-xs">{facetError}</p> : facets.length === 0 ? <p className="text-sm text-slate-400">No matching groups.</p> : facets.map((facet, index) => <button key={index} disabled={!facet.label} className="flex w-full items-center gap-2 rounded-sm border border-slate-700 p-3 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60" onClick={() => {
        library.setAdvancedFilters(current => ({ ...current, ...(mode === 'artists' ? { artist: facet.label } : { album: facet.label, artist: facet.artist || '' }) })); setMode('tracks');
      }}>{mode === 'artists' ? <User className="h-4 w-4 shrink-0" /> : <Disc className="h-4 w-4 shrink-0" />}<span className="min-w-0 flex-1 truncate">{facet.label || 'Unknown'}{mode === 'albums' && facet.artist ? ' — ' + facet.artist : ''}</span><span className="text-xs text-slate-400">{facet.count}</span></button>)}
    </div> : mode === 'folders' ? <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
      {overview?.folders.map(folder => <section key={folder.id} className="rounded-sm border border-slate-700 bg-slate-900/50 p-3 text-xs space-y-2">
        <h4 className="flex gap-2 text-sm font-semibold text-white"><FolderOpen className="h-4 w-4" />{folder.name}</h4>
        <p className="truncate text-slate-400" title={folder.path}>{folder.path}</p>
        <p className={folder.availability === 'available' ? 'text-emerald-300' : 'text-amber-300'}>{folder.availability === 'available' ? 'Available' : folder.availability === 'offline' ? 'Drive disconnected or folder missing' : 'Folder inaccessible'}{folder.firstError ? ' · Scan incomplete' : ''}</p>
        <p className="text-slate-300">{folder.matchingTracks.toLocaleString()} matches of {folder.totalTracks.toLocaleString()} tracks</p>
        <p className="text-slate-400">Last successful scan: {folder.lastSuccess ? new Date(folder.lastSuccess).toLocaleString() : 'Not recorded'}</p>
        {(folder.firstError || folder.accessError) && <details className="text-amber-200"><summary>Scan details{folder.failed ? ' · ' + folder.failed + ' unreadable file(s)' : ''}</summary><p className="mt-1 break-words select-text">{folder.accessError || folder.firstError}</p></details>}
        <div className="flex gap-1"><button className={buttonClass} onClick={() => { library.setAdvancedFilters(current => ({ ...current, folderId: folder.id })); setMode('tracks'); }}>Browse</button><button className={buttonClass} disabled={library.isScanning || folder.availability !== 'available'} onClick={() => scan(folder.path)}>Rescan / retry</button><button className={buttonClass} aria-label={'Remove folder ' + folder.name} disabled={library.isScanning} onClick={() => onRemoveFolder(folder.id, folder.path, folder.name)}><Trash2 className="h-3 w-3" /></button></div>
      </section>)}
      <button className={buttonClass} disabled={library.isScanning} onClick={onAddFolder}>Add music folder</button>
      <button className={buttonClass} disabled={library.isLoading} onClick={() => { void library.refreshTracks().catch(error => toast.showError(String(error))); }}>Refresh folder status</button>
    </div> : <div className="min-h-0 flex flex-col flex-1 overflow-hidden">
      {library.totalMatches === 0 ? <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-slate-400 text-sm"><Music className="h-7 w-7" />{library.isLoading ? 'Loading library...' : library.libraryFolders.length === 0 ? 'Add a music folder to begin.' : 'No tracks match these filters.'}<button className={buttonClass} onClick={library.libraryFolders.length === 0 ? onAddFolder : clearFilters}>{library.libraryFolders.length === 0 ? 'Add folder' : 'Clear filters'}</button></div> : <AutoSizer className="min-h-0">
        {({ height, width }) => <TrackList ref={trackListRef} key={library.queryRevision} tracks={library.rows} currentTrack={activeIndex < 0 ? null : activeIndex} onSelect={index => setSelected(new Set([index]))} onPlayTrack={index => { void playAt(index); }} currentColors={colors} loadingTrackIndex={null} height={height} itemSize={40} showNumber={false} showRating={false} showAlbum={width > 500} showArtist={width > 300} columnWidths={{ title: Math.max(100, width - (width > 500 ? 360 : width > 300 ? 190 : 85)), artist: 130, album: 150, duration: 50 }} isDraggable onDragStart={(event, index) => {
          const track = library.rows[index]; if (!track) return;
          const payload = JSON.stringify([{ id: track.id, path: track.path, title: track.title || track.name, artist: track.artist, album: track.album }]);
          event.dataTransfer.setData('application/json', payload); event.dataTransfer.setData('text/plain', payload); event.dataTransfer.effectAllowed = 'copy';
          notifyDragStart(); useStore.getState().setIsDraggingTracks(true);
        }} onDragEnd={() => { notifyDragEnd(); useStore.getState().setIsDraggingTracks(false); }} enableMultiSelect selectedIndices={selected} onSelectionChange={setSelected} onBatchActionIndices={(action, indices) => { void batchAction(action, indices); }} onRowsRendered={library.loadRange} onShowMenu={(index, event) => setMenu({ x: event.clientX, y: event.clientY, indices: selected.has(index) ? Array.from(selected).sort((a, b) => a - b) : [index] })} />}
      </AutoSizer>}
    </div>}
    <footer className="shrink-0 border-t border-slate-700 pt-2 flex flex-wrap justify-between gap-1 text-xs text-slate-300" aria-live="polite"><span>{library.totalMatches.toLocaleString()} matches of {(overview?.totalTracks ?? 0).toLocaleString()} tracks</span><span>{library.libraryFolders.length} folder(s)</span></footer>
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    <BatchPlaylistPickerDialog isOpen={playlistTracks.length > 0} selectedCount={playlistTracks.length} playlists={playlists.playlists.map(item => ({ id: item.id, name: item.name, created_at: item.createdAt }))} onClose={() => setPlaylistTracks([])} onAdd={id => {
      void playlists.addTracksToPlaylist(id, playlistTracks.map(track => track.id)).then(() => { toast.showSuccess('Tracks added to playlist'); setPlaylistTracks([]); }).catch(error => toast.showError(String(error)));
    }} />
  </div>;
}
