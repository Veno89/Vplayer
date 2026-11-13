import { memo, useEffect, useState } from 'react';
import { Repeat, X, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { formatDuration } from '../../utils/formatters';

export function parseLoopTime(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(text)) return null;
  const parts = text.split(':').map(Number);
  if (parts.slice(1).some(part => part >= 60)) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return Number.isFinite(seconds) ? seconds : null;
}

export const PlayerLoopControls = memo(function PlayerLoopControls({ disabled }: { disabled: boolean }) {
  const loop = useStore(s => s.abRepeat);
  const duration = useStore(s => s.duration);
  const setA = useStore(s => s.setPointA);
  const setB = useStore(s => s.setPointB);
  const toggle = useStore(s => s.toggleABRepeat);
  const clear = useStore(s => s.clearABRepeat);
  const [expanded, setExpanded] = useState(false);
  const [a, setDraftA] = useState('');
  const [b, setDraftB] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraftA(loop.pointA === null ? '' : String(Math.round(loop.pointA * 1000) / 1000));
    setDraftB(loop.pointB === null ? '' : String(Math.round(loop.pointB * 1000) / 1000));
    setError(null);
  }, [loop.pointA, loop.pointB]);
  const button = 'inline-flex items-center justify-center gap-1 rounded-sm px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed';
  const valid = loop.pointA !== null && loop.pointB !== null;
  const apply = () => {
    const start = parseLoopTime(a), end = parseLoopTime(b);
    if (start === null || end === null || start >= end || end > duration) {
      setError('Enter seconds or m:ss. B must be after A and within the track.'); return;
    }
    setA(start); setB(end); setError(null);
  };
  return <section aria-label="A–B loop" className="shrink-0 text-xs">
    <div className="flex flex-wrap items-center justify-center gap-1">
      <button className={button} disabled={disabled} title="Set loop start at the current position" aria-label="Set loop start A" onClick={() => { setA(useStore.getState().progress); setError(null); }}>A{loop.pointA !== null ? ` ${formatDuration(loop.pointA)}` : ''}</button>
      <button className={button} disabled={disabled || loop.pointA === null} title="Set loop end at the current position" aria-label="Set loop end B" onClick={() => {
        const value = useStore.getState().progress;
        if (loop.pointA === null || value <= loop.pointA) { setError('Move past A before setting B.'); return; }
        setB(value); setError(null);
      }}>B{loop.pointB !== null ? ` ${formatDuration(loop.pointB)}` : ''}</button>
      <button className={button} disabled={disabled || !valid} aria-pressed={loop.enabled} aria-label={loop.enabled ? 'Disable A–B loop' : 'Enable A–B loop'} onClick={toggle}><Repeat className="h-3 w-3" />{loop.enabled ? 'Loop on' : 'Loop off'}</button>
      <button className={button} disabled={disabled} aria-expanded={expanded} aria-label="Edit loop timestamps" onClick={() => setExpanded(value => !value)}><SlidersHorizontal className="h-3 w-3" /></button>
      {loop.pointA !== null && <button className={button} aria-label="Clear A–B loop" onClick={() => { clear(); setError(null); }}><X className="h-3 w-3" /></button>}
    </div>
    {expanded && <form className="mt-1 flex flex-wrap items-end justify-center gap-2" onSubmit={event => { event.preventDefault(); apply(); }}>
      <label className="text-slate-400">Start A<input aria-label="Loop start time" value={a} onChange={event => setDraftA(event.target.value)} placeholder="0:10" disabled={disabled} className="ml-1 w-20 rounded-sm border border-slate-600 bg-slate-900 px-1 py-1 text-white" /></label>
      <label className="text-slate-400">End B<input aria-label="Loop end time" value={b} onChange={event => setDraftB(event.target.value)} placeholder="0:30" disabled={disabled} className="ml-1 w-20 rounded-sm border border-slate-600 bg-slate-900 px-1 py-1 text-white" /></label>
      <button className={button} disabled={disabled}>Apply</button>
    </form>}
    {error && <p role="alert" className="mt-1 text-center text-amber-300">{error}</p>}
  </section>;
});
