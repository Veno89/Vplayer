import React, {
  useCallback,
  useId,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDownToLine,
  Crosshair,
  MoreHorizontal,
  Play,
  ListMusic,
  Plus,
  ListChecks,
} from 'lucide-react';
import { TrackList } from '../components/TrackList';
import { WindowToolbar, WindowToolButton } from '../components/WindowToolbar';
import { AutoSizer } from '../components/AutoSizer';
import { TrackInfoDialog } from '../components/TrackInfoDialog';
import {
  ContextMenu,
  getTrackContextMenuItems,
  type MenuItem,
} from '../components/ContextMenu';
import {
  PlaylistSelector,
  PlaylistSearchBar,
  PlaylistColumnHeaders,
  RatingDialog,
  BatchPlaylistPickerDialog,
} from '../components/playlist';
import { PlaylistDialog } from '../components/playlist/PlaylistDialog';
import { PlaylistMissingDialog } from '../components/playlist/PlaylistMissingDialog';
import { usePlaylistActions } from '../hooks/usePlaylistActions';
import {
  playlistColumns,
  usePlaylistFollow,
  usePlaylistView,
} from '../hooks/usePlaylistView';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { usePlaybackContext } from '../context/PlayerProvider';
import { formatTotalDuration } from '../utils/formatters';
import type { Track } from '../types';

