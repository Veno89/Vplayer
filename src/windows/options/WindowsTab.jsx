import React from 'react';
import { Layout, Eye, EyeOff, RotateCcw, Maximize2, Music, ListMusic, Library, Sliders, Radio, ListOrdered, Mic, Settings, BarChart3 } from 'lucide-react';
import { SettingCard, SettingButton, SettingDivider } from './SettingsComponents';

// Window icon mapping
const WINDOW_ICONS = {
  player: Music,
  playlist: ListMusic,
  library: Library,
  equalizer: Sliders,
  visualizer: Radio,
  queue: ListOrdered,
  lyrics: Mic,
  options: Settings,
  libraryStats: BarChart3,
};

// Window color mapping
const WINDOW_COLORS = {
  player: { bg: 'bg-cyan-500', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  playlist: { bg: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  library: { bg: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500/30' },
  equalizer: { bg: 'bg-violet-500', text: 'text-violet-400', border: 'border-violet-500/30' },
  visualizer: { bg: 'bg-pink-500', text: 'text-pink-400', border: 'border-pink-500/30' },
  queue: { bg: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/30' },
  lyrics: { bg: 'bg-rose-500', text: 'text-rose-400', border: 'border-rose-500/30' },
  options: { bg: 'bg-slate-500', text: 'text-slate-400', border: 'border-slate-500/30' },
  libraryStats: { bg: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500/30' },
};

export function WindowsTab({ windows, toggleWindow }) {
  const windowEntries = Object.entries(windows || {});
  const visibleCount = windowEntries.filter(([_, w]) => w.visible).length;
  const hiddenCount = windowEntries.length - visibleCount;

  const formatWindowName = (id) => {
    // Convert camelCase to Title Case with spaces
    return id
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  const handleShowAll = () => {
    windowEntries.forEach(([id, window]) => {
      if (!window.visible) {
        toggleWindow(id);
      }
    });
  };

  const handleHideAll = () => {
    windowEntries.forEach(([id, window]) => {
      if (window.visible && id !== 'player') { // Keep player visible
        toggleWindow(id);
      }
    });
  };

  const handleResetPositions = () => {
    // This would need to trigger a layout reset
    alert('Reset positions - would reset all windows to default positions');
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400 text-xs">Visible</span>
          </div>
          <p className="text-white text-2xl font-bold">{visibleCount}</p>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-slate-500/10 to-slate-600/10 border border-slate-500/20">
          <div className="flex items-center gap-2 mb-1">
            <EyeOff className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 text-xs">Hidden</span>
          </div>
          <p className="text-white text-2xl font-bold">{hiddenCount}</p>
        </div>
      </div>

      {/* Window List */}
      <SettingCard title="Window Visibility" icon={Layout} accent="cyan">
        <p className="text-xs text-slate-500 mb-4">
          Toggle which windows are visible in your workspace
        </p>

        <div className="space-y-2">
          {windowEntries.map(([id, window]) => {
            const Icon = WINDOW_ICONS[id] || Layout;
            const colors = WINDOW_COLORS[id] || WINDOW_COLORS.options;
            
            return (
              <button
                key={id}
                onClick={() => toggleWindow(id)}
                onMouseDown={e => e.stopPropagation()}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  window.visible
                    ? `${colors.border} bg-slate-800/50`
                    : 'border-slate-700/30 bg-slate-800/20 opacity-60'
                } hover:opacity-100`}
              >
                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  window.visible ? colors.bg + '/20' : 'bg-slate-700/50'
                }`}>
                  <Icon className={`w-5 h-5 ${window.visible ? colors.text : 'text-slate-500'}`} />
                </div>

                {/* Name */}
                <div className="flex-1 text-left">
                  <p className={`text-sm font-medium ${window.visible ? 'text-white' : 'text-slate-400'}`}>
                    {formatWindowName(id)}
                  </p>
                  {window.visible && (
                    <p className="text-xs text-slate-500">
                      {window.width}×{window.height} at ({window.x}, {window.y})
                    </p>
                  )}
                </div>

                {/* Toggle indicator */}
                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${
                  window.visible ? colors.bg : 'bg-slate-700'
                }`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                    window.visible ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </div>
              </button>
            );
          })}
        </div>
      </SettingCard>

      {/* Quick Actions */}
      <SettingCard title="Quick Actions" icon={Maximize2} accent="violet">
        <div className="grid grid-cols-2 gap-2">
          <SettingButton
            label="Show All"
            onClick={handleShowAll}
            icon={Eye}
            variant="success"
          />
          <SettingButton
            label="Hide All"
            onClick={handleHideAll}
            icon={EyeOff}
            variant="default"
          />
        </div>

        <SettingDivider />

        <SettingButton
          label="Reset Window Positions"
          onClick={handleResetPositions}
          icon={RotateCcw}
          variant="warning"
        />
      </SettingCard>

      {/* Tips */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border border-cyan-500/20">
        <h4 className="text-cyan-400 text-sm font-medium mb-2">💡 Tips</h4>
        <ul className="space-y-1 text-xs text-slate-400">
          <li>• Drag window title bars to move them around</li>
          <li>• Drag window edges to resize</li>
          <li>• Double-click title bar to minimize</li>
          <li>• Use keyboard shortcuts to quickly toggle windows</li>
        </ul>
      </div>
    </div>
  );
}
