import React, { useState, useEffect } from 'react';
import { Settings, Palette, Volume2, Info, HardDrive, Loader, Layout, Image, Eye } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export function OptionsWindow({
  windows,
  toggleWindow,
  colorScheme,
  setColorScheme,
  colorSchemes,
  debugVisible,
  setDebugVisible,
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
}) {
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [switchingDevice, setSwitchingDevice] = useState(false);
  const [activeTab, setActiveTab] = useState('appearance');

  // Load audio devices on mount
  useEffect(() => {
    loadAudioDevices();
  }, []);

  const loadAudioDevices = async () => {
    try {
      setLoadingDevices(true);
      const devices = await invoke('get_audio_devices');
      setAudioDevices(devices);
      
      // Set default device as selected
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

  // Enhanced color schemes with more variety
  const enhancedColorSchemes = [
    { name: 'default', label: 'Classic', accent: 'text-white', background: '#1e293b', primary: 'bg-cyan-500', color: '#06b6d4' },
    { name: 'blue', label: 'Ocean Blue', accent: 'text-blue-400', background: '#1e3a8a', primary: 'bg-blue-500', color: '#3b82f6' },
    { name: 'emerald', label: 'Forest Green', accent: 'text-emerald-400', background: '#064e3b', primary: 'bg-emerald-500', color: '#10b981' },
    { name: 'rose', label: 'Sunset Rose', accent: 'text-rose-400', background: '#881337', primary: 'bg-rose-500', color: '#f43f5e' },
    { name: 'amber', label: 'Golden Amber', accent: 'text-amber-400', background: '#78350f', primary: 'bg-amber-500', color: '#f59e0b' },
    { name: 'purple', label: 'Royal Purple', accent: 'text-purple-400', background: '#581c87', primary: 'bg-purple-500', color: '#a855f7' },
    { name: 'pink', label: 'Bubblegum Pink', accent: 'text-pink-400', background: '#831843', primary: 'bg-pink-500', color: '#ec4899' },
    { name: 'indigo', label: 'Deep Indigo', accent: 'text-indigo-400', background: '#312e81', primary: 'bg-indigo-500', color: '#6366f1' },
    { name: 'teal', label: 'Ocean Teal', accent: 'text-teal-400', background: '#134e4a', primary: 'bg-teal-500', color: '#14b8a6' },
    { name: 'orange', label: 'Tangerine', accent: 'text-orange-400', background: '#7c2d12', primary: 'bg-orange-500', color: '#f97316' },
    { name: 'slate', label: 'Midnight Slate', accent: 'text-slate-300', background: '#0f172a', primary: 'bg-slate-600', color: '#475569' },
    { name: 'red', label: 'Cherry Red', accent: 'text-red-400', background: '#7f1d1d', primary: 'bg-red-500', color: '#ef4444' },
  ];

  const tabs = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'layout', label: 'Layout', icon: Layout },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'windows', label: 'Windows', icon: HardDrive },
    { id: 'about', label: 'About', icon: Info },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700">
        <Settings className={`w-5 h-5 ${currentColors.accent}`} />
        <h3 className="text-white font-semibold">Settings</h3>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-4 bg-slate-800/50 rounded p-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onMouseDown={e => e.stopPropagation()}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-all ${
                activeTab === tab.id
                  ? `${currentColors.primary} text-white font-medium`
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
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
                {enhancedColorSchemes.map((scheme) => (
                  <button
                    key={scheme.name}
                    onClick={() => {
                      setColorScheme(scheme.name);
                      setCurrentColors(scheme);
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    className={`relative p-3 rounded-lg border-2 transition-all ${
                      colorScheme === scheme.name
                        ? 'border-white shadow-lg scale-105'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                    style={{ backgroundColor: scheme.background }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div 
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: scheme.color }}
                      />
                      <span className="text-white text-xs font-medium">{scheme.label}</span>
                    </div>
                    <div className="flex gap-1">
                      <div className="flex-1 h-1 rounded" style={{ backgroundColor: scheme.color, opacity: 0.8 }} />
                      <div className="flex-1 h-1 rounded" style={{ backgroundColor: scheme.color, opacity: 0.6 }} />
                      <div className="flex-1 h-1 rounded" style={{ backgroundColor: scheme.color, opacity: 0.4 }} />
                    </div>
                    {colorScheme === scheme.name && (
                      <div className="absolute top-2 right-2">
                        <div className="w-2 h-2 rounded-full bg-white" />
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
                          // Convert file path to data URL for display
                          setBackgroundImage(selected);
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
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                    <span className="truncate flex-1">{backgroundImage}</span>
                    <button
                      onClick={() => setBackgroundImage(null)}
                      onMouseDown={e => e.stopPropagation()}
                      className="text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                )}
                
                {backgroundImage && (
                  <>
                    <div className="mt-3">
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
                    <div className="mt-3">
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
                <p className="text-slate-400 text-xs mt-2">
                  Adjust transparency of all windows
                </p>
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
                <p className="text-slate-400 text-xs mt-2">
                  Adjust UI text size (default: 14px)
                </p>
              </div>

              <div className="pt-4 border-t border-slate-700">
                <label className="flex items-center gap-3 text-slate-300 text-sm cursor-pointer hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={debugVisible}
                    onChange={e => setDebugVisible(e.target.checked)}
                    onMouseDown={e => e.stopPropagation()}
                    className="w-4 h-4 rounded accent-cyan-500"
                  />
                  <span>Show Debug Panel (Development)</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Layout Tab */}
        {activeTab === 'layout' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-white text-sm font-medium mb-3">Window Layouts</h4>
              <p className="text-slate-400 text-xs mb-4">
                Choose a preset layout to arrange your windows. Each layout positions and shows/hides windows automatically.
              </p>
              <div className="space-y-3">
                {layouts?.map((layout) => (
                  <button
                    key={layout.name}
                    onClick={() => applyLayout(layout.name)}
                    onMouseDown={e => e.stopPropagation()}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      currentLayout === layout.name
                        ? `border-cyan-500 bg-cyan-500/10 shadow-lg`
                        : 'border-slate-700 hover:border-slate-600 bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">{layout.label}</span>
                      {currentLayout === layout.name && (
                        <div className="w-2 h-2 rounded-full bg-cyan-500" />
                      )}
                    </div>
                    <p className="text-slate-400 text-xs">{layout.description}</p>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="pt-4 border-t border-slate-700">
              <p className="text-slate-500 text-xs">
                💡 Tip: You can still manually move and resize windows after applying a layout.
              </p>
            </div>
          </div>
        )}

        {/* Audio Tab */}
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

            {/* Crossfade Section */}
            {crossfade && (
              <div>
                <h4 className="text-white text-sm font-medium mb-3">
                  Crossfade
                </h4>
                
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/30">
                    <input
                      type="checkbox"
                      checked={crossfade.enabled}
                      onChange={crossfade.toggleEnabled}
                      onMouseDown={e => e.stopPropagation()}
                      className="w-4 h-4 accent-cyan-500"
                    />
                    <div className="flex-1">
                      <div className="text-white text-sm font-medium">Enable Crossfade</div>
                      <div className="text-xs text-slate-400">Fade between tracks smoothly</div>
                    </div>
                  </label>

                  {crossfade.enabled && (
                    <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white text-sm">Crossfade Duration</span>
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

        {/* Windows Tab */}
        {activeTab === 'windows' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-white text-sm font-medium mb-3">Window Visibility</h4>
              <div className="space-y-2">
                {Object.entries(windows).map(([id, window]) => (
                  <label
                    key={id}
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

            <div className="pt-4 border-t border-slate-700">
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
          </div>
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
                <Settings className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-white text-2xl font-bold mb-2">VPlayer</h2>
              <p className="text-slate-400 text-sm mb-1">Version 0.1.0</p>
              <p className="text-slate-500 text-xs">Native Desktop Music Player</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-700">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Built with</span>
                <span className="text-white">Tauri + React</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Audio Engine</span>
                <span className="text-white">Rodio 0.19</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Database</span>
                <span className="text-white">SQLite</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">UI Framework</span>
                <span className="text-white">Tailwind CSS</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <h4 className="text-white text-sm font-medium mb-2">Features</h4>
              <ul className="space-y-1 text-slate-400 text-xs">
                <li>• Native audio playback with Rust</li>
                <li>• Real-time folder scanning</li>
                <li>• ID3 metadata extraction</li>
                <li>• Customizable themes</li>
                <li>• Floating window interface</li>
                <li>• SQLite library management</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}