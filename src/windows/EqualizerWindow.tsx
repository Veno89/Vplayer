import React from 'react';
import { Sliders, RotateCcw } from 'lucide-react';
import { useEqualizer } from '../hooks/useEqualizer';
import { useCurrentColors } from '../hooks/useStoreHooks';

export function EqualizerWindow() {
  const { eqBands, setEqBands, currentPreset, applyPreset, resetEQ, presets } = useEqualizer();
  const currentColors = useCurrentColors();

  // Get theme colors with fallbacks
  const colors = currentColors || {
    accent: 'text-cyan-400',
    color: '#06b6d4',
    primary: 'bg-cyan-500',
    backgroundSecondary: '#1e293b',
    border: '#334155',
    textMuted: '#94a3b8',
    textSubtle: '#64748b',
  };

  // Handle band change
  const handleBandChange = (index: number, value: number | string) => {
    const newBands = [...eqBands];
    newBands[index] = { ...newBands[index], value: Number(value) };
    setEqBands(newBands);
  };

  // Reset to flat
  const handleReset = () => {
    resetEQ();
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2" style={{ color: colors.text || '#f8fafc' }}>
          <Sliders className={`w-5 h-5 ${colors.accent}`} />
          Equalizer
          {currentPreset && currentPreset !== 'CUSTOM' && (
            <span className="text-xs" style={{ color: colors.textMuted || '#94a3b8' }}>
              ({(presets as Record<string, { name: string; bands: number[] }>)[currentPreset]?.name || currentPreset})
            </span>
          )}
        </h3>
        <button
          onClick={handleReset}
          onMouseDown={e => e.stopPropagation()}
          className="px-3 py-1 text-xs rounded-sm transition-colors flex items-center gap-1 hover:opacity-80"
          style={{ 
            background: colors.backgroundSecondary || '#1e293b',
            color: colors.textMuted || '#94a3b8',
            border: `1px solid ${colors.border || '#334155'}`,
          }}
          title="Reset to Flat"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      {/* Presets */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(presets).map(([presetKey, preset]: [string, { name: string; bands: number[] }]) => (
          <button
            key={presetKey}
            onClick={() => applyPreset(presetKey)}
            onMouseDown={e => e.stopPropagation()}
            className={`px-3 py-1 text-xs rounded-sm transition-all ${
              currentPreset === presetKey
                ? `${colors.primary} text-white font-medium`
                : 'hover:opacity-80'
            }`}
            style={currentPreset !== presetKey ? {
              background: colors.backgroundSecondary || '#1e293b',
              color: colors.textMuted || '#94a3b8',
              border: `1px solid ${colors.border || '#334155'}`,
            } : {}}
            title={preset.name}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* EQ Sliders */}
      <div className="flex flex-1 min-h-0 justify-around items-end gap-2">
        {eqBands.map((band, idx) => {
          // Calculate fill percentage for visual feedback
          const fillPercent = band.value;
          const isBoost = band.value > 50;
          const isCut = band.value < 50;
          
          return (
            <div key={idx} className="flex flex-col items-center gap-2">
              {/* Value label */}
              <span 
                className="text-xs font-medium"
                style={{ color: isBoost ? colors.color : isCut ? colors.textMuted : colors.textSubtle }}
              >
                {isBoost ? '+' : isCut ? '-' : ''}
                {Math.abs(band.value - 50)}
              </span>

              {/* Slider container with custom styling */}
              <div 
                className="relative h-32 w-8 rounded-lg overflow-hidden"
                style={{ background: colors.backgroundSecondary || '#1e293b' }}
              >
                {/* Fill indicator */}
                <div 
                  className="absolute bottom-0 left-0 right-0 transition-all duration-75 rounded-b-lg"
                  style={{ 
                    height: `${fillPercent}%`,
                    background: `linear-gradient(to top, ${colors.color}80, ${colors.color}40)`,
                  }}
                />
                
                {/* Center line (0 dB marker) */}
                <div 
                  className="absolute left-0 right-0 h-0.5 opacity-50"
                  style={{ 
                    top: '50%',
                    background: colors.border || '#334155',
                  }}
                />
                
                {/* Actual slider input (invisible but functional) */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={band.value}
                  aria-label={`${band.freq} equalizer gain`}
                  aria-valuetext={`${isBoost ? '+' : isCut ? '-' : ''}${Math.abs(band.value - 50)} decibels`}
                  onChange={e => handleBandChange(idx, e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                  className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                  style={{
                    writingMode: 'bt-lr' as unknown as React.CSSProperties['writingMode'],
                    WebkitAppearance: 'slider-vertical',
                  } as React.CSSProperties}
                  title={`${band.freq}: ${isBoost ? '+' : isCut ? '-' : ''}${Math.abs(band.value - 50)} dB`}
                />
                
                {/* Thumb indicator */}
                <div 
                  className="absolute left-1/2 -translate-x-1/2 w-6 h-2 rounded-full shadow-lg transition-all duration-75"
                  style={{ 
                    bottom: `calc(${fillPercent}% - 4px)`,
                    background: colors.color,
                    boxShadow: `0 0 8px ${colors.color}60`,
                  }}
                />
              </div>

              {/* Frequency label */}
              <span 
                className="text-xs font-medium whitespace-nowrap"
                style={{ color: colors.textSubtle || '#64748b' }}
              >
                {band.freq}
              </span>
            </div>
          );
        })}
      </div>

      {/* Visual indicator - themed */}
      <div 
        className="h-1 rounded-full opacity-50"
        style={{ 
          background: `linear-gradient(to right, ${colors.color}, ${colors.color}80, ${colors.color})`,
        }}
      />
    </div>
  );
}
