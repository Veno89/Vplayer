import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Music, BarChart3, Activity } from 'lucide-react';
import { TauriAPI, type VisualizerData } from '../services/TauriAPI';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { useAppVisibility } from '../hooks/useAppVisibility';

const VISUALIZER_MODES = ['bars', 'wave', 'circular'] as const;
type VisualizerMode = typeof VISUALIZER_MODES[number];
const DATA_INTERVAL_MS = 50; // 20 native FFT analyses per second
const RENDER_INTERVAL_MS = 1000 / 30;
const MAX_CANVAS_DPR = 1.5;

const BACKEND_MODES: Record<VisualizerMode, string> = {
  bars: 'Spectrum',
  wave: 'Waveform',
  circular: 'CircularSpectrum',
};

/**
 * Real-time audio visualizer using FFT analysis from Rust backend
 * 
 * This visualizer gets actual audio samples from the playing track via the
 * Rust backend's ring buffer, processes them with FFT, and displays the
 * frequency spectrum and waveform data.
 */
export function VisualizerWindow() {
  const currentColors = useCurrentColors();
  const isPlaying = useStore(s => s.playing);
  const appVisible = useAppVisibility();
  const visualizerActive = isPlaying && appVisible;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Store visualization data from backend
  const spectrumRef = useRef(new Array(64).fill(0));
  const waveformRef = useRef(new Array(256).fill(0));
  const smoothedSpectrumRef = useRef(new Array(64).fill(0));
  const beatDetectedRef = useRef(false);
  
  const [mode, setMode] = useState<VisualizerMode>('bars');

  // Fetch visualization data from backend
  const fetchVisualizerData = useCallback(async () => {
    try {
      const data: VisualizerData = await TauriAPI.getVisualizerData();
      
      if (data) {
        // Update spectrum data (already normalized 0-1 from backend)
        if (data.spectrum && data.spectrum.length > 0) {
          spectrumRef.current = data.spectrum;
        }
        
        // Update waveform data
        if (data.waveform && data.waveform.length > 0) {
          waveformRef.current = data.waveform;
        }
        
        // Update beat detection
        beatDetectedRef.current = data.beat_detected;
      }
    } catch (err) {
      // Silently fail - visualization is non-critical
      console.debug('Visualizer data fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    TauriAPI.setVisualizerMode(BACKEND_MODES[mode]).catch(() => {
      // Non-critical; the default backend mode still produces valid data.
    });
  }, [mode]);

  useEffect(() => {
    TauriAPI.setVisualizerActive(visualizerActive).catch(() => {});
  }, [visualizerActive]);

  useEffect(() => {
    return () => {
      TauriAPI.setVisualizerActive(false).catch(() => {});
    };
  }, []);

  // Single-flight polling prevents a slow IPC call from building a backlog.
  useEffect(() => {
    if (!visualizerActive) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const startedAt = performance.now();
      await fetchVisualizerData();
      if (cancelled) return;
      const remaining = Math.max(0, DATA_INTERVAL_MS - (performance.now() - startedAt));
      timer = setTimeout(poll, remaining);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [visualizerActive, fetchVisualizerData]);

  // Draw visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cap backing resolution: high-DPI canvases otherwise multiply fill cost.
    let width = 0;
    let height = 0;
    const updateCanvasSize = () => {
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
      const targetWidth = Math.max(1, Math.round(width * dpr));
      const targetHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    updateCanvasSize();

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateCanvasSize);
    resizeObserver?.observe(canvas);
    if (!resizeObserver) window.addEventListener('resize', updateCanvasSize);

    const draw = () => {
      if (!appVisible) {
        animationRef.current = null;
        renderTimerRef.current = null;
        return;
      }

      let shouldContinueAnimating = isPlaying;

      if (isPlaying) {
        // Apply smoothing to spectrum for fluid motion (using refs updated by interval)
        const smoothing = 0.7;
        for (let i = 0; i < spectrumRef.current.length; i++) {
          smoothedSpectrumRef.current[i] =
            smoothedSpectrumRef.current[i] * smoothing +
            spectrumRef.current[i] * (1 - smoothing);
        }
      } else {
        // Decay toward silence while paused, then stop the animation loop.
        const decay = 0.9;
        let hasResidualEnergy = false;

        for (let i = 0; i < smoothedSpectrumRef.current.length; i++) {
          smoothedSpectrumRef.current[i] *= decay;
          if (smoothedSpectrumRef.current[i] > 0.001) {
            hasResidualEnergy = true;
          }
        }

        for (let i = 0; i < waveformRef.current.length; i++) {
          waveformRef.current[i] *= decay;
          if (Math.abs(waveformRef.current[i]) > 0.001) {
            hasResidualEnergy = true;
          }
        }

        shouldContinueAnimating = hasResidualEnergy;
      }

      // Clear canvas with slight fade effect for trail
      ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
      ctx.fillRect(0, 0, width, height);

      if (mode === 'bars') {
        drawBars(ctx, smoothedSpectrumRef.current, width, height);
      } else if (mode === 'wave') {
        drawWave(ctx, waveformRef.current, width, height);
      } else if (mode === 'circular') {
        drawCircular(ctx, smoothedSpectrumRef.current, width, height);
      }

      if (shouldContinueAnimating) {
        renderTimerRef.current = setTimeout(() => {
          animationRef.current = requestAnimationFrame(draw);
        }, RENDER_INTERVAL_MS);
      } else {
        animationRef.current = null;
        renderTimerRef.current = null;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
        renderTimerRef.current = null;
      }
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', updateCanvasSize);
    };
  }, [appVisible, isPlaying, mode]);

  // Draw bar visualizer
  const drawBars = (ctx: CanvasRenderingContext2D, spectrum: number[], width: number, height: number) => {
    const barCount = spectrum.length;
    const barWidth = width / barCount;
    const maxHeight = height * 0.85;

    const gradients = [
      ['#8b5cf6', '#6366f1'],
      ['#3b82f6', '#06b6d4'],
      ['#06b6d4', '#14b8a6'],
    ].map(([start, end]) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, start);
      gradient.addColorStop(1, end);
      return gradient;
    });

    for (let i = 0; i < barCount; i++) {
      // Spectrum values are 0-1 from backend
      const value = spectrum[i] || 0;
      const barHeight = value * maxHeight;
      const x = i * barWidth;
      const y = height - barHeight;

      const freqRatio = i / barCount;
      ctx.fillStyle = gradients[freqRatio < 0.3 ? 0 : freqRatio < 0.6 ? 1 : 2];
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
      
      // Add glow effect on peaks
      if (value > 0.7) {
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 10;
        ctx.fillRect(x + 1, y, barWidth - 2, 3);
        ctx.shadowBlur = 0;
      }
    }
  };

  // Draw waveform visualizer
  const drawWave = (ctx: CanvasRenderingContext2D, waveform: number[], width: number, height: number) => {
    const centerY = height / 2;
    
    // Draw background line
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    
    // Draw waveform
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#06b6d4';
    ctx.beginPath();

    const sliceWidth = width / waveform.length;
    let x = 0;

    for (let i = 0; i < waveform.length; i++) {
      // Waveform values are -1 to 1 (or raw samples), normalize them
      const sample = waveform[i] || 0;
      // Clamp and scale the sample
      const normalized = Math.max(-1, Math.min(1, sample));
      const y = centerY + (normalized * height * 0.4);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();
    
    // Add glow effect
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  // Draw circular visualizer
  const drawCircular = (ctx: CanvasRenderingContext2D, spectrum: number[], width: number, height: number) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) / 3.5;
    const bars = spectrum.length;

    // Draw center circle with subtle pulse on beat
    const pulseRadius = beatDetectedRef.current ? baseRadius * 1.05 : baseRadius;
    ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, pulseRadius * 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Draw frequency bars in circle
    for (let i = 0; i < bars; i++) {
      const value = spectrum[i] || 0;
      const barHeight = value * baseRadius * 0.8;
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2; // Start from top

      const x1 = centerX + Math.cos(angle) * pulseRadius;
      const y1 = centerY + Math.sin(angle) * pulseRadius;
      const x2 = centerX + Math.cos(angle) * (pulseRadius + barHeight);
      const y2 = centerY + Math.sin(angle) * (pulseRadius + barHeight);

      // Color based on frequency
      const freqRatio = i / bars;
      let color;
      if (freqRatio < 0.3) {
        color = '#8b5cf6'; // Bass - purple
      } else if (freqRatio < 0.6) {
        color = '#3b82f6'; // Mids - blue
      } else {
        color = '#06b6d4'; // Highs - cyan
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, (2 * Math.PI * pulseRadius) / bars - 2);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw inner mirror effect (optional - creates symmetric look)
    for (let i = 0; i < bars; i++) {
      const value = spectrum[i] || 0;
      const barHeight = value * baseRadius * 0.3;
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;

      const innerRadius = pulseRadius * 0.75;
      const x1 = centerX + Math.cos(angle) * innerRadius;
      const y1 = centerY + Math.sin(angle) * innerRadius;
      const x2 = centerX + Math.cos(angle) * (innerRadius - barHeight);
      const y2 = centerY + Math.sin(angle) * (innerRadius - barHeight);

      ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
      ctx.lineWidth = Math.max(1, (2 * Math.PI * innerRadius) / bars - 2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
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
        {VISUALIZER_MODES.map((m) => (
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
