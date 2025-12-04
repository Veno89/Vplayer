import React from 'react';
import { Sliders, Monitor, Bell, Grid3X3, Layout, MousePointer } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { SettingToggle, SettingSlider, SettingCard, SettingDivider } from './SettingsComponents';

export function BehaviorTab({ layouts, currentLayout, applyLayout }) {
  // Get settings from store
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
  
  // New settings
  const confirmBeforeDelete = useStore(state => state.confirmBeforeDelete);
  const setConfirmBeforeDelete = useStore(state => state.setConfirmBeforeDelete);
  const showNotifications = useStore(state => state.showNotifications);
  const setShowNotifications = useStore(state => state.setShowNotifications);
  const snapToGrid = useStore(state => state.snapToGrid);
  const setSnapToGrid = useStore(state => state.setSnapToGrid);
  const gridSize = useStore(state => state.gridSize);
  const setGridSize = useStore(state => state.setGridSize);

  // Layout preview colors
  const windowColors = {
    player: { bg: 'bg-cyan-500', label: 'Player' },
    playlist: { bg: 'bg-emerald-500', label: 'Playlist' },
    library: { bg: 'bg-amber-500', label: 'Library' },
    equalizer: { bg: 'bg-violet-500', label: 'EQ' },
    visualizer: { bg: 'bg-pink-500', label: 'Vis' },
    queue: { bg: 'bg-orange-500', label: 'Queue' },
  };

  return (
    <div className="space-y-6">
      {/* System Tray */}
      <SettingCard title="System Tray" icon={Monitor} accent="blue">
        <SettingToggle
          label="Minimize to Tray"
          description="When minimizing, hide to system tray instead of taskbar"
          checked={minimizeToTray}
          onChange={setMinimizeToTray}
        />
        
        <SettingToggle
          label="Close to Tray"
          description="Keep app running in background when closing the window"
          checked={closeToTray}
          onChange={setCloseToTray}
        />
        
        <SettingToggle
          label="Start Minimized"
          description="Launch the app minimized to system tray"
          checked={startMinimized}
          onChange={setStartMinimized}
        />
      </SettingCard>

      {/* Notifications */}
      <SettingCard title="Notifications" icon={Bell} accent="amber">
        <SettingToggle
          label="Show Notifications"
          description="Display system notifications for track changes and events"
          checked={showNotifications}
          onChange={setShowNotifications}
        />
      </SettingCard>

      {/* Confirmations */}
      <SettingCard title="Confirmations" icon={MousePointer} accent="red">
        <SettingToggle
          label="Confirm Before Delete"
          description="Ask for confirmation before removing tracks or playlists"
          checked={confirmBeforeDelete}
          onChange={setConfirmBeforeDelete}
        />
      </SettingCard>

      {/* Window Management */}
      <SettingCard title="Window Management" icon={Layout} accent="emerald">
        <SettingToggle
          label="Remember Window Positions"
          description="Save and restore the position and size of all windows"
          checked={rememberWindowPositions}
          onChange={setRememberWindowPositions}
        />
        
        <SettingToggle
          label="Auto-Resize Main Window"
          description="Automatically adjust main window to fit all visible panels"
          checked={autoResizeWindow}
          onChange={setAutoResizeWindow}
        />
        
        <SettingDivider label="Snapping" />
        
        <SettingToggle
          label="Snap Windows to Grid"
          description="Windows align to an invisible grid when dragging"
          checked={snapToGrid}
          onChange={setSnapToGrid}
          icon={Grid3X3}
        />
        
        {snapToGrid && (
          <SettingSlider
            label="Grid Size"
            description="Distance between grid snap points"
            value={gridSize}
            onChange={setGridSize}
            min={5}
            max={25}
            step={5}
            formatValue={v => `${v}px`}
            minLabel="5px"
            maxLabel="25px"
            accentColor="emerald"
          />
        )}
      </SettingCard>

      {/* Window Layouts */}
      {layouts && layouts.length > 0 && (
        <SettingCard title="Preset Layouts" icon={Grid3X3} accent="violet">
          <p className="text-xs text-slate-500 mb-4">
            Quickly arrange windows using predefined layouts
          </p>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {layouts.map((layout) => (
              <button
                key={layout.name}
                onClick={() => applyLayout(layout.name)}
                onMouseDown={e => e.stopPropagation()}
                className={`p-3 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
                  currentLayout === layout.name
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                }`}
                title={layout.description}
              >
                {/* Layout Preview */}
                <div className="relative w-full aspect-[16/10] bg-slate-900 rounded-lg mb-2 overflow-hidden">
                  {layout.preview?.map((win, idx) => (
                    <div
                      key={idx}
                      className={`absolute ${windowColors[win.id]?.bg || 'bg-slate-500'} rounded-sm transition-all`}
                      style={{
                        left: `${(win.x / 13) * 100}%`,
                        top: `${(win.y / 8) * 100}%`,
                        width: `${(win.w / 13) * 100}%`,
                        height: `${(win.h / 8) * 100}%`,
                      }}
                    />
                  ))}
                </div>
                
                <p className="text-white text-xs font-medium truncate">{layout.label}</p>
                
                {currentLayout === layout.name && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-violet-500" />
                )}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <p className="text-xs text-slate-500 mb-2">Window Colors</p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(windowColors).map(([id, { bg, label }]) => (
                <div key={id} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded ${bg}`} />
                  <span className="text-xs text-slate-400">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </SettingCard>
      )}
    </div>
  );
}