export const PlaylistWindow = React.memo(function PlaylistWindow() {
  const { playlists, library, toast } = usePlaybackContext();
  const currentId = useStore((state) => state.currentTrackId);
  const loadingIndex = useStore((state) => state.loadingTrackIndex);
  const activeTracks = useStore((state) => state.activePlaybackTracks);
  const follow = useStore((state) => state.playlistAutoScroll);
  const setFollow = useStore((state) => state.setPlaylistAutoScroll);
  const viewPreferences = useStore((state) => state.playlistView);
  const updateSetting = useStore((state) => state.updateSetting);
  const reveal = useStore((state) => state.trackRevealRequest);
  const colors = useCurrentColors();
  const view = usePlaylistView(
    playlists.playlistTracks,
    playlists.currentPlaylist
  );
  const actions = usePlaylistActions(playlists);
  const { listRef, onListReady, revision, currentIndex } = usePlaylistFollow(
    view.displayTracks,
    currentId,
    follow,
    playlists.isReady
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const managementButtonRef = useRef<HTMLButtonElement>(null);
  const selectionToolsId = useId();
  const [selectionMode, setSelectionMode] = useState(false);
  const draggedId = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
    kind: 'playlist' | 'track';
  } | null>(null);
  const [infoTrack, setInfoTrack] = useState<Track | null>(null);
  const [ratingTrack, setRatingTrack] = useState<Track | null>(null);
  const [pickerTracks, setPickerTracks] = useState<Track[]>([]);
  const [checking, setChecking] = useState<{ id: string; name: string } | null>(
    null
  );
  const [jumpId, setJumpId] = useState<string | null>(null);
  useEffect(() => {
    setSelectionMode(false);
  }, [playlists.currentPlaylist]);
  const finishSelection = () => {
    setSelectionMode(false);
    view.setSelectedIds(new Set());
  };
  const selectedPlaylist = playlists.playlists.find(
    (item) => item.id === playlists.currentPlaylist
  );
  const playlistHasCurrent =
    !!currentId &&
    playlists.playlistTracks.some((track) => track.id === currentId);
  const hiddenCurrent = playlistHasCurrent && currentIndex < 0;
  const manualOrder =
    !view.query.trim() && !view.debouncedQuery.trim() && !view.sort.key;
  const canReorder =
    !!playlists.currentPlaylist &&
    manualOrder &&
    playlists.isReady &&
    !actions.busy;
  const totalDuration = useMemo(
    () =>
      formatTotalDuration(
        view.displayTracks.reduce(
          (total, track) => total + (track.duration || 0),
          0
        )
      ),
    [view.displayTracks]
  );
  const queue = useStore((state) => state.queue);
  const queuePositions = useMemo(() => {
    const result = new Map<string, number>();
    queue.forEach((track, index) => {
      if (!result.has(track.id)) result.set(track.id, index + 1);
    });
    return result;
  }, [queue]);
  const loadingId =
    loadingIndex === null ? null : activeTracks[loadingIndex]?.id;
  const displayLoadingIndex = loadingId
    ? view.displayTracks.findIndex((track) => track.id === loadingId)
    : -1;

  useEffect(() => {
    if (reveal?.target === 'playlist') {
      view.setQuery('');
      setJumpId(reveal.trackId);
    }
  }, [reveal, view.setQuery]);
  useEffect(() => {
    if (!jumpId || !playlists.isReady || view.query || view.debouncedQuery)
      return;
    const index = view.displayTracks.findIndex((track) => track.id === jumpId);
    if (index >= 0 && !listRef.current) return;
    if (index >= 0) {
      listRef.current?.scrollToItem(index, 'center');
    } else toast.showInfo('This track is not in the selected playlist.');
    setJumpId(null);
    const request = useStore.getState().trackRevealRequest;
    if (request?.target === 'playlist' && request.trackId === jumpId)
      useStore.setState({ trackRevealRequest: null });
  }, [
    jumpId,
    playlists.isReady,
    view.query,
    view.debouncedQuery,
    view.displayTracks,
    revision,
    listRef,
    view.setSelectedIds,
    toast,
  ]);

  const play = useCallback(
    (track: Track, source = playlists.playlistTracks) => {
      const index = source.findIndex((item) => item.id === track.id);
      if (index < 0) return;
      const state = useStore.getState();
      const changingTrack = state.currentTrackId !== track.id;
      state.setActivePlaybackTracks(source);
      // Source remapping already updates the index for the same song. Setting it
      // again resets progress, including on the extra clicks in a double-click.
      if (changingTrack) state.setCurrentTrack(index);
      state.setPlaying(true);
    },
    [playlists.playlistTracks]
  );
  const activate = (index: number) => {
    const track = view.displayTracks[index];
    if (track) play(track);
  };
  const jump = () => {
    if (currentId) {
      view.setQuery('');
      setJumpId(currentId);
    }
  };
  const batch = (action: string) => {
    if (!view.selectedTracks.length) return;
    if (action === 'queue') {
      useStore.getState().addToQueue(view.selectedTracks, 'end');
      toast.showInfo(`Queued ${view.selectedTracks.length} tracks`);
    } else if (action === 'playlist') setPickerTracks(view.selectedTracks);
    else if (action === 'delete' && playlists.currentPlaylist) {
      const id = playlists.currentPlaylist;
      const ids = view.selectedTracks.map((track) => track.id);
      actions.run(async () => {
        if (await actions.remove(id, ids)) view.setSelectedIds(new Set());
      });
    }
  };
  const rate = useCallback(async (id: string, rating: number) => {
    try {
      await playlists.updateTrackRating(id, rating);
      setRatingTrack(track => track?.id === id ? null : track);
      await library.refreshTracks();
    } catch (error) {
      toast.showError(String(error));
    }
  }, [playlists.updateTrackRating, library.refreshTracks, toast]);
  const showTrackMenu = (
    index: number,
    event: {
      clientX: number;
      clientY: number;
      preventDefault: () => void;
      stopPropagation: () => void;
    }
  ) => {
    const track = view.displayTracks[index];
    if (!track) return;
    event.preventDefault();
    event.stopPropagation();
    const id = playlists.currentPlaylist;
    const items = getTrackContextMenuItems({
      track,
      isPlaylist: true,
      onPlay: () => play(track),
      onAddToQueue: () => useStore.getState().addToQueue(track, 'end'),
      onRemove: () => {
        if (id) actions.run(() => actions.remove(id, [track.id]));
      },
      onShowInfo: () => setInfoTrack(track),
      onSetRating: () => setRatingTrack(track),
    });
    items.splice(
      2,
      0,
      {
        label: 'Play next',
        onClick: () => useStore.getState().addToQueue(track, 'next'),
      },
      {
        label: 'Add to another playlist…',
        onClick: () => setPickerTracks([track]),
      }
    );
    setMenu({ x: event.clientX, y: event.clientY, items, kind: 'track' });
  };
  const showManagementMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (menu?.kind === 'playlist') {
      setMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const unavailable = !selectedPlaylist || actions.busy || !playlists.isReady;
    setMenu({
      kind: 'playlist',
      x: rect.left,
      y: rect.bottom,
      items: [
        {
          label: 'Rename…',
          onClick: () => actions.promptName('Rename'),
          disabled: unavailable,
        },
        {
          label: 'Duplicate…',
          onClick: () => actions.promptName('Duplicate'),
          disabled: unavailable,
        },
        { type: 'separator' },
        {
          label: 'Import M3U…',
          onClick: actions.importPlaylist,
          disabled: actions.busy,
        },
        {
          label: 'Export M3U…',
          onClick: actions.exportPlaylist,
          disabled: unavailable,
        },
        {
          label: 'Check for missing tracks…',
          onClick: () => {
            if (selectedPlaylist)
              setChecking({
                id: selectedPlaylist.id,
                name: selectedPlaylist.name,
              });
          },
          disabled: unavailable,
        },
        { type: 'separator' },
        {
          label: `${viewPreferences.showAlbum ? 'Hide' : 'Show'} album column`,
          onClick: () =>
            updateSetting('playlistView', {
              ...viewPreferences,
              showAlbum: !viewPreferences.showAlbum,
            }),
        },
        {
          label: `${viewPreferences.showRating ? 'Hide' : 'Show'} rating column`,
          onClick: () =>
            updateSetting('playlistView', {
              ...viewPreferences,
              showRating: !viewPreferences.showRating,
            }),
        },
        {
          label: 'Reset column widths',
          onClick: () =>
            updateSetting('playlistView', { ...viewPreferences, widths: {} }),
        },
        { type: 'separator' },
        {
          label: 'Delete playlist…',
          onClick: actions.deletePlaylist,
          danger: true,
          disabled: unavailable,
        },
      ],
    });
  };
  const dropOnTrack = (event: React.DragEvent, index: number) => {
    if (!draggedId.current) return; // External drops are handled by the panel.
    event.preventDefault();
    event.stopPropagation();
    const from = playlists.playlistTracks.findIndex(
      (track) => track.id === draggedId.current
    );
    draggedId.current = null;
    setDragging(false);
    if (!canReorder || from < 0 || from === index || !playlists.currentPlaylist)
      return;
    const reordered = [...playlists.playlistTracks];
    reordered.splice(index, 0, reordered.splice(from, 1)[0]);
    const id = playlists.currentPlaylist;
    actions.run(() =>
      playlists.reorderPlaylistTracks(
        id,
        reordered.map((track, position) => [track.id, position])
      )
    );
  };
  const externalDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDropHover(false);
    if (draggedId.current) {
      draggedId.current = null;
      setDragging(false);
      return;
    }
    const id = playlists.currentPlaylist;
    if (!id || !playlists.isReady || actions.busy) return;
    try {
      const data: unknown = JSON.parse(
        event.dataTransfer.getData('application/json') ||
          event.dataTransfer.getData('text/plain')
      );
      if (
        !Array.isArray(data) ||
        data.length > 10000 ||
        !data.every((track) => track && typeof track.id === 'string')
      )
        throw new Error('Drop up to 10,000 library tracks onto a playlist.');
      actions.run(() =>
        playlists.addTracksToPlaylist(id, [
          ...new Set(data.map((track) => track.id)),
        ])
      );
    } catch (error) {
      toast.showError(`Could not add tracks: ${String(error)}`);
    }
  };

  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-col gap-3 py-2 ${dropHover ? 'ring-2 ring-cyan-500' : ''}`}
      aria-label="Playlist panel"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (
          !target.closest(
            'button, input, select, textarea, [role="option"], [role="menu"], [role="dialog"]'
          )
        )
          view.setSelectedIds(new Set());
      }}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          event.key === 'Escape' &&
          !target.closest(
            'input, textarea, [contenteditable="true"], [role="menu"], [role="dialog"]'
          )
        ) {
          finishSelection();
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onKeyDownCapture={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === 'f'
        ) {
          event.preventDefault();
          event.stopPropagation();
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      }}
      onDragOver={(event) => {
        if (playlists.currentPlaylist && !draggedId.current) {
          event.preventDefault();
          setDropHover(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDropHover(false);
      }}
      onDrop={externalDrop}
    >
      <PlaylistSelector
        playlists={playlists.playlists}
        currentPlaylist={playlists.currentPlaylist}
        currentColors={colors}
        onSelect={playlists.setCurrentPlaylist}
        actions={
          <WindowToolbar label="Playlist tools">
            <WindowToolButton
              label="New playlist"
              onClick={() => actions.promptName('New')}
              disabled={actions.busy}
            >
              <Plus className="h-4 w-4" />
            </WindowToolButton>
            <WindowToolButton
              label="Follow playback"
              tooltip={`Follow playback: ${follow ? 'On' : 'Off'}. Keep the playing track in view.`}
              aria-pressed={follow}
              onClick={() => setFollow(!follow)}
              style={{
                color: follow ? '#4ade80' : '#f87171',
                backgroundColor: follow
                  ? 'rgb(34 197 94 / .12)'
                  : 'rgb(239 68 68 / .10)',
              }}
            >
              <ArrowDownToLine className="h-4 w-4" />
            </WindowToolButton>
            <WindowToolButton
              label="Jump to current track"
              tooltip={
                !currentId
                  ? 'Jump to current track. Choose a song to play first.'
                  : !playlists.isReady
                    ? 'Jump to current track. Wait for the playlist to load.'
                    : !playlistHasCurrent
                      ? 'The current track is not in this playlist.'
                      : 'Jump to the currently playing track in this playlist.'
              }
              disabled={!playlistHasCurrent || !playlists.isReady}
              onClick={jump}
            >
              <Crosshair className="h-4 w-4" />
            </WindowToolButton>
            <WindowToolButton
              label="Selection tools"
              tooltip={`Selection mode: ${selectionMode ? 'On' : 'Off'}. Select tracks for queue, playlist and removal actions.`}
              aria-pressed={selectionMode}
              aria-expanded={selectionMode}
              aria-controls={selectionMode ? selectionToolsId : undefined}
              disabled={!playlists.isReady}
              onClick={() => {
                if (selectionMode) finishSelection();
                else setSelectionMode(true);
              }}
              style={
                selectionMode
                  ? {
                      color: colors.accentHex,
                      backgroundColor: 'rgb(51 65 85 / .6)',
                    }
                  : undefined
              }
            >
              <ListChecks className="h-4 w-4" />
            </WindowToolButton>
            <WindowToolButton
              ref={managementButtonRef}
              label="Playlist actions"
              aria-haspopup="menu"
              aria-expanded={menu?.kind === 'playlist'}
              onClick={showManagementMenu}
            >
              <MoreHorizontal className="h-4 w-4" />
            </WindowToolButton>
          </WindowToolbar>
        }
      />
      <div className="flex flex-wrap items-center gap-2 px-3 text-xs text-slate-400">
        <span className="mr-auto">
          {view.query.trim() ? `${view.displayTracks.length} / ` : ''}
          {playlists.playlistTracks.length} tracks · {totalDuration}
        </span>
      </div>
      <PlaylistSearchBar
        value={view.query}
        onChange={view.setQuery}
        onClear={() => view.setQuery('')}
        inputRef={searchRef}
      />
      {(view.query || view.sort.key) && (
        <div className="flex flex-wrap items-center gap-2 px-3 text-xs text-slate-400">
          {view.sort.key ? (
            <button
              className="rounded-sm bg-slate-800 px-2 py-1 text-slate-200"
              onClick={() => view.setSort({ key: null, direction: 'asc' })}
            >
              Original order
            </button>
          ) : null}
          {view.query && (
            <button
              disabled={
                !view.displayTracks.length ||
                view.query !== view.debouncedQuery ||
                !playlists.isReady
              }
              className="flex items-center gap-1 rounded-sm bg-slate-800 px-2 py-1 text-slate-200 disabled:opacity-40"
              onClick={() => play(view.displayTracks[0], view.displayTracks)}
            >
              <Play className="h-3 w-3" />
              Play results
            </button>
          )}
          <span>Clear search and use original order to rearrange tracks.</span>
        </div>
      )}
      {hiddenCurrent && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 text-xs text-amber-200">
          <span>Current track is hidden by search.</span>
          <button onClick={jump} className="underline">
            Reveal current track
          </button>
        </div>
      )}
      {selectionMode && (
        <div
          id={selectionToolsId}
          role="region"
          aria-label="Playlist selection tools"
          className="flex flex-wrap items-center gap-2 bg-slate-800/70 px-3 py-2 text-xs text-slate-200"
        >
          <span className="mr-auto">
            {view.selectedTracks.length} selected
            {view.selectedTracks.length > view.selectedIndices.size
              ? ` (${view.selectedTracks.length - view.selectedIndices.size} hidden)`
              : ''}
          </span>
          <button
            disabled={!view.displayTracks.length}
            onClick={() =>
              view.setSelectedIds(
                (previous) =>
                  new Set([
                    ...previous,
                    ...view.displayTracks.map((track) => track.id),
                  ])
              )
            }
            className="rounded-sm px-2 py-1 hover:bg-slate-700 disabled:opacity-40"
          >
            {view.query.trim() ? 'Select all results' : 'Select all'}
          </button>
          <button
            disabled={!view.selectedTracks.length}
            onClick={() => batch('queue')}
            className="rounded-sm px-2 py-1 hover:bg-slate-700"
          >
            Queue
          </button>
          <button
            disabled={actions.busy || !view.selectedTracks.length}
            onClick={() => batch('playlist')}
            className="rounded-sm px-2 py-1 hover:bg-slate-700"
          >
            Add to playlist
          </button>
          <button
            disabled={
              actions.busy || !playlists.isReady || !view.selectedTracks.length
            }
            onClick={() => batch('delete')}
            className="rounded-sm px-2 py-1 text-red-300 hover:bg-slate-700"
          >
            Remove
          </button>
          <button
            aria-label="Clear selection"
            disabled={!view.selectedTracks.length}
            onClick={() => view.setSelectedIds(new Set())}
            className="rounded-sm px-2 py-1 hover:bg-slate-700"
          >
            Clear
          </button>
          <button
            onClick={finishSelection}
            className="rounded-sm px-2 py-1 text-cyan-300 hover:bg-slate-700"
          >
            Done
          </button>
        </div>
      )}
      {actions.receipt && (
        <div
          role="status"
          className="flex items-center gap-3 px-3 text-xs text-slate-300"
        >
          <span>Removed {actions.receipt.removed} from playlist.</span>
          <button
            disabled={actions.busy}
            onClick={actions.undo}
            className="text-cyan-300 underline"
          >
            Undo
          </button>
          <button
            aria-label="Dismiss undo"
            onClick={() => actions.setReceipt(null)}
            className="ml-auto"
          >
            Dismiss
          </button>
        </div>
      )}
      {(playlists.addingProgress.isAdding || actions.busy) && (
        <div role="status" className="px-3 text-xs text-slate-400">
          Updating playlist…
        </div>
      )}
      {playlists.loadError && (
        <div
          role="alert"
          className="flex flex-wrap gap-2 px-3 text-xs text-red-300"
        >
          <span>Could not refresh playlist: {playlists.loadError}</span>
          <button
            className="underline"
            onClick={() => actions.run(playlists.refreshPlaylistTracks)}
          >
            Retry
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {playlists.isLoading ? (
          <div role="status" className="p-6 text-center text-slate-400">
            Loading playlist…
          </div>
        ) : view.displayTracks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-slate-400">
            <ListMusic className="h-8 w-8 opacity-50" />
            <p>
              {view.query
                ? 'No matching tracks.'
                : selectedPlaylist
                  ? 'Drag tracks here from the Library.'
                  : 'Choose a playlist or create one to get started.'}
            </p>
            {view.query && (
              <button
                onClick={() => view.setQuery('')}
                className="text-cyan-300 underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }) => {
              const columns = playlistColumns(
                Math.max(0, width - 16),
                viewPreferences.widths,
                viewPreferences.showAlbum,
                viewPreferences.showRating
              );
              return (
                <div className="h-full min-w-0">
                  <div className="h-9">
                    <PlaylistColumnHeaders
                      columnWidths={columns.widths}
                      sortConfig={view.sort}
                      onSort={(key) =>
                        view.setSort((previous) =>
                          key === 'number'
                            ? { key: null, direction: 'asc' }
                            : {
                                key,
                                direction:
                                  previous.key === key &&
                                  previous.direction === 'asc'
                                    ? 'desc'
                                    : 'asc',
                              }
                        )
                      }
                      onColumnResize={(update) => {
                        const widths = update(columns.widths);
                        updateSetting('playlistView', {
                          ...viewPreferences,
                          widths: { ...viewPreferences.widths, ...widths },
                        });
                      }}
                      {...columns}
                    />
                  </div>
                  <TrackList
                    key={playlists.currentPlaylist}
                    ref={listRef}
                    onReady={onListReady}
                    tracks={view.displayTracks}
                    currentTrack={currentIndex < 0 ? null : currentIndex}
                    loadingTrackIndex={
                      displayLoadingIndex < 0 ? null : displayLoadingIndex
                    }
                    currentColors={colors}
                    height={Math.max(0, height - 36)}
                    itemSize={48}
                    columnWidths={columns.widths}
                    showAlbum={columns.showAlbum}
                    showArtist={columns.showArtist}
                    showRating={columns.showRating}
                    showNumber={columns.showNumber}
                    panelColumns
                    selectOnClick
                    selectionMode={selectionMode}
                    enableMultiSelect={selectionMode}
                    hideSelectionToolbar
                    selectedIndices={view.selectedIndices}
                    onSelectionChange={view.setSelectedIndices}
                    onSelect={(index) => {
                      if (!selectionMode) {
                        activate(index);
                        return;
                      }
                      const track = view.displayTracks[index];
                      if (track)
                        view.setSelectedIds((previous) => {
                          const next = new Set(previous);
                          if (next.has(track.id)) next.delete(track.id);
                          else next.add(track.id);
                          return next;
                        });
                    }}
                    onPlayTrack={selectionMode ? undefined : activate}
                    onEnterTrack={(index) => {
                      if (view.displayTracks[index])
                        play(view.displayTracks[index]);
                    }}
                    onBatchAction={batch}
                    onRatingChange={rate}
                    onShowMenu={showTrackMenu}
                    queuePositions={queuePositions}
                    isDraggable={canReorder && !selectionMode}
                    draggedIndex={
                      dragging
                        ? view.displayTracks.findIndex(
                            (track) => track.id === draggedId.current
                          )
                        : null
                    }
                    onDragStart={(event, index) => {
                      draggedId.current = view.displayTracks[index].id;
                      setDragging(true);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData(
                        'application/x-vplayer-playlist',
                        draggedId.current
                      );
                    }}
                    onDragEnd={() => {
                      draggedId.current = null;
                      setDragging(false);
                      setDropHover(false);
                    }}
                    onDragOver={(event) => {
                      if (draggedId.current) event.preventDefault();
                    }}
                    onDrop={dropOnTrack}
                  />
                </div>
              );
            }}
          </AutoSizer>
        )}
      </div>
      {actions.nameDialog && (
        <PlaylistDialog
          title={`${actions.nameDialog.kind} playlist`}
          onClose={() => {
            if (!actions.busy) actions.setNameDialog(null);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              actions.submitName();
            }}
          >
            <label className="mb-2 block text-sm">
              Playlist name
              <input
                autoFocus
                value={actions.name}
                onChange={(event) => actions.setName(event.target.value)}
                maxLength={255}
                className="mt-2 w-full rounded-sm border border-slate-600 bg-slate-800 p-2 text-white"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={actions.busy}
                onClick={() => actions.setNameDialog(null)}
                className="rounded-sm px-3 py-2 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={!actions.name.trim() || actions.busy}
                className="rounded-sm bg-cyan-800 px-3 py-2 disabled:opacity-40"
              >
                {actions.busy
                  ? 'Saving…'
                  : actions.nameDialog.kind === 'New'
                    ? 'Create'
                    : actions.nameDialog.kind === 'Duplicate'
                      ? 'Duplicate'
                      : 'Save'}
              </button>
            </div>
          </form>
        </PlaylistDialog>
      )}
      {checking && (
        <PlaylistMissingDialog
          playlistId={checking.id}
          playlistName={checking.name}
          onClose={() => setChecking(null)}
          onRemove={async (ids) => {
            await actions.exclusive(() =>
              actions.remove(checking.id, ids, true)
            );
          }}
        />
      )}
      <RatingDialog
        track={ratingTrack}
        onClose={() => setRatingTrack(null)}
        onRate={rate}
      />
      <BatchPlaylistPickerDialog
        isOpen={pickerTracks.length > 0}
        selectedCount={pickerTracks.length}
        playlists={playlists.playlists}
        onClose={() => setPickerTracks([])}
        onAdd={(id) =>
          actions.run(async () => {
            await playlists.addTracksToPlaylist(
              id,
              pickerTracks.map((track) => track.id)
            );
            setPickerTracks([]);
            toast.showSuccess('Tracks added to playlist');
          })
        }
      />
      <TrackInfoDialog
        track={infoTrack}
        onClose={() => setInfoTrack(null)}
        onSave={() =>
          actions.run(async () => {
            await playlists.refreshPlaylistTracks();
            await library.refreshTracks();
          })
        }
      />
      {menu && (
        <ContextMenu
          {...menu}
          triggerRef={
            menu.kind === 'playlist' ? managementButtonRef : undefined
          }
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
});
