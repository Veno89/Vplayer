import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Music,
  Shuffle,
  Repeat,
  Settings,
  SlidersHorizontal,
  Loader,
  Minimize2,
  MoreHorizontal,
  FolderOpen,
  Tag,
  ListMusic,
  RefreshCw,
} from 'lucide-react';
import { AlbumArt } from '../components/AlbumArt';
import { WindowToolbar, WindowToolButton } from '../components/WindowToolbar';
import { StarRating } from '../components/StarRating';
import { PlayerSeekbar } from '../components/player/PlayerSeekbar';
import { PlayerLoopControls } from '../components/player/PlayerLoopControls';
import { PlayerTools } from '../components/player/PlayerTools';
import { PlayerDialog } from '../components/player/PlayerDialog';
import { useStore } from '../store/useStore';
import {
  selectCurrentTrackData,
  selectUpcomingTrack,
} from '../store/selectors';
import { usePlaybackContext } from '../context/PlaybackContext';
import { useAudioEngine } from '../context/AudioEngineContext';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { EMPTY_LIBRARY_FILTERS } from '../hooks/library/useLibraryFilters';
import { TauriAPI } from '../services/TauriAPI';
import { formatDuration } from '../utils/formatters';
import type { Track } from '../types';

const iconButton =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700/60 hover:text-white focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-35';
const titleFor = (track: Track) =>
  track.title?.trim() ||
  track.name ||
  track.path.split(/[\\/]/).pop() ||
  'Unknown track';

const PlayerVolume = memo(function PlayerVolume({
  disabled,
  onChange,
  onMute,
}: {
  disabled: boolean;
  onChange: (value: number) => void;
  onMute: () => void;
}) {
  const volume = useStore((s) => s.volume);
  const step = useStore((s) => s.volumeStep);
  const colors = useCurrentColors();
  return (
    <div
      className="flex shrink-0 items-center gap-2"
      onWheel={(event) => {
        if (disabled || event.deltaY === 0) return;
        event.preventDefault();
        onChange(
          Math.max(
            0,
            Math.min(
              1,
              useStore.getState().volume +
                (event.deltaY > 0 ? -step : step) / 100
            )
          )
        );
      }}
    >
      <button
        className={iconButton}
        disabled={disabled}
        aria-label={volume === 0 ? 'Unmute' : 'Mute'}
        aria-pressed={volume === 0}
        onClick={onMute}
      >
        {volume === 0 ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(volume * 100)}
        disabled={disabled}
        aria-label="Volume"
        title={`Volume: ${Math.round(volume * 100)}%`}
        style={{ accentColor: colors.accentHex }}
        className="h-5 min-w-0 flex-1 cursor-pointer"
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <span className="w-10 text-right text-xs tabular-nums text-slate-400">
        {Math.round(volume * 100)}%
      </span>
    </div>
  );
});

const Upcoming = memo(function Upcoming() {
  const next = useStore(selectUpcomingTrack);
  const stop = useStore((s) => s.stopAfterCurrent);
  const repeat = useStore((s) => s.repeatMode);
  const updateWindow = useStore((s) => s.updateWindow);
  const bringToFront = useStore((s) => s.bringToFront);
  return (
    <button
      className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-slate-700/60 px-3 py-2 text-left hover:bg-slate-800/50"
      title="Open queue"
      onClick={() => {
        updateWindow('queue', { visible: true, minimized: false });
        bringToFront('queue');
      }}
    >
      <ListMusic className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="min-w-0 truncate text-xs text-slate-400">
        {stop ? (
          'Playback stops after this track'
        ) : next ? (
          <>
            <span>{repeat === 'one' ? 'Repeats next' : 'Up next'} · </span>
            <span className="text-slate-200">{titleFor(next)}</span>
            {next.artist ? ` · ${next.artist}` : ''}
          </>
        ) : (
          'End of playback · Open queue'
        )}
      </span>
    </button>
  );
});

