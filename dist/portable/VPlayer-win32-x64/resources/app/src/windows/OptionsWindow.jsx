import React from 'react';
import { Settings } from 'lucide-react';

export function OptionsWindow({
  windows,
  toggleWindow,
  colorScheme,
  setColorScheme,
  colorSchemes,
  debugVisible,
  setDebugVisible,
  currentColors,
}) {
  return (
    <div className="flex flex-col gap-6 h-full p-4">
      <h3 className="text-white font-semibold flex items-center gap-2 mb-2"><Settings className={`w-5 h-5 ${currentColors.accent}`} /> Options</h3>

      {/* Color scheme selector */}
      <div>
        <h4 className="text-white text-sm font-medium mb-2">Window Color Scheme</h4>
        <div className="flex gap-3 flex-wrap">
          {colorSchemes.map((scheme, idx) => (
            <button
              key={scheme.name || idx}
              onClick={() => {
                setColorScheme(scheme.name || 'default');
                setCurrentColors(scheme);
              }}
              className={`w-8 h-8 rounded-full border-2 transition-all ${colorScheme === (scheme.name || 'default') ? 'border-white scale-110' : 'border-slate-700'} ${scheme.primary}`}
              title={scheme.name || 'default'}
              style={{ background: scheme.background }}
            >
              <span className="sr-only">{scheme.name || 'default'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Debug panel toggle */}
      <div className="mt-4">
        <label className="flex items-center gap-2 text-slate-300 text-sm">
          <input
            type="checkbox"
            checked={debugVisible}
            onChange={e => setDebugVisible(e.target.checked)}
          />
          Show Debug Panel
        </label>
      </div>
    </div>
  );
}
