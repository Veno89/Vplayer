import { useState, useEffect, useMemo, useId, memo } from 'react';
import { TauriAPI } from '../services/TauriAPI';

interface WaveformSeekbarProps {
  trackId: string | undefined;
  trackPath: string | undefined;
  progressPercent: number;
  accentHex: string;
}

export const WaveformSeekbar = memo(function WaveformSeekbar({ trackPath, trackId, progressPercent, accentHex }: WaveformSeekbarProps) {
  const [waveform, setWaveform] = useState<{ path: string; bars: number[] } | null>(null);
  const gradientId = useId();
  useEffect(() => {
    if (!trackId || !trackPath) return;
    let cancelled = false;
    // Avoid starting a full-file decode while the user is quickly skipping.
    const timer = setTimeout(() => {
      TauriAPI.getTrackWaveform(trackId, trackPath, 200).then(bars => {
        if (!cancelled) setWaveform({ path: trackPath, bars });
      }).catch(() => { if (!cancelled) setWaveform(null); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [trackId, trackPath]);
  const bars = waveform && waveform.path === trackPath ? waveform.bars : null;
  const path = useMemo(() => bars?.map((peak, index) => {
    const height = Math.max(1, Math.min(1, Math.max(0, peak)) * 24);
    return `M${index * 3},${(24 - height) / 2}h2v${height}h-2z`;
  }).join('') ?? '', [bars]);
  if (!bars) return null;
  const split = `${Math.max(0, Math.min(100, progressPercent))}%`;
  // The path stays static; only two gradient stops move on playback ticks.
  return <svg aria-hidden="true" viewBox={`0 0 ${bars.length * 3} 24`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none">
    <defs><linearGradient id={gradientId}><stop offset={split} stopColor={accentHex} /><stop offset={split} stopColor="#94a3b8" stopOpacity="0.45" /></linearGradient></defs>
    <path d={path} fill={`url(#${gradientId})`} />
  </svg>;
});
