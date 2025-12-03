import React, { useEffect, useCallback, useRef } from 'react';
import { Sliders, RotateCcw } from 'lucide-react';
import { TauriAPI } from '../services/TauriAPI';

export function EqualizerWindow({ eqBands, setEqBands, currentColors, currentPreset, applyPreset, resetEQ, presets }) {
  const updateTimeoutRef = useRef(null);

  // Convert UI bands (0-100) to backend format (-12 to +12 dB)
  const convertBandsToBackend = useCallback((bands) => {
    return bands.map(band => ((band.value - 50) / 50) * 12);
  }, []);

  // Send EQ settings to backend (debounced)
  const updateBackendEQ = useCallback((bands) => {
    // Clear any pending update
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // Debounce the backend update to avoid too many calls while dragging
    updateTimeoutRef.current = setTimeout(async () => {
      try {
        const eqGains = convertBandsToBackend(bands);
        await TauriAPI.setAudioEffects({
          pitch_shift: 0.0,
          tempo: 1.0,
          reverb_mix: 0.0,
          reverb_room_size: 0.5,
          bass_boost: 0.0,
          echo_delay: 0.3,
          echo_feedback: 0.3,
          echo_mix: 0.0,
          eq_bands: eqGains,
        });
      } catch (err) {
        console.error('Failed to update EQ:', err);
      }
    }, 50);
  }, [convertBandsToBackend]);

  // Update backend when bands change
  useEffect(() => {
    updateBackendEQ(eqBands);
  }, [eqBands, updateBackendEQ]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Handle band change
  const handleBandChange = (index, value) => {
    const newBands = [...eqBands];
    newBands[index] = { ...newBands[index], value: Number(value) };
    setEqBands(newBands);
  };

  // Reset to flat
  const handleReset = () => {
    resetEQ();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Sliders className={`w-5 h-5 ${currentColors.accent}`} />
          Equalizer
          {currentPreset && currentPreset !== 'CUSTOM' && (
            <span className="text-xs text-slate-400">
              ({presets[currentPreset]?.name || currentPreset})
            </span>
          )}
        </h3>
        <button
          onClick={handleReset}
          onMouseDown={e => e.stopPropagation()}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition-colors flex items-center gap-1"
          title="Reset to Flat"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      {/* Presets */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(presets).map(([presetKey, preset]) => (
          <button
            key={presetKey}
            onClick={() => applyPreset(presetKey)}
            onMouseDown={e => e.stopPropagation()}
            className={`px-3 py-1 text-xs rounded transition-all ${
              currentPreset === presetKey
                ? `${currentColors.primary} text-white font-medium`
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            title={preset.name}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* EQ Sliders */}
      <div className="flex justify-around items-end gap-2 h-full">
        {eqBands.map((band, idx) => (
          <div key={idx} className="flex flex-col items-center gap-2">
            {/* Value label */}
            <span className="text-xs text-white font-medium">
              {band.value > 50 ? '+' : band.value < 50 ? '-' : ''}
              {Math.abs(band.value - 50)}
            </span>

            {/* Slider */}
            <input
              type="range"
              min="0"
              max="100"
              value={band.value}
              onChange={e => handleBandChange(idx, e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              className="h-32 cursor-pointer"
              style={{
                writingMode: 'bt-lr',
                WebkitAppearance: 'slider-vertical',
                width: '8px',
              }}
              title={`${band.freq}: ${band.value > 50 ? '+' : band.value < 50 ? '-' : ''}${Math.abs(band.value - 50)}`}
            />

            {/* Frequency label */}
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
              {band.freq}
            </span>
          </div>
        ))}
      </div>

      {/* Visual indicator */}
      <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500 rounded-full opacity-30" />
    </div>
  );
}