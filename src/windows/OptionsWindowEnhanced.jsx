import React, { useState, useEffect, useMemo } from 'react';
import { Settings, Palette, Volume2, Info, HardDrive, Loader, Layout, Image, Eye, Search, Play, Music, Sliders, Zap, Database, Trash2, RotateCw, Download, Upload, FileText } from 'lucide-react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store/useStore';

export function OptionsWindowEnhanced({
  windows,
  toggleWindow,
  colorScheme,
  setColorScheme,
  currentColors,
  layouts,
  currentLayout,
  applyLayout,
  crossfade,
  onOpenThemeEditor,
  backgroundImage,
  setBackgroundImage,
  backgroundBlur,
  setBackgroundBlur,
  backgroundOpacity,
  setBackgroundOpacity,
  windowOpacity,
  setWindowOpacity,
  fontSize,
  setFontSize,
  debugVisible,
  setDebugVisible,
}) {
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [switchingDevice, setSwitchingDevice] = useState(false);
  const [activeTab, setActiveTab] = useState('appearance');
  const [searchQuery, setSearchQuery] = useState('');
  const [cacheSize, setCacheSize] = useState(0);
  const [dbSize, setDbSize] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);

  // Get settings from store
  const gaplessPlayback = useStore(state => state.gaplessPlayback);
  const setGaplessPlayback = useStore(state => state.setGaplessPlayback);
  const autoPlayOnStartup = useStore(state => state.autoPlayOnStartup);
  const setAutoPlayOnStartup = useStore(state => state.setAutoPlayOnStartup);
  const resumeLastTrack = useStore(state => state.resumeLastTrack);
  const setResumeLastTrack = useStore(state => state.setResumeLastTrack);
  const skipSilence = useStore(state => state.skipSilence);
  const setSkipSilence = useStore(state => state.setSkipSilence);
  const replayGainMode = useStore(state => state.replayGainMode);
  const setReplayGainMode = useStore(state => state.setReplayGainMode);
  const replayGainPreamp = useStore(state => state.replayGainPreamp);
  const setReplayGainPreamp = useStore(state => state.setReplayGainPreamp);

  const autoScanOnStartup = useStore(state => state.autoScanOnStartup);
  const setAutoScanOnStartup = useStore(state => state.setAutoScanOnStartup);
  const watchFolderChanges = useStore(state => state.watchFolderChanges);
  const setWatchFolderChanges = useStore(state => state.setWatchFolderChanges);
  const duplicateSensitivity = useStore(state => state.duplicateSensitivity);
  const setDuplicateSensitivity = useStore(state => state.setDuplicateSensitivity);

  const minimizeToTray = useStore(state => state.minimizeToTray);
  const setMinimizeToTray = useStore(state => state.setMinimizeToTray);
  const closeToTray = useStore(state => state.closeToTray);
  const setCloseToTray = useStore(state => state.setCloseToTray);
  const startMinimized = useStore(state => state.startMinimized);
  const setStartMinimized = useStore(state => state.setStartMinimized);
  const rememberWindowPositions = useStore(state => state.rememberWindowPositions);
  const setRememberWindowPositions = useStore(state => state.setRememberWindowPositions);
  const autoResizeWindow = useStore(state => state.autoResizeWindow);
  const setAutoResizeWindow = useStore(state => state.setAutoResizeWindow);

  const cacheSizeLimit = useStore(state => state.cacheSizeLimit);
  const setCacheSizeLimit = useStore(state => state.setCacheSizeLimit);
  const maxConcurrentScans = useStore(state => state.maxConcurrentScans);
  const setMaxConcurrentScans = useStore(state => state.setMaxConcurrentScans);
  const thumbnailQuality = useStore(state => state.thumbnailQuality);
  const setThumbnailQuality = useStore(state => state.setThumbnailQuality);

  useEffect(() => {
    loadAudioDevices();
    loadStats();
  }, []);

  const loadAudioDevices = async () => {
    try {
      setLoadingDevices(true);
      const devices = await invoke('get_audio_devices');
      setAudioDevices(devices);
      const defaultDevice = devices.find(d => d.is_default);
      if (defaultDevice) {
        setSelectedDevice(defaultDevice.name);
      }
    } catch (err) {
      console.error('Failed to load audio devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  };

  const handleDeviceChange = async (deviceName) => {
    try {
      setSwitchingDevice(true);
      await invoke('set_audio_device', { deviceName });
      setSelectedDevice(deviceName);
    } catch (err) {
      console.error('Failed to set audio device:', err);
      alert(`Failed to set audio device: ${err}`);
    } finally {
      setSwitchingDevice(false);
    }
  };

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const [cache, db] = await Promise.all([
        invoke('get_cache_size'),
        invoke('get_database_size')
      ]);
      setCacheSize(cache);
      setDbSize(db);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Clear album art cache? This will remove all cached album covers.')) return;
    try {
      await invoke('clear_album_art_cache');
      await loadStats();
      alert('Cache cleared successfully');
    } catch (err) {
      alert(`Failed to clear cache: ${err}`);
    }
  };

  const handleVacuumDb = async () => {
    if (!confirm('Optimize database? This may take a moment.')) return;
    try {
      await invoke('vacuum_database');
      await loadStats();
      alert('Database optimized successfully');
    } catch (err) {
      alert(`Failed to optimize database: ${err}`);
    }
  };

  const handleExportSettings = async () => {
    try {
      const filePath = await save({
        defaultPath: 'vplayer-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (!filePath) return;

      const settings = {
        colorScheme,
        backgroundBlur,
        backgroundOpacity,
        windowOpacity,
        fontSize,
        gaplessPlayback,
        autoPlayOnStartup,
        resumeLastTrack,
        skipSilence,
        replayGainMode,
        replayGainPreamp,
        autoScanOnStartup,
        watchFolderChanges,
        duplicateSensitivity,
        minimizeToTray,
        closeToTray,
        startMinimized,
        rememberWindowPositions,
        cacheSizeLimit,
        maxConcurrentScans,
        thumbnailQuality,
      };

      // Would need a Rust command to write file
      console.log('Export settings:', settings);
      alert('Settings export not yet implemented');
    } catch (err) {
      alert(`Failed to export settings: ${err}`);
    }
  };

  const colorSchemes = [
    { name: 'default', label: 'Classic Cyan', accent: 'text-cyan-400', background: '#0f172a', backgroundSecondary: '#1e293b', primary: 'bg-cyan-500', color: '#06b6d4' },
    { name: 'blue', label: 'Ocean Blue', accent: 'text-blue-400', background: '#0c1929', backgroundSecondary: '#1e3a5f', primary: 'bg-blue-500', color: '#3b82f6' },
    { name: 'emerald', label: 'Forest Green', accent: 'text-emerald-400', background: '#022c22', backgroundSecondary: '#064e3b', primary: 'bg-emerald-500', color: '#10b981' },
    { name: 'rose', label: 'Sunset Rose', accent: 'text-rose-400', background: '#1c0a14', backgroundSecondary: '#4c0519', primary: 'bg-rose-500', color: '#f43f5e' },
    { name: 'amber', label: 'Golden Amber', accent: 'text-amber-400', background: '#1c1509', backgroundSecondary: '#451a03', primary: 'bg-amber-500', color: '#f59e0b' },
    { name: 'purple', label: 'Royal Purple', accent: 'text-purple-400', background: '#1a0a2e', backgroundSecondary: '#3b0764', primary: 'bg-purple-500', color: '#a855f7' },
    { name: 'pink', label: 'Bubblegum Pink', accent: 'text-pink-400', background: '#1f0818', backgroundSecondary: '#500724', primary: 'bg-pink-500', color: '#ec4899' },
    { name: 'indigo', label: 'Deep Indigo', accent: 'text-indigo-400', background: '#0f0d1e', backgroundSecondary: '#1e1b4b', primary: 'bg-indigo-500', color: '#6366f1' },
    { name: 'teal', label: 'Ocean Teal', accent: 'text-teal-400', background: '#042f2e', backgroundSecondary: '#134e4a', primary: 'bg-teal-500', color: '#14b8a6' },
    { name: 'orange', label: 'Tangerine', accent: 'text-orange-400', background: '#1c1008', backgroundSecondary: '#431407', primary: 'bg-orange-500', color: '#f97316' },
    { name: 'slate', label: 'Midnight Slate', accent: 'text-slate-300', background: '#020617', backgroundSecondary: '#0f172a', primary: 'bg-slate-500', color: '#64748b' },
    { name: 'red', label: 'Cherry Red', accent: 'text-red-400', background: '#1c0808', backgroundSecondary: '#450a0a', primary: 'bg-red-500', color: '#ef4444' },
    // Premium gradient themes
    { name: 'sunset', label: 'Sunset Gradient', accent: 'text-orange-300', background: '#1a0a1e', backgroundSecondary: '#3d1a2e', primary: 'bg-gradient-to-r from-orange-500 to-pink-500', color: '#f97316', isGradient: true },
    { name: 'ocean', label: 'Deep Ocean', accent: 'text-cyan-300', background: '#0a1628', backgroundSecondary: '#0c2439', primary: 'bg-gradient-to-r from-cyan-500 to-blue-500', color: '#06b6d4', isGradient: true },
    { name: 'forest', label: 'Enchanted Forest', accent: 'text-lime-300', background: '#0a1a0a', backgroundSecondary: '#14352a', primary: 'bg-gradient-to-r from-emerald-500 to-lime-500', color: '#22c55e', isGradient: true },
    { name: 'synthwave', label: 'Synthwave', accent: 'text-fuchsia-400', background: '#0d0221', backgroundSecondary: '#1a0536', primary: 'bg-gradient-to-r from-fuchsia-500 to-cyan-400', color: '#d946ef', isGradient: true },
    { name: 'monochrome', label: 'Monochrome', accent: 'text-neutral-200', background: '#0a0a0a', backgroundSecondary: '#171717', primary: 'bg-neutral-600', color: '#a3a3a3' },
  ];

  const tabs = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'playback', label: 'Playback', icon: Play },
    { id: 'library', label: 'Library', icon: Music },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'behavior', label: 'Behavior', icon: Sliders },
    { id: 'performance', label: 'Performance', icon: Zap },
    { id: 'advanced', label: 'Advanced', icon: Database },
    { id: 'windows', label: 'Windows', icon: Layout },
    { id: 'about', label: 'About', icon: Info },
  ];

  // Filter tabs and settings based on search
  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return tabs;
    const query = searchQuery.toLowerCase();
    return tabs.filter(tab => 
      tab.label.toLowerCase().includes(query) ||
      tab.id.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-700">
        <Settings className={`w-5 h-5 ${currentColors.accent}`} />
        <h3 className="text-white font-semibold flex-1">Settings</h3>
        
        {/* Search Bar */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-4 bg-slate-800/50 rounded p-1 overflow-x-auto">
        {filteredTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onMouseDown={e => e.stopPropagation()}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded text-xs transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? `${currentColors.primary} text-white font-medium`
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
      <div className="flex-1 overflow-y-auto pr-2">
        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-white text-sm font-medium">Color Theme</h4>
                {onOpenThemeEditor && (
                  <button
                    onClick={onOpenThemeEditor}
                    onMouseDown={e => e.stopPropagation()}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs flex items-center gap-1"
                  >
                    <Palette className="w-3 h-3" />
                    Custom Themes
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {colorSchemes.map((scheme) => (
                  <button
                    key={scheme.name}
                    onClick={() => setColorScheme(scheme.name)}
                    onMouseDown={e => e.stopPropagation()}
                    className={`relative p-3 rounded-lg border-2 transition-all ${
                      colorScheme === scheme.name
                        ? 'border-white shadow-lg scale-105'
                        : 'border-transparent hover:border-white/30'
                    }`}
                    style={{ 
                      background: `linear-gradient(135deg, ${scheme.background}, ${scheme.backgroundSecondary})`,
                    }}
                  >
                    {/* Theme preview mini-window */}
                    <div 
                      className="mb-2 rounded-md overflow-hidden border"
                      style={{ 
                        borderColor: `${scheme.color}40`,
                        background: scheme.backgroundSecondary,
                      }}
                    >
                      {/* Mini header */}
                      <div 
                        className="h-3 flex items-center px-1.5 gap-1"
                        style={{ background: `${scheme.color}20` }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: scheme.color }} />
                        <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: `${scheme.color}40` }} />
                      </div>
                      {/* Mini content */}
                      <div className="p-1.5 space-y-1">
                        <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: `${scheme.color}60` }} />
                        <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: `${scheme.color}30` }} />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div 
                        className={`w-5 h-5 rounded-full ${scheme.isGradient ? scheme.primary : ''}`}
                        style={!scheme.isGradient ? { backgroundColor: scheme.color } : {}}
                      />
                      <span className="text-white text-xs font-medium truncate">{scheme.label}</span>
                    </div>
                    
                    {/* Accent color bar */}
                    <div className="flex gap-0.5 mt-2">
                      <div 
                        className={`flex-1 h-1 rounded-full ${scheme.isGradient ? scheme.primary : ''}`}
                        style={!scheme.isGradient ? { backgroundColor: scheme.color, opacity: 0.9 } : {}}
                      />
                      <div 
                        className="flex-1 h-1 rounded-full" 
                        style={{ backgroundColor: scheme.color, opacity: 0.5 }}
                      />
                      <div 
                        className="flex-1 h-1 rounded-full" 
                        style={{ backgroundColor: scheme.color, opacity: 0.25 }}
                      />
                    </div>
                    
                    {colorScheme === scheme.name && (
                      <div className="absolute top-2 right-2">
                        <div className="w-2 h-2 rounded-full bg-white shadow-glow" />
                      </div>
                    )}
                    
                    {scheme.isGradient && (
                      <div className="absolute bottom-2 right-2">
                        <span className="text-[8px] text-white/60 uppercase tracking-wider">Pro</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700 space-y-4">
              {/* Background Image */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-slate-300 text-sm font-medium flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Background Image
                  </label>
                  <button
                    onClick={async () => {
                      try {
                        const selected = await open({
                          multiple: false,
                          filters: [{
                            name: 'Images',
                            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp']
                          }]
                        });
                        if (selected) {
                          const assetUrl = convertFileSrc(selected);
                          setBackgroundImage(assetUrl);
                        }
                      } catch (err) {
                        console.error('Failed to select image:', err);
                      }
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                  >
                    Choose Image
                  </button>
                </div>
                {backgroundImage && (
                  <>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                      <span className="truncate flex-1">{backgroundImage.split('/').pop()}</span>
                      <button
                        onClick={() => setBackgroundImage(null)}
                        onMouseDown={e => e.stopPropagation()}
                        className="text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-slate-400 text-xs mb-2 block">
                          Blur: {backgroundBlur}px
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="30"
                          value={backgroundBlur}
                          onChange={e => setBackgroundBlur(Number(e.target.value))}
                          onMouseDown={e => e.stopPropagation()}
                          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-2 block">
                          Opacity: {Math.round(backgroundOpacity * 100)}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={backgroundOpacity}
                          onChange={e => setBackgroundOpacity(Number(e.target.value))}
                          onMouseDown={e => e.stopPropagation()}
                          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Window Opacity */}
              <div className="pt-4 border-t border-slate-700">
                <label className="text-slate-300 text-sm font-medium mb-3 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Window Opacity: {Math.round(windowOpacity * 100)}%
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.05"
                  value={windowOpacity}
                  onChange={e => setWindowOpacity(Number(e.target.value))}
                  onMouseDown={e => e.stopPropagation()}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>

              {/* Font Size */}
              <div className="pt-4 border-t border-slate-700">
                <label className="text-slate-300 text-sm font-medium mb-3 block">
                  Font Size: {fontSize}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="20"
                  step="1"
                  value={fontSize}
                  onChange={e => setFontSize(Number(e.target.value))}
                  onMouseDown={e => e.stopPropagation()}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Playback Tab */}
        {activeTab === 'playback' && (
          <div className="space-y-4">
            <SettingToggle
              label="Gapless Playback"
              description="Seamless transitions between tracks"
              checked={gaplessPlayback}
              onChange={setGaplessPlayback}
            />
            <SettingToggle
              label="Auto-play on Startup"
              description="Start playing automatically when app launches"
              checked={autoPlayOnStartup}
              onChange={setAutoPlayOnStartup}
            />
            <SettingToggle
              label="Resume Last Track"
              description="Continue from where you left off"
              checked={resumeLastTrack}
              onChange={setResumeLastTrack}
            />
            <SettingToggle
              label="Skip Silence"
              description="Automatically skip silent parts of tracks"
              checked={skipSilence}
              onChange={setSkipSilence}
            />

            <div className="pt-4 border-t border-slate-700">
              <label className="text-slate-300 text-sm font-medium mb-3 block">
                ReplayGain Mode
              </label>
              <select
                value={replayGainMode}
                onChange={(e) => setReplayGainMode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
              >
                <option value="off">Off</option>
                <option value="track">Track Gain</option>
                <option value="album">Album Gain</option>
              </select>
            </div>

            {replayGainMode !== 'off' && (
              <div>
                <label className="text-slate-300 text-sm font-medium mb-3 block">
                  ReplayGain Pre-amp: {replayGainPreamp > 0 ? '+' : ''}{replayGainPreamp} dB
                </label>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="0.5"
                  value={replayGainPreamp}
                  onChange={(e) => setReplayGainPreamp(Number(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            )}
          </div>
        )}

        {/* Library Tab */}
        {activeTab === 'library' && (
          <div className="space-y-4">
            <SettingToggle
              label="Auto-scan on Startup"
              description="Automatically scan library folders when app starts"
              checked={autoScanOnStartup}
              onChange={setAutoScanOnStartup}
            />
            <SettingToggle
              label="Watch Folder Changes"
              description="Automatically detect new/removed files"
              checked={watchFolderChanges}
              onChange={setWatchFolderChanges}
            />

            <div className="pt-4 border-t border-slate-700">
              <label className="text-slate-300 text-sm font-medium mb-3 block">
                Duplicate Detection Sensitivity
              </label>
              <select
                value={duplicateSensitivity}
                onChange={(e) => setDuplicateSensitivity(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
              >
                <option value="low">Low - Exact matches only</option>
                <option value="medium">Medium - Similar titles/artists</option>
                <option value="high">High - Fuzzy matching</option>
              </select>
            </div>
          </div>
        )}

        {/* Audio Tab */}
        {activeTab === 'audio' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Audio Output Device
              </h4>
              
              {loadingDevices ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Loading audio devices...</span>
                </div>
              ) : audioDevices.length === 0 ? (
                <div className="text-slate-400 text-sm py-4">
                  No audio devices found
                </div>
              ) : (
                <div className="space-y-2">
                  {audioDevices.map((device, idx) => (
                    <label
                      key={idx}
                      onMouseDown={e => e.stopPropagation()}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedDevice === device.name
                          ? `border-cyan-500 bg-cyan-500/10`
                          : 'border-slate-700 hover:border-slate-600 bg-slate-800/30'
                      } ${switchingDevice ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <input
                        type="radio"
                        name="audio-device"
                        checked={selectedDevice === device.name}
                        onChange={() => handleDeviceChange(device.name)}
                        onMouseDown={e => e.stopPropagation()}
                        disabled={switchingDevice}
                        className="w-4 h-4 accent-cyan-500"
                      />
                      <div className="flex-1">
                        <div className="text-white text-sm font-medium flex items-center gap-2">
                          {device.name}
                          {device.is_default && (
                            <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded">
                              Default
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <button
                onClick={loadAudioDevices}
                onMouseDown={e => e.stopPropagation()}
                disabled={loadingDevices || switchingDevice}
                className="mt-3 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition-colors disabled:opacity-50"
              >
                {switchingDevice ? 'Switching Device...' : 'Refresh Devices'}
              </button>
            </div>

            {crossfade && (
              <div className="pt-4 border-t border-slate-700">
                <h4 className="text-white text-sm font-medium mb-3">Crossfade</h4>
                
                <div className="space-y-3">
                  <SettingToggle
                    label="Enable Crossfade"
                    description="Fade between tracks smoothly"
                    checked={crossfade.enabled}
                    onChange={crossfade.toggleEnabled}
                  />

                  {crossfade.enabled && (
                    <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white text-sm">Duration</span>
                        <span className="text-cyan-400 text-sm font-medium">
                          {(crossfade.duration / 1000).toFixed(1)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1000"
                        max="10000"
                        step="500"
                        value={crossfade.duration}
                        onChange={(e) => crossfade.setDuration(parseInt(e.target.value))}
                        onMouseDown={e => e.stopPropagation()}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>1s</span>
                        <span>10s</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Behavior Tab */}
        {activeTab === 'behavior' && (
          <div className="space-y-4">
            <SettingToggle
              label="Minimize to Tray"
              description="Minimize to system tray instead of taskbar"
              checked={minimizeToTray}
              onChange={setMinimizeToTray}
            />
            <SettingToggle
              label="Close to Tray"
              description="Keep app running in tray when closed"
              checked={closeToTray}
              onChange={setCloseToTray}
            />
            <SettingToggle
              label="Start Minimized"
              description="Launch app minimized to tray"
              checked={startMinimized}
              onChange={setStartMinimized}
            />
            <SettingToggle
              label="Remember Window Positions"
              description="Save and restore window layouts"
              checked={rememberWindowPositions}
              onChange={setRememberWindowPositions}
            />
            <SettingToggle
              label="Auto-Resize Main Window"
              description="Automatically resize main window to fit all visible windows"
              checked={autoResizeWindow}
              onChange={setAutoResizeWindow}
            />

            <div className="pt-4 border-t border-slate-700">
              <h4 className="text-white text-sm font-medium mb-2">Window Layouts</h4>
              <div className="grid grid-cols-4 gap-2">
                {layouts?.map((layout) => {
                  const colors = {
                    player: 'bg-cyan-500',
                    playlist: 'bg-emerald-500',
                    library: 'bg-amber-500',
                    equalizer: 'bg-violet-500',
                    visualizer: 'bg-pink-500',
                    queue: 'bg-orange-500',
                  };
                  return (
                    <button
                      key={layout.name}
                      onClick={() => applyLayout(layout.name)}
                      onMouseDown={e => e.stopPropagation()}
                      className={`p-2 rounded-lg border-2 text-left transition-all ${
                        currentLayout === layout.name
                          ? `border-cyan-500 bg-cyan-500/10`
                          : 'border-slate-700 hover:border-slate-500 bg-slate-800/30'
                      }`}
                      title={layout.description}
                    >
                      {/* Compact Layout Preview */}
                      <div className="relative w-full h-12 bg-slate-900 rounded mb-1 overflow-hidden">
                        {layout.preview?.map((win, idx) => (
                          <div
                            key={idx}
                            className={`absolute ${colors[win.id] || 'bg-slate-500'} rounded-[2px]`}
                            style={{
                              left: `${(win.x / 13) * 100}%`,
                              top: `${(win.y / 8) * 100}%`,
                              width: `${(win.w / 13) * 100}%`,
                              height: `${(win.h / 8) * 100}%`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="text-[10px] text-white font-medium truncate">{layout.label}</div>
                    </button>
                  );
                })}
              </div>
              
              {/* Compact Legend */}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-500"></span>Player</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500"></span>Playlist</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500"></span>Library</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500"></span>EQ</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-pink-500"></span>Vis</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500"></span>Queue</span>
              </div>
            </div>
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="space-y-4">
            <div>
              <label className="text-slate-300 text-sm font-medium mb-3 block">
                Cache Size Limit: {cacheSizeLimit} MB
              </label>
              <input
                type="range"
                min="100"
                max="2000"
                step="50"
                value={cacheSizeLimit}
                onChange={(e) => setCacheSizeLimit(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>100 MB</span>
                <span>2 GB</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <label className="text-slate-300 text-sm font-medium mb-3 block">
                Max Concurrent Scans: {maxConcurrentScans}
              </label>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={maxConcurrentScans}
                onChange={(e) => setMaxConcurrentScans(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>1</span>
                <span>8</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <label className="text-slate-300 text-sm font-medium mb-3 block">
                Thumbnail Quality
              </label>
              <select
                value={thumbnailQuality}
                onChange={(e) => setThumbnailQuality(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
              >
                <option value="low">Low - Faster, smaller size</option>
                <option value="medium">Medium - Balanced</option>
                <option value="high">High - Better quality</option>
              </select>
            </div>
          </div>
        )}

        {/* Advanced Tab */}
        {activeTab === 'advanced' && (
          <div className="space-y-4">
            <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
              <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                <Database className="w-4 h-4" />
                Storage Information
              </h4>
              {loadingStats ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cache Size:</span>
                    <span className="text-white">{formatBytes(cacheSize)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Database Size:</span>
                    <span className="text-white">{formatBytes(dbSize)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={handleClearCache}
                className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear Album Art Cache
              </button>

              <button
                onClick={handleVacuumDb}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <RotateCw className="w-4 h-4" />
                Optimize Database
              </button>

              <button
                onClick={handleExportSettings}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export Settings
              </button>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <SettingToggle
                label="Show Debug Panel"
                description="Display development/debug information"
                checked={debugVisible}
                onChange={setDebugVisible}
              />
            </div>
          </div>
        )}

        {/* Windows Tab */}
        {activeTab === 'windows' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-white text-sm font-medium mb-3">Window Visibility</h4>
              <div className="space-y-2">
                {Object.entries(windows).map(([id, window]) => (
                  <label
                    key={id}
                    onMouseDown={e => e.stopPropagation()}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700 hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <span className="text-slate-300 text-sm capitalize">
                      {id.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <input
                      type="checkbox"
                      checked={window.visible}
                      onChange={() => toggleWindow(id)}
                      onMouseDown={e => e.stopPropagation()}
                      className="w-4 h-4 rounded accent-cyan-500"
                    />
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                Object.keys(windows).forEach(id => {
                  if (!windows[id].visible) {
                    toggleWindow(id);
                  }
                });
              }}
              onMouseDown={e => e.stopPropagation()}
              className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-colors"
            >
              Show All Windows
            </button>
          </div>
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <div className="space-y-6">
            {/* Hero Section */}
            <div className="text-center py-6">
              <div 
                className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4 shadow-lg"
                style={{ boxShadow: '0 8px 32px rgba(6, 182, 212, 0.4)' }}
              >
                <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
                </svg>
              </div>
              <h2 className="text-white text-3xl font-bold mb-1 tracking-tight">VPlayer</h2>
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400">
                  v0.5.0
                </span>
                <span className="text-slate-500 text-xs">•</span>
                <span className="text-slate-500 text-xs">Beta</span>
              </div>
              <p className="text-slate-400 text-sm max-w-xs mx-auto">
                Fast, lightweight, and fully customizable music player for your desktop
              </p>
            </div>

            {/* Tech Stack Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🦀</span>
                  <span className="text-white text-sm font-medium">Rust + Tauri</span>
                </div>
                <p className="text-slate-500 text-xs">Native performance</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">⚛️</span>
                  <span className="text-white text-sm font-medium">React + Zustand</span>
                </div>
                <p className="text-slate-500 text-xs">Reactive UI state</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🎵</span>
                  <span className="text-white text-sm font-medium">Rodio + Symphonia</span>
                </div>
                <p className="text-slate-500 text-xs">Audio decoding & playback</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🗃️</span>
                  <span className="text-white text-sm font-medium">SQLite + Lofty</span>
                </div>
                <p className="text-slate-500 text-xs">Library & metadata</p>
              </div>
            </div>

            {/* Features */}
            <div className="p-4 rounded-lg border border-slate-700 bg-slate-800/30">
              <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
                <span>✨</span> Features
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Gapless playback
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> 10-band equalizer
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Real-time visualizer
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Crossfade transitions
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Smart playlists
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Queue management
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Lyrics support
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Tag editor
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Customizable themes
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Flexible layouts
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Keyboard shortcuts
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">●</span> Folder watching
                </div>
              </div>
            </div>

            {/* Credits / Footer */}
            <div className="text-center pt-4 border-t border-slate-700">
              <p className="text-slate-400 text-sm mb-2">
                Crafted by <span className="text-cyan-400 font-medium">Veno</span>
              </p>
              <p className="text-slate-600 text-xs">
                © 2024-2025 • Built with passion and open source tech
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Reusable toggle component
function SettingToggle({ label, description, checked, onChange }) {
  return (
    <label
      onMouseDown={e => e.stopPropagation()}
      className="flex items-start gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer transition-colors"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        onMouseDown={e => e.stopPropagation()}
        className="w-4 h-4 mt-0.5 rounded accent-cyan-500"
      />
      <div className="flex-1">
        <div className="text-white text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-slate-400 mt-0.5">{description}</div>
        )}
      </div>
    </label>
  );
}