export function PlayerWindow() {
  const track = useStore(selectCurrentTrackData);
  const index = useStore((s) => s.currentTrack);
  const playing = useStore((s) => s.playing);
  const shuffle = useStore((s) => s.shuffle);
  const repeat = useStore((s) => s.repeatMode);
  const speed = useStore((s) => s.playbackSpeed);
  const sleep = useStore((s) => s.sleepTimerMinutes);
  const stop = useStore((s) => s.stopAfterCurrent);
  const loadingIndex = useStore((s) => s.loadingTrackIndex);
  const setShuffle = useStore((s) => s.setShuffle);
  const setRepeat = useStore((s) => s.setRepeatMode);
  const updateWindow = useStore((s) => s.updateWindow);
  const bringToFront = useStore((s) => s.bringToFront);
  const setMini = useStore((s) => s.setMiniPlayerMode);
  const revealTrack = useStore((s) => s.revealTrack);
  const setTagEditorTrack = useStore((s) => s.setTagEditorTrack);
  const {
    handleNextTrack,
    handlePrevTrack,
    handleSeek,
    handleVolumeChange,
    handleToggleMute,
    togglePlay,
    loadedTrackId,
    trackLoadError,
    retryCurrentTrack,
    playbackTracks,
    library,
    playlists,
    toast,
  } = usePlaybackContext();
  const { audioBackendError, audioIsLoading } = useAudioEngine();
  const colors = useCurrentColors();
  const [dialog, setDialog] = useState<'tools' | 'track' | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const closeDialog = useCallback(() => setDialog(null), []);
  const error = trackLoadError || audioBackendError;
  const loading =
    !!track &&
    !error &&
    (audioIsLoading || loadingIndex !== null || loadedTrackId !== track.id);
  const ready = !!track && !loading && !error;
  const isPlaylistSource = useMemo(
    () =>
      !!playlists.currentPlaylist &&
      playbackTracks.length === playlists.playlistTracks.length &&
      playbackTracks.every(
        (item, i) => item.id === playlists.playlistTracks[i]?.id
      ),
    [playbackTracks, playlists.currentPlaylist, playlists.playlistTracks]
  );
  const sourceName = isPlaylistSource
    ? playlists.playlists.find((item) => item.id === playlists.currentPlaylist)
        ?.name || 'Playlist'
    : 'Library selection';
  const openWindow = (id: string) => {
    updateWindow(id, { visible: true, minimized: false });
    bringToFront(id);
  };
  const browse = (kind: 'artist' | 'album' | 'track') => {
    if (!track) return;
    library.setSearchQuery(kind === 'track' ? titleFor(track) : '');
    library.setAdvancedFilters({
      ...EMPTY_LIBRARY_FILTERS,
      artist: track.artist || '',
      album: kind === 'artist' ? '' : track.album || '',
    });
    revealTrack(track.id, 'library');
  };
  const rate = async (rating: number) => {
    if (!track) return;
    setRatingBusy(true);
    try {
      await TauriAPI.setTrackRating(track.id, rating);
      const state = useStore.getState();
      state.setActivePlaybackTracks(
        state.activePlaybackTracks.map((item) =>
          item.id === track.id ? { ...item, rating } : item
        )
      );
      await library.refreshTracks();
    } catch {
      toast.showError('Could not save rating');
    } finally {
      setRatingBusy(false);
    }
  };
  return (
    <div
      className="@container flex h-full flex-col gap-1.5 text-slate-200"
      style={{ containerType: 'size' }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span
          role="status"
          aria-live="polite"
          className="flex min-w-0 items-center gap-1.5 text-xs text-slate-400"
        >
          {loading && <Loader className="h-3 w-3 animate-spin" />}
          {loading
            ? 'Opening track…'
            : error
              ? 'Playback unavailable'
              : playing
                ? 'Playing'
                : track
                  ? 'Paused'
                  : 'Ready to play'}
        </span>
        <WindowToolbar label="Player actions">
          <WindowToolButton label="Mini Player" onClick={() => setMini(true)}>
            <Minimize2 className="h-4 w-4" />
          </WindowToolButton>
          <WindowToolButton
            label="Open Settings"
            tooltip="Open all settings"
            onClick={() => openWindow('options')}
          >
            <Settings className="h-4 w-4" />
          </WindowToolButton>
          <WindowToolButton
            label="Playback tools"
            onClick={() => setDialog('tools')}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </WindowToolButton>
          <WindowToolButton
            label="Track details and actions"
            disabled={!track}
            onClick={() => setDialog('track')}
          >
            <MoreHorizontal className="h-4 w-4" />
          </WindowToolButton>
        </WindowToolbar>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {track ? (
          <AlbumArt
            trackId={track.id}
            trackPath={track.path}
            size="player"
            className="shrink-0 shadow-lg"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-800">
            <Music className="h-9 w-9 text-slate-500" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-lg font-semibold leading-snug text-white @min-[400px]:text-xl"
            title={track ? titleFor(track) : undefined}
          >
            {track ? titleFor(track) : 'Choose your music'}
          </h3>
          {track ? (
            <>
              <button
                className="mt-0.5 block max-w-full truncate text-sm text-slate-300 hover:underline disabled:no-underline"
                disabled={!track.artist}
                onClick={() => browse('artist')}
                title={track.artist || 'Unknown artist'}
              >
                {track.artist || 'Unknown artist'}
              </button>
              <button
                className="block max-w-full truncate text-xs text-slate-400 hover:underline disabled:no-underline"
                disabled={!track.album}
                onClick={() => browse('album')}
                title={track.album || 'Unknown album'}
              >
                {track.album || 'Unknown album'}
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-slate-400">
                {(library.overview?.totalTracks ?? 0) > 0
                  ? 'Play music from your library or a playlist.'
                  : 'Add a music folder to begin.'}
              </p>
              <button
                className="mt-2 text-sm hover:underline"
                style={{ color: colors.accentHex }}
                onClick={() => openWindow('library')}
              >
                Open Library
              </button>
            </>
          )}
          {(speed !== 1 || sleep > 0 || stop) && (
            <button
              className="mt-1 block max-w-full truncate text-xs text-slate-400 hover:text-white"
              onClick={() => setDialog('tools')}
              aria-label="Active playback tools"
              title={[
                speed !== 1 ? `${speed}× speed` : '',
                sleep > 0 ? `Sleep timer on · ${sleep} min` : '',
                stop ? 'Stop after current' : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              {[
                speed !== 1 ? `${speed}×` : '',
                sleep > 0 ? 'Sleep timer on' : '',
                stop ? 'Stop after current' : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200"
        >
          <p>{error}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              disabled={!track || loading}
              className="inline-flex items-center gap-1 font-semibold hover:underline disabled:opacity-40"
              onClick={retryCurrentTrack}
            >
              <RefreshCw className="h-3 w-3" />
              Retry playback
            </button>
            <button
              className="hover:underline"
              onClick={() => openWindow('options')}
            >
              Audio settings
            </button>
            {track && (
              <button
                className="hover:underline"
                onClick={() => {
                  void TauriAPI.showInFolder(track.id, track.path).catch(() =>
                    toast.showError('Could not open the file location')
                  );
                }}
              >
                File location
              </button>
            )}
          </div>
        </div>
      )}
      <PlayerSeekbar
        key={`seek-${track?.id || 'empty'}`}
        track={track}
        disabled={!ready}
        onSeek={handleSeek}
      />
      <div className="flex shrink-0 items-center justify-center gap-3">
        <button
          className={iconButton}
          aria-label="Shuffle playback"
          aria-pressed={shuffle}
          title={`Shuffle: ${shuffle ? 'On' : 'Off'}`}
          style={
            shuffle
              ? {
                  color: colors.accentHex,
                  backgroundColor: 'rgb(51 65 85 / .6)',
                }
              : undefined
          }
          onClick={() => setShuffle((value) => !value)}
        >
          <Shuffle className="h-4 w-4" />
        </button>
        <button
          className={iconButton}
          disabled={!playbackTracks.length}
          aria-label="Previous track"
          title="Previous track; restart after 3 seconds"
          onClick={handlePrevTrack}
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          disabled={!track || loading}
          aria-label={
            loading
              ? 'Opening track'
              : playing
                ? 'Pause'
                : error
                  ? 'Retry playback'
                  : 'Play'
          }
          aria-pressed={playing}
          className={`flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-r ${colors.primary} text-white shadow-lg hover:opacity-90 disabled:opacity-40`}
          onClick={error ? retryCurrentTrack : togglePlay}
        >
          {loading ? (
            <Loader className="h-5 w-5 animate-spin" />
          ) : playing ? (
            <Pause className="h-6 w-6" />
          ) : (
            <Play className="ml-0.5 h-6 w-6" />
          )}
        </button>
        <button
          className={iconButton}
          disabled={!playbackTracks.length}
          aria-label="Next track"
          title="Next track"
          onClick={handleNextTrack}
        >
          <SkipForward className="h-5 w-5" />
        </button>
        <button
          className={`${iconButton} relative`}
          aria-label={`Repeat mode: ${repeat}`}
          aria-pressed={repeat !== 'off'}
          title={`Repeat: ${repeat}`}
          style={
            repeat !== 'off'
              ? {
                  color: colors.accentHex,
                  backgroundColor: 'rgb(51 65 85 / .6)',
                }
              : undefined
          }
          onClick={() =>
            setRepeat(
              repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off'
            )
          }
        >
          <Repeat className="h-4 w-4" />
          {repeat === 'one' && (
            <span className="absolute right-0 top-0 text-[10px]">1</span>
          )}
        </button>
      </div>
      <PlayerVolume
        disabled={!!audioBackendError}
        onChange={handleVolumeChange}
        onMute={handleToggleMute}
      />
      <PlayerLoopControls
        key={`loop-${track?.id || 'empty'}`}
        disabled={!ready}
      />
      {track && (
        <div className="mt-auto space-y-2 pt-1">
          <button
            className="flex w-full min-w-0 items-center justify-between gap-2 text-xs text-slate-400 hover:text-white"
            title="Show current track in its source"
            onClick={() =>
              isPlaylistSource
                ? revealTrack(track.id, 'playlist')
                : browse('track')
            }
          >
            <span className="truncate">From {sourceName}</span>
            <span className="shrink-0 tabular-nums">
              {(index ?? 0) + 1} / {playbackTracks.length.toLocaleString()}
            </span>
          </button>
          <Upcoming />
        </div>
      )}
      {dialog === 'tools' && (
        <PlayerDialog title="Playback tools" onClose={closeDialog}>
          <PlayerTools onNavigate={closeDialog} />
        </PlayerDialog>
      )}
      {dialog === 'track' && track && (
        <PlayerDialog title="Track details" onClose={closeDialog}>
          <h4 className="font-semibold text-white">{titleFor(track)}</h4>
          <p className="mt-1 text-sm text-slate-400">
            {track.artist || 'Unknown artist'} ·{' '}
            {track.album || 'Unknown album'}
          </p>
          <dl className="my-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-400">File type</dt>
            <dd>{track.path.split('.').pop()?.toUpperCase()}</dd>
            <dt className="text-slate-400">Library duration</dt>
            <dd>{formatDuration(track.duration)}</dd>
            <dt className="text-slate-400">Bitrate</dt>
            <dd>{track.bitrate ? `${track.bitrate} kbps` : 'Unknown'}</dd>
            {track.genre && (
              <>
                <dt className="text-slate-400">Genre</dt>
                <dd>{track.genre}</dd>
              </>
            )}
            {track.year && (
              <>
                <dt className="text-slate-400">Year</dt>
                <dd>{track.year}</dd>
              </>
            )}
          </dl>
          <div className={ratingBusy ? 'pointer-events-none opacity-50' : ''}>
            <StarRating
              rating={track.rating}
              onRatingChange={(value) => {
                void rate(value);
              }}
            />
          </div>
          <p className="my-4 break-all text-xs text-slate-400">{track.path}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <button
              className="inline-flex items-center gap-1 hover:underline"
              onClick={() => {
                setDialog(null);
                setTagEditorTrack(track);
              }}
            >
              <Tag className="h-4 w-4" />
              Edit tags
            </button>
            <button
              className="inline-flex items-center gap-1 hover:underline"
              onClick={() => {
                void TauriAPI.showInFolder(track.id, track.path).catch(() =>
                  toast.showError('Could not open the file location')
                );
              }}
            >
              <FolderOpen className="h-4 w-4" />
              File location
            </button>
          </div>
        </PlayerDialog>
      )}
    </div>
  );
}
