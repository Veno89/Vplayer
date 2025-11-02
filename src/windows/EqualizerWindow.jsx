import React, { useEffect, useState } from 'react';
import { Sliders, RotateCcw } from 'lucide-react';
import { useAudioContextAPI } from '../context/AudioContextProvider';

const EQ_PRESETS = {
  flat: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
  rock: [60, 55, 45, 40, 45, 50, 55, 60, 60, 60],
  pop: [45, 55, 60, 60, 55, 50, 45, 50, 55, 60],
  jazz: [55, 60, 55, 45, 40, 45, 55, 60, 60, 55],
  classical: [60, 55, 50, 45, 45, 45, 50, 55, 60, 65],
  bass_boost: [70, 65, 60, 50, 45, 45, 45, 50, 50, 50],
  treble_boost: [45, 45, 45, 50, 50, 55, 60, 65, 70, 70],
  vocal: [40, 45, 50, 60, 65, 60, 55, 50, 45, 40],
};

export function EqualizerWindow({ eqBands, setEqBands, currentColors }) {
  const [selectedPreset, setSelectedPreset] = useState('flat');
  const { isInitialized, setEQBand, resetEQ: resetEQContext } = useAudioContextAPI();

  // Update filter gains when bands change
  useEffect(() => {
    if (!isInitialized) return;

    eqBands.forEach((band, index) => {
      setEQBand(index, band.value);
    });
  }, [eqBands, isInitialized, setEQBand]);

  // Handle band change
  const handleBandChange = (index, value) => {
    const newBands = [...eqBands];
    newBands[index] = { ...newBands[index], value: Number(value) };
    setEqBands(newBands);
    setSelectedPreset('custom');
  };

  // Apply preset
  const applyPreset = (presetName) => {
    const presetValues = EQ_PRESETS[presetName];
    if (!presetValues) return;

    const newBands = eqBands.map((band, index) => ({
      ...band,
      value: presetValues[index]
    }));
    setEqBands(newBands);
    setSelectedPreset(presetName);
  };

  // Reset to flat
  const resetToFlat = () => {
    applyPreset('flat');
    if (resetEQContext) {
      resetEQContext();
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Sliders className={`w-5 h-5 ${currentColors.accent}`} />
          Equalizer
        </h3>
        <button
          onClick={resetToFlat}
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
        {Object.keys(EQ_PRESETS).map(presetName => (
          <button
            key={presetName}
            onClick={() => applyPreset(presetName)}
            onMouseDown={e => e.stopPropagation()}
            className={`px-3 py-1 text-xs rounded transition-all ${
              selectedPreset === presetName
                ? `${currentColors.primary} text-white font-medium`
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {presetName.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* EQ Sliders */}
      <div className="flex-1 flex items-end justify-between gap-3 px-2">
        {eqBands.map((band, idx) => (
          <div key={idx} className="flex flex-col items-center gap-2 flex-1">
            {/* Value display */}
            <div className="text-xs text-slate-400 font-mono min-h-[16px]">
              {band.value > 50 ? '+' : band.value < 50 ? '-' : '0'}
              {Math.abs(band.value - 50)}
            </div>

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
      
      {/* Info */}
      {!isInitialized && (
        <div className="text-xs text-slate-500 text-center">
          Start playback to activate equalizer
        </div>
      )}
    </div>
  );
}