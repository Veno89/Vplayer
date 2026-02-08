/**
 * Window Registry — static, declarative list of all available windows.
 *
 * Each window component is self-sufficient: it reads its own state from
 * useStore / usePlayerContext / useCurrentColors.  No props are passed.
 *
 * This replaces the former useWindowConfigs hook, which threaded ~70 props
 * through a single mega-hub and rebuilt JSX on every state change.
 */
import {
  Music, Settings, List, Sliders, FolderOpen, ListOrdered,
  History, Disc, Sparkles, FileText, Keyboard, BarChart3, Tag, Library,
} from 'lucide-react';

import { PlayerWindow }        from './windows/PlayerWindow';
import { PlaylistWindow }      from './windows/PlaylistWindow';
import { LibraryWindow }       from './windows/LibraryWindow';
import { EqualizerWindow }     from './windows/EqualizerWindow';
import { VisualizerWindow }    from './windows/VisualizerWindow';
import { OptionsWindowEnhanced as OptionsWindow } from './windows/OptionsWindowEnhanced';
import { QueueWindow }         from './windows/QueueWindow';
import { HistoryWindow }       from './windows/HistoryWindow';
import { AlbumViewWindow }     from './windows/AlbumViewWindow';
import { SmartPlaylistsWindow } from './windows/SmartPlaylistsWindow';
import { LibraryStatsWindow }  from './windows/LibraryStatsWindow';
import { TagEditorWindow }     from './windows/TagEditorWindow';
import { DiscographyWindow }   from './windows/DiscographyWindow';
import LyricsWindow            from './windows/LyricsWindow';
import ShortcutsWindow         from './windows/ShortcutsWindow';

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
