import React, { useState, useMemo } from 'react';
import { Settings, Palette, Volume2, Info, Layout, Search, Play, Music, Sliders, Zap, Database } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { usePlayerContext } from '../context/PlayerProvider';
import { useUpdater } from '../hooks/useUpdater';
import type { ColorScheme } from '../store/types';

// Import tab components
import { AppearanceTab } from './options/AppearanceTab';
import { PlaybackTab } from './options/PlaybackTab';
import { LibraryTab } from './options/LibraryTab';
import { AudioTab } from './options/AudioTab';
import { BehaviorTab } from './options/BehaviorTab';
import { PerformanceTab } from './options/PerformanceTab';
import { AdvancedTab } from './options/AdvancedTab';
import { WindowsTab } from './options/WindowsTab';

// Tab configuration with searchable keywords
const TABS = [
  {
    id: 'appearance', label: 'Appearance', icon: Palette, color: 'purple',
    keywords: ['theme', 'color', 'background', 'wallpaper', 'opacity', 'font', 'size', 'blur', 'dark', 'light']
  },
  {
    id: 'playback', label: 'Playback', icon: Play, color: 'cyan',
    keywords: ['gapless', 'autoplay', 'resume', 'fade', 'crossfade', 'replaygain', 'volume', 'normalization']
  },
  {
    id: 'library', label: 'Library', icon: Music, color: 'amber',
    keywords: ['folder', 'scan', 'watch', 'duplicate', 'album art']
  },
  {
    id: 'audio', label: 'Audio', icon: Volume2, color: 'violet',
    keywords: ['device', 'output', 'speaker', 'speed', 'tempo', 'sample rate']
  },
  {
    id: 'behavior', label: 'Behavior', icon: Sliders, color: 'emerald',
    keywords: ['tray', 'minimize', 'close', 'notification', 'confirm', 'delete', 'grid', 'snap', 'layout', 'shortcut', 'keyboard']
  },
  {
    id: 'performance', label: 'Performance', icon: Zap, color: 'pink',
    keywords: ['cache', 'memory', 'cpu']
  },
  {
    id: 'advanced', label: 'Advanced', icon: Database, color: 'red',
    keywords: ['database', 'storage', 'export', 'import', 'backup', 'reset', 'debug', 'clear', 'optimize']
  },
  {
    id: 'windows', label: 'Windows', icon: Layout, color: 'blue',
    keywords: ['visible', 'hidden', 'show', 'hide', 'position', 'reset', 'layout']
  },
  {
    id: 'about', label: 'About', icon: Info, color: 'slate',
    keywords: ['version', 'update', 'credits', 'info', 'vplayer']
  },
];

