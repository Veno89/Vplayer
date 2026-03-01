import { useState, useEffect, useRef, memo } from 'react';
import { TauriAPI } from '../services/TauriAPI';

interface WaveformSeekbarProps {
  trackPath: string | undefined;
  progressPercent: number;
  accentHex: string;
}

const NUM_BARS = 200;

export const WaveformSeekbar = memo(function WaveformSeekbar({
  trackPath,
  progressPercent,
  accentHex,
}: WaveformSeekbarProps) {
  const [bars, setBars] = useState<number[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPathRef = useRef<string | undefined>(undefined);

  // Fetch waveform data when track changes
  useEffect(() => {
    if (!trackPath || trackPath === lastPathRef.current) return;
    lastPathRef.current = trackPath;
    let cancelled = false;

    TauriAPI.getTrackWaveform(trackPath, NUM_BARS).then((data) => {
      if (!cancelled) setBars(data);
    }).catch(() => {
      if (!cancelled) setBars(null);
    });

    return () => { cancelled = true; };
  }, [trackPath]);

  // Clear waveform when no track
  useEffect(() => {
    if (!trackPath) {
      setBars(null);
      lastPathRef.current = undefined;
    }
  }, [trackPath]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bars) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const barWidth = width / bars.length;
    const splitX = (progressPercent / 100) * width;

    for (let i = 0; i < bars.length; i++) {
      const x = i * barWidth;
      const barH = Math.max(1, bars[i] * height);
      const y = (height - barH) / 2;

      if (x + barWidth <= splitX) {
        ctx.fillStyle = accentHex;
        ctx.globalAlpha = 0.9;
      } else {
        ctx.fillStyle = '#94a3b8'; // slate-400
        ctx.globalAlpha = 0.35;
      }

      ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barH);
    }

    ctx.globalAlpha = 1;
  }, [bars, progressPercent, accentHex]);

  if (!bars) return null;

  return (
    <canvas
      ref={canvasRef}
      width={NUM_BARS * 3}
      height={24}
      className="absolute inset-0 w-full h-full rounded-full pointer-events-none"
    />
  );
});
