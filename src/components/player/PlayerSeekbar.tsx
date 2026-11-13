import React, { memo, useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useCurrentColors } from '../../hooks/useStoreHooks';
import { formatDuration } from '../../utils/formatters';
import { WaveformSeekbar } from '../WaveformSeekbar';
import type { Track } from '../../types';

/** Only the timeline subscribes to 10 Hz progress; metadata and menus stay idle. */
export const PlayerSeekbar = memo(function PlayerSeekbar({ track, disabled, onSeek }: {
  track: Track | null; disabled: boolean; onSeek: (percent: number) => void;
}) {
  const progress = useStore(s => s.progress);
  const duration = useStore(s => s.duration);
  const seekStep = useStore(s => s.seekStepSize);
  const loop = useStore(s => s.abRepeat);
  const colors = useCurrentColors();
  const [preview, setPreview] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(false);
  const drag = useRef<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const inactive = disabled || !track || duration <= 0;
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  const percentAt = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    return rect?.width ? clamp((clientX - rect.left) / rect.width * 100) : 0;
  };
  const actual = duration > 0 ? clamp(progress / duration * 100) : 0;
  const percent = preview ?? pending ?? actual;
  const seconds = duration * percent / 100;
  useEffect(() => {
    if (pending === null) return;
    const timeout = setTimeout(() => setPending(null), 2200);
    return () => clearTimeout(timeout);
  }, [pending]);
  useEffect(() => {
    if (pending !== null && Math.abs(progress - duration * pending / 100) < 1) setPending(null);
  }, [progress, duration, pending]);
  useEffect(() => {
    if (inactive) { drag.current = null; setPreview(null); setPending(null); }
  }, [inactive]);
  const commit = (value: number) => {
    if (inactive || useStore.getState().currentTrackId !== track?.id) return;
    setPending(value);
    onSeek(value);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (inactive) return;
    let target = seconds;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') target += seekStep;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') target -= seekStep;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = duration;
    else return;
    event.preventDefault(); event.stopPropagation();
    commit(clamp(target / duration * 100));
  };
  return <div className="shrink-0">
    <div ref={bar} role="slider" aria-label="Playback position" aria-valuemin={0} aria-valuemax={duration}
      aria-valuenow={seconds} aria-valuetext={`${formatDuration(seconds)} of ${formatDuration(duration)}`}
      aria-disabled={inactive} tabIndex={inactive ? -1 : 0} onKeyDown={onKeyDown}
      className={`relative flex h-8 items-center rounded-sm outline-offset-2 touch-none ${inactive ? 'opacity-40' : 'cursor-pointer'}`}
      onPointerDown={event => {
        event.stopPropagation();
        if (inactive || event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus();
        drag.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPreview(percentAt(event.clientX));
      }}
      onPointerMove={event => {
        if (inactive) return;
        const value = percentAt(event.clientX); setHover(value);
        if (drag.current === event.pointerId) setPreview(value);
      }}
      onPointerUp={event => {
        if (drag.current !== event.pointerId) return;
        event.stopPropagation();
        drag.current = null;
        commit(percentAt(event.clientX)); setPreview(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; setPreview(null); }}
      onLostPointerCapture={() => { drag.current = null; setPreview(null); }}
      onPointerLeave={() => setHover(null)}>
      <div className="relative h-4 w-full rounded-sm bg-slate-700/40">
        <div className="absolute inset-y-0 left-0 rounded-sm opacity-30" style={{ width: `${percent}%`, backgroundColor: colors.accentHex }} />
        <WaveformSeekbar trackId={track?.id} trackPath={track?.path} progressPercent={percent} accentHex={colors.accentHex ?? '#22d3ee'} />
        {loop.pointA !== null && <span className="absolute inset-y-0 w-0.5" style={{ left: `${clamp(loop.pointA / duration * 100)}%`, backgroundColor: colors.accentHex }} />}
        {loop.pointB !== null && loop.pointA !== null && duration > 0 && <>
          <span className="absolute inset-y-0 opacity-25" style={{ left: `${loop.pointA / duration * 100}%`, width: `${(loop.pointB - loop.pointA) / duration * 100}%`, backgroundColor: colors.accentHex }} />
          <span className="absolute inset-y-0 w-0.5" style={{ left: `${loop.pointB / duration * 100}%`, backgroundColor: colors.accentHex }} />
        </>}
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${percent}%` }} />
      </div>
    </div>
    <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-slate-400">
      <span>{formatDuration(seconds)}</span>
      <span className="min-h-4" style={{ color: colors.accentHex }}>{preview !== null ? 'Release to seek · ' : ''}{hover !== null || preview !== null ? formatDuration(duration * (preview ?? hover ?? 0) / 100) : ''}</span>
      <button disabled={duration <= 0} onClick={() => setRemaining(value => !value)} title={remaining ? 'Show total time' : 'Show remaining time'} aria-label={remaining ? 'Show total time' : 'Show remaining time'}>{remaining ? `−${formatDuration(Math.max(0, duration - seconds))}` : formatDuration(duration)}</button>
    </div>
  </div>;
});