export function OptionsWindowEnhanced() {
  // ── Store state ───────────────────────────────────────────────────
  const windows = useStore(s => s.windows);
  const toggleWindow = useStore(s => s.toggleWindow);
  const colorScheme = useStore(s => s.colorScheme);
  const setColorScheme = useStore(s => s.setColorScheme);
  const getLayouts = useStore(s => s.getLayouts);
  const layouts = getLayouts();
  const currentLayout = useStore(s => s.currentLayout);
  const applyLayout = useStore(s => s.applyLayout);
  const backgroundImage = useStore(s => s.backgroundImage);
  const setBackgroundImage = useStore(s => s.setBackgroundImage);
  const backgroundBlur = useStore(s => s.backgroundBlur);
  const setBackgroundBlur = useStore(s => s.setBackgroundBlur);
  const backgroundOpacity = useStore(s => s.backgroundOpacity);
  const setBackgroundOpacity = useStore(s => s.setBackgroundOpacity);
  const windowOpacity = useStore(s => s.windowOpacity);
  const setWindowOpacity = useStore(s => s.setWindowOpacity);
  const fontSize = useStore(s => s.fontSize);
  const setFontSize = useStore(s => s.setFontSize);
  const debugVisible = useStore(s => s.debugVisible);
  const setDebugVisible = useStore(s => s.setDebugVisible);
  const setThemeEditorOpen = useStore(s => s.setThemeEditorOpen);

  // ── Context / derived ─────────────────────────────────────────────
  const { crossfade } = usePlayerContext();
  const currentColors = useCurrentColors();
  const onOpenThemeEditor = () => setThemeEditorOpen(true);
  const [activeTab, setActiveTab] = useState('appearance');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter tabs based on search - matches tab name, id, or keywords
  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return TABS;
    const query = searchQuery.toLowerCase();
    return TABS.filter(tab =>
      tab.label.toLowerCase().includes(query) ||
      tab.id.toLowerCase().includes(query) ||
      tab.keywords?.some(keyword => keyword.toLowerCase().includes(query))
    );
  }, [searchQuery]);

  // Auto-switch to first matching tab when search finds a match
  React.useEffect(() => {
    if (searchQuery.trim() && filteredTabs.length > 0) {
      const currentTabStillVisible = filteredTabs.some(t => t.id === activeTab);
      if (!currentTabStillVisible) {
        setActiveTab(filteredTabs[0].id);
      }
    }
  }, [searchQuery, filteredTabs, activeTab]);

  // Render the active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'appearance':
        return (
          <AppearanceTab
            colorScheme={colorScheme}
            setColorScheme={setColorScheme}
            currentColors={currentColors}
            onOpenThemeEditor={onOpenThemeEditor}
            backgroundImage={backgroundImage}
            setBackgroundImage={setBackgroundImage}
            backgroundBlur={backgroundBlur}
            setBackgroundBlur={setBackgroundBlur}
            backgroundOpacity={backgroundOpacity}
            setBackgroundOpacity={setBackgroundOpacity}
            windowOpacity={windowOpacity}
            setWindowOpacity={setWindowOpacity}
            fontSize={fontSize}
            setFontSize={setFontSize}
          />
        );

      case 'playback':
        return <PlaybackTab crossfade={crossfade} />;

      case 'library':
        return <LibraryTab />;

      case 'audio':
        return <AudioTab />;

      case 'behavior':
        return (
          <BehaviorTab
            layouts={layouts}
            currentLayout={currentLayout}
            applyLayout={applyLayout}
            toggleWindow={toggleWindow}
          />
        );

      case 'performance':
        return <PerformanceTab />;

      case 'advanced':
        return (
          <AdvancedTab
            debugVisible={debugVisible}
            setDebugVisible={setDebugVisible}
          />
        );

      case 'windows':
        return (
          <WindowsTab
            windows={windows}
            toggleWindow={toggleWindow}
          />
        );

      case 'about':
        return <AboutTab currentColors={currentColors} />;

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-700/50">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
          <Settings className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-white font-semibold flex-1">Settings</h3>

        {/* Search Bar */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings..."
            onMouseDown={e => e.stopPropagation()}
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-4 p-1 bg-slate-800/30 rounded-xl overflow-x-auto">
        {filteredTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onMouseDown={e => e.stopPropagation()}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs transition-all whitespace-nowrap ${isActive
                ? 'bg-cyan-600 text-white font-medium shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto pr-1">
        {renderTabContent()}
      </div>
    </div>
  );
}

// About Tab (kept inline since it's simple and design-focused)
function AboutTab({ currentColors }: { currentColors: ColorScheme }) {
  const { checkForUpdates, updateAvailable, updateInfo, downloading, downloadProgress, downloadAndInstall, error } = useUpdater();
  const [currentVersion, setCurrentVersion] = React.useState('0.9.16');
  const [checking, setChecking] = React.useState(false);
  const [message, setMessage] = React.useState('');

  // Get actual version from Tauri on mount
  React.useEffect(() => {
    const getVersion = async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const version = await getVersion();
        setCurrentVersion(version);
      } catch (err) {
        console.debug('Could not get app version from Tauri:', err);
      }
    };
    getVersion();
  }, []);

  const handleCheckForUpdates = async () => {
    if (!checkForUpdates) {
      setMessage('Updater not available');
      return;
    }
    setChecking(true);
    setMessage('');
    try {
      const hasUpdate = await checkForUpdates();
      if (!hasUpdate && !updateAvailable) {
        // Check for error in the global updater object (since hook updates async)
        if (!error) {
          setMessage(`You are up to date! (v${currentVersion})`);
        }
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="text-center py-8">
        <div
          className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-5 shadow-2xl"
          style={{ boxShadow: '0 12px 40px rgba(6, 182, 212, 0.4)' }}
        >
          <svg className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
          </svg>
        </div>
        <h2 className="text-white text-4xl font-bold mb-2 tracking-tight">VPlayer</h2>
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            v{currentVersion}
          </span>
          <span className="text-slate-500 text-sm">Beta</span>
        </div>
        <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
          Fast, lightweight, and fully customizable music player for your desktop
        </p>

        {/* Update Checker */}
        <div className="mt-6">
          {updateAvailable ? (
            <div className="inline-flex flex-col gap-2">
              <div className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-sm">
                Update available: v{updateInfo?.version}
              </div>
              {downloading ? (
                <div className="text-xs text-slate-400">
                  Downloading... {downloadProgress}%
                </div>
              ) : (
                <button
                  onClick={downloadAndInstall}
                  onMouseDown={e => e.stopPropagation()}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors"
                >
                  Download & Install
                </button>
              )}
            </div>
          ) : (
            <div className="inline-flex flex-col gap-2 items-center">
              <button
                onClick={handleCheckForUpdates}
                onMouseDown={e => e.stopPropagation()}
                disabled={checking}
                className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {checking ? 'Checking...' : 'Check for Updates'}
              </button>
              {(message || error) && (
                <div className={`text-xs ${error || message?.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {error || message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tech Stack Cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { emoji: '🦀', title: 'Rust + Tauri', desc: 'Native performance' },
          { emoji: '⚛️', title: 'React + Zustand', desc: 'Reactive UI state' },
          { emoji: '🎵', title: 'Rodio + Symphonia', desc: 'Audio decoding' },
          { emoji: '🗃️', title: 'SQLite + Lofty', desc: 'Library & metadata' },
        ].map((tech, i) => (
          <div key={i} className="p-4 rounded-xl border border-slate-700/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{tech.emoji}</span>
              <span className="text-white text-sm font-semibold">{tech.title}</span>
            </div>
            <p className="text-slate-500 text-xs">{tech.desc}</p>
          </div>
        ))}
      </div>

      {/* Features */}
      <div className="p-5 rounded-xl border border-slate-700/50 bg-gradient-to-br from-slate-800/30 to-slate-900/30">
        <h4 className="text-white text-sm font-bold mb-4 flex items-center gap-2">
          <span>✨</span> Features
        </h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {[
            'Gapless playback', '10-band equalizer', 'Real-time visualizer', 'Crossfade transitions',
            'Smart playlists', 'Queue management', 'Lyrics support', 'Tag editor',
            'Customizable themes', 'Flexible layouts', 'Keyboard shortcuts', 'Folder watching',
            'MusicBrainz discography', 'Album cover art',
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-2 text-slate-300">
              <span className="text-cyan-400">●</span> {feature}
            </div>
          ))}
        </div>
      </div>

      {/* Credits / Footer */}
      <div className="text-center pt-6 border-t border-slate-700/50">
        <p className="text-slate-400 text-sm mb-2">
          Crafted by <span className="text-cyan-400 font-semibold">Veno</span>
        </p>
        <p className="text-slate-600 text-xs">
          © 2024-2026 • Built with passion and open source tech
        </p>
      </div>
    </div>
  );
}
