/**
 * Window Registry — static, declarative list of all available windows.
 *
 * Each window component is self-sufficient: it reads its own state from
 * useStore / usePlayerContext / useCurrentColors.  No props are passed.
 *
 * Components are lazy-loaded so only the windows the user opens are
 * included in the initial bundle.
 */
import React from 'react';
import {
  Music, Settings, List, Sliders, FolderOpen, ListOrdered,
  History, Disc, Sparkles, FileText, Keyboard, BarChart3, Tag, Library,
} from 'lucide-react';

const PlayerWindow        = React.lazy(() => import('./windows/PlayerWindow').then(m => ({ default: m.PlayerWindow })));
const PlaylistWindow      = React.lazy(() => import('./windows/PlaylistWindow').then(m => ({ default: m.PlaylistWindow })));
const LibraryWindow       = React.lazy(() => import('./windows/LibraryWindow').then(m => ({ default: m.LibraryWindow })));
const EqualizerWindow     = React.lazy(() => import('./windows/EqualizerWindow').then(m => ({ default: m.EqualizerWindow })));
const VisualizerWindow    = React.lazy(() => import('./windows/VisualizerWindow').then(m => ({ default: m.VisualizerWindow })));
const OptionsWindow       = React.lazy(() => import('./windows/OptionsWindowEnhanced').then(m => ({ default: m.OptionsWindowEnhanced })));
const QueueWindow         = React.lazy(() => import('./windows/QueueWindow').then(m => ({ default: m.QueueWindow })));
const HistoryWindow       = React.lazy(() => import('./windows/HistoryWindow').then(m => ({ default: m.HistoryWindow })));
const AlbumViewWindow     = React.lazy(() => import('./windows/AlbumViewWindow').then(m => ({ default: m.AlbumViewWindow })));
const SmartPlaylistsWindow = React.lazy(() => import('./windows/SmartPlaylistsWindow').then(m => ({ default: m.SmartPlaylistsWindow })));
const LibraryStatsWindow  = React.lazy(() => import('./windows/LibraryStatsWindow').then(m => ({ default: m.LibraryStatsWindow })));
const TagEditorWindow     = React.lazy(() => import('./windows/TagEditorWindow').then(m => ({ default: m.TagEditorWindow })));
const DiscographyWindow   = React.lazy(() => import('./windows/DiscographyWindow').then(m => ({ default: m.DiscographyWindow })));
const LyricsWindow        = React.lazy(() => import('./windows/LyricsWindow'));
const ShortcutsWindow     = React.lazy(() => import('./windows/ShortcutsWindow'));

/** @type {Array<{ id: string; title: string; icon: import('lucide-react').LucideIcon; Component: React.ComponentType }>} */
export const WINDOW_REGISTRY = [
  { id: 'player',         title: 'Player',             icon: Music,     Component: PlayerWindow },
  { id: 'playlist',       title: 'Playlist',           icon: List,      Component: PlaylistWindow },
  { id: 'library',        title: 'Library',            icon: FolderOpen, Component: LibraryWindow },
  { id: 'equalizer',      title: 'Equalizer',          icon: Sliders,   Component: EqualizerWindow },
  { id: 'visualizer',     title: 'Visualizer',         icon: Music,     Component: VisualizerWindow },
  { id: 'options',        title: 'Options',            icon: Settings,  Component: OptionsWindow },
  { id: 'queue',          title: 'Queue',              icon: ListOrdered, Component: QueueWindow },
  { id: 'history',        title: 'History',            icon: History,   Component: HistoryWindow },
  { id: 'albums',         title: 'Albums',             icon: Disc,      Component: AlbumViewWindow },
  { id: 'smartPlaylists', title: 'Smart Playlists',    icon: Sparkles,  Component: SmartPlaylistsWindow },
  { id: 'lyrics',         title: 'Lyrics',             icon: FileText,  Component: LyricsWindow },
  { id: 'shortcuts',      title: 'Keyboard Shortcuts', icon: Keyboard,  Component: ShortcutsWindow },
  { id: 'stats',          title: 'Library Stats',      icon: BarChart3, Component: LibraryStatsWindow },
  { id: 'tagEditor',      title: 'Tag Editor',         icon: Tag,       Component: TagEditorWindow },
  { id: 'discography',    title: 'Discography',        icon: Library,   Component: DiscographyWindow },
];
