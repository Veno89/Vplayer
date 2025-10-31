import React from 'react';
import { Music } from 'lucide-react';

export function VisualizerWindow({ visualizerBars, currentColors }) {
  return (
    <div className="flex flex-col gap-4 h-full items-center justify-center">
      <h3 className="text-white font-semibold flex items-center gap-2"><Music className={`w-5 h-5 ${currentColors.accent}`} /> Visualizer</h3>
      <div className="flex gap-1 items-end h-32 w-full max-w-xl mx-auto">
        {visualizerBars.map((bar, idx) => (
          <div key={idx} style={{ height: `${bar}px` }} className={`w-2 rounded bg-gradient-to-t ${currentColors.primary}`} />
        ))}
      </div>
    </div>
  );
}
