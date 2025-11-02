import React, { useEffect, useRef, useState } from 'react';
import { Music, BarChart3, Activity } from 'lucide-react';
import { useAudioContextAPI } from '../context/AudioContextProvider';

const VISUALIZER_MODES = ['bars', 'wave', 'circular'];

export function VisualizerWindow({ currentColors, isPlaying }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  
  const [mode, setMode] = useState('bars');
  const { isInitialized, getFrequencyData, getTimeDomainData } = useAudioContextAPI();

  // Draw visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isInitialized || !isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      // Get the appropriate data based on mode
      const dataArray = mode === 'wave' ? getTimeDomainData() : getFrequencyData();

      // Clear canvas
      ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
      ctx.fillRect(0, 0, width, height);

      if (mode === 'bars') {
        drawBars(ctx, dataArray, width, height);
      } else if (mode === 'wave') {
        drawWave(ctx, dataArray, width, height);
      } else if (mode === 'circular') {
        drawCircular(ctx, dataArray, width, height);
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, mode, isInitialized, getFrequencyData, getTimeDomainData]);

  // Draw bar visualizer
  const drawBars = (ctx, dataArray, width, height) => {
    const barCount = 64;
    const barWidth = width / barCount;
    const step = Math.floor(dataArray.length / barCount);

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step] || 0;
      const barHeight = (value / 255) * height * 0.8;
      const x = i * barWidth;
      const y = height - barHeight;

      // Create gradient
      const gradient = ctx.createLinearGradient(x, y, x, height);
      gradient.addColorStop(0, '#06b6d4');
      gradient.addColorStop(0.5, '#3b82f6');
      gradient.addColorStop(1, '#8b5cf6');

      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth - 2, barHeight);
    }
  };

  // Draw waveform visualizer
  const drawWave = (ctx, dataArray, width, height) => {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#06b6d4';
    ctx.beginPath();

    const sliceWidth = width / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] || 128) / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();
  };

  // Draw circular visualizer
  const drawCircular = (ctx, dataArray, width, height) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3;
    const bars = 64;
    const step = Math.floor(dataArray.length / bars);

    for (let i = 0; i < bars; i++) {
      const value = dataArray[i * step] || 0;
      const barHeight = (value / 255) * radius;
      const angle = (i / bars) * Math.PI * 2;

      const x1 = centerX + Math.cos(angle) * radius;
      const y1 = centerY + Math.sin(angle) * radius;
      const x2 = centerX + Math.cos(angle) * (radius + barHeight);
      const y2 = centerY + Math.sin(angle) * (radius + barHeight);

      // Create gradient
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, '#8b5cf6');
      gradient.addColorStop(1, '#06b6d4');

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw center circle
    ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  // Cycle through modes
  const cycleMode = () => {
    const currentIndex = VISUALIZER_MODES.indexOf(mode);
    const nextIndex = (currentIndex + 1) % VISUALIZER_MODES.length;
    setMode(VISUALIZER_MODES[nextIndex]);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Music className={`w-5 h-5 ${currentColors.accent}`} />
          Visualizer
        </h3>
        <button
          onClick={cycleMode}
          onMouseDown={e => e.stopPropagation()}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition-colors flex items-center gap-2"
          title="Change Mode"
        >
          {mode === 'bars' && <BarChart3 className="w-3 h-3" />}
          {mode === 'wave' && <Activity className="w-3 h-3" />}
          {mode === 'circular' && <Music className="w-3 h-3" />}
          {mode.charAt(0).toUpperCase() + mode.slice(1)}
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative bg-slate-900/50 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ imageRendering: 'crisp-edges' }}
        />
        
        {/* Overlay when not playing or not initialized */}
        {(!isPlaying || !isInitialized) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80">
            <Music className="w-12 h-12 text-slate-600 mb-2" />
            <p className="text-slate-400 text-sm">
              {!isInitialized ? 'Initializing audio...' : 'Start playback to see visualization'}
            </p>
          </div>
        )}
      </div>

      {/* Mode indicator */}
      <div className="flex justify-center gap-2">
        {VISUALIZER_MODES.map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            onMouseDown={e => e.stopPropagation()}
            className={`w-2 h-2 rounded-full transition-all ${
              mode === m ? `${currentColors.primary} w-6` : 'bg-slate-700'
            }`}
            title={m}
          />
        ))}
      </div>
    </div>
  );
}