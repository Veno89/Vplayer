import React from 'react';
import { Sliders } from 'lucide-react';

export function EqualizerWindow({ eqBands, currentColors }) {
  return (
    <div className="flex flex-col gap-4 h-full">
      <h3 className="text-white font-semibold flex items-center gap-2"><Sliders className={`w-5 h-5 ${currentColors.accent}`} /> Equalizer</h3>
      <div className="grid grid-cols-5 gap-4">
        {eqBands.map((band, idx) => (
          <div key={idx} className="flex flex-col items-center">
            <span className="text-xs text-slate-400 mb-1">{band.freq}</span>
            <input type="range" min="0" max="100" value={band.value} className="accent-cyan-500" readOnly />
            <span className="text-xs text-slate-400 mt-1">{band.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
