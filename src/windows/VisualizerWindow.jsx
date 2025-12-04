import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Music, BarChart3, Activity } from 'lucide-react';

const VISUALIZER_MODES = ['bars', 'wave', 'circular'];

/**
 * Simulated audio visualizer
 * 
 * Since audio playback happens in Rust (rodio), we can't access raw audio samples
 * from the frontend. This visualizer creates aesthetically pleasing animations
 * that respond to playback state. Uses multiple sine waves and noise functions
 * to create organic, music-like patterns.
 */
export function VisualizerWindow({ currentColors, isPlaying }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const timeRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  
  // Smoothed values for organic motion
  const smoothedValuesRef = useRef(new Array(64).fill(0));
  
  const [mode, setMode] = useState('bars');

  // Generate simulated frequency data
  const generateFrequencyData = useCallback((time) => {
    const data = new Uint8Array(64);
    
    // Multiple overlapping wave patterns for organic feel
    for (let i = 0; i < 64; i++) {
      const freq = i / 64;
      
      // Bass frequencies (lower indices) should be more prominent
      const bassWeight = Math.pow(1 - freq, 1.5);
      
      // Multiple sine waves at different frequencies and phases
      const wave1 = Math.sin(time * 2 + i * 0.1) * 0.3;
      const wave2 = Math.sin(time * 3.7 + i * 0.2 + 1.5) * 0.25;
      const wave3 = Math.sin(time * 1.3 + i * 0.15 + 3) * 0.2;
      const wave4 = Math.sin(time * 5 + i * 0.3) * 0.15;
      
      // Add some pseudo-random noise for realism
      const noise = (Math.sin(time * 10 + i * 7.3) * Math.sin(time * 13 + i * 11.7)) * 0.1;
      
      // Combine waves with bass emphasis
      let value = (wave1 + wave2 + wave3 + wave4 + noise + 0.5) * (0.5 + bassWeight * 0.5);
      
      // Apply smoothing for less jittery motion
      const smoothing = 0.7;
      smoothedValuesRef.current[i] = smoothedValuesRef.current[i] * smoothing + value * (1 - smoothing);
      value = smoothedValuesRef.current[i];
      
      // Scale to 0-255 range
      data[i] = Math.max(0, Math.min(255, Math.floor(value * 255)));
    }
    
    return data;
  }, []);

  // Generate simulated waveform data
  const generateWaveformData = useCallback((time) => {
    const data = new Uint8Array(256);
    
    for (let i = 0; i < 256; i++) {
      const pos = i / 256;
      
      // Multiple overlapping waves
      const wave1 = Math.sin(time * 2 + pos * Math.PI * 4) * 0.4;
      const wave2 = Math.sin(time * 3.3 + pos * Math.PI * 8 + 1) * 0.3;
      const wave3 = Math.sin(time * 1.7 + pos * Math.PI * 2) * 0.2;
      
      // Add slight noise
      const noise = Math.sin(time * 15 + pos * 50) * 0.1;
      
      // Center around 128 (middle of waveform)
      data[i] = Math.floor(128 + (wave1 + wave2 + wave3 + noise) * 64);
    }
    
    return data;
  }, []);

  // Draw visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) {
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

      // Update time
      const now = performance.now();
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      timeRef.current += delta;

      // Generate the appropriate data based on mode
      const dataArray = mode === 'wave' 
        ? generateWaveformData(timeRef.current)
        : generateFrequencyData(timeRef.current);

      // Clear canvas with slight fade effect for trail
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
  }, [isPlaying, mode, generateFrequencyData, generateWaveformData]);

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
        
        {/* Overlay when not playing */}
        {!isPlaying && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80">
            <Music className="w-12 h-12 text-slate-600 mb-2" />
            <p className="text-slate-400 text-sm">
              Start playback to see visualization
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