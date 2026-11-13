import { memo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { TauriAPI } from '../../services/TauriAPI';
import { useToast } from '../../hooks/useToast';

export const PlayerTools = memo(function PlayerTools({ onNavigate }: { onNavigate: () => void }) {
  const speed = useStore(s => s.playbackSpeed);
  const sleep = useStore(s => s.sleepTimerMinutes);
  const stop = useStore(s => s.stopAfterCurrent);
  const setSpeed = useStore(s => s.setPlaybackSpeed);
  const setSleep = useStore(s => s.setSleepTimerMinutes);
  const setStop = useStore(s => s.setStopAfterCurrent);
  const updateWindow = useStore(s => s.updateWindow);
  const bringToFront = useStore(s => s.bringToFront);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const selectClass = 'rounded-sm border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white';
  const changeSpeed = async (value: number) => {
    setBusy(true);
    try {
      const effects = await TauriAPI.getAudioEffects();
      await TauriAPI.setAudioEffects({ ...effects, tempo: value });
      setSpeed(value);
    } catch { toast.showError('Could not change playback speed'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3 text-sm" aria-label="Playback tools">
    <label className="flex items-center justify-between gap-3">Playback speed<select className={selectClass} aria-label="Playback speed" value={speed} disabled={busy} onChange={event => { void changeSpeed(Number(event.target.value)); }}>
      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}
      {![0.5, 0.75, 1, 1.25, 1.5, 2].includes(speed) && <option value={speed}>{speed}×</option>}
    </select></label>
    <label className="flex items-center justify-between gap-3">Sleep timer<select className={selectClass} aria-label="Sleep timer" value={sleep} onChange={event => setSleep(Number(event.target.value))}>
      {[0, 15, 30, 45, 60, 90, 120].map(value => <option key={value} value={value}>{value ? `${value} min` : 'Off'}</option>)}
      {![0, 15, 30, 45, 60, 90, 120].includes(sleep) && <option value={sleep}>{sleep} min</option>}
    </select></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={stop} onChange={event => setStop(event.target.checked)} />Stop after current track</label>
    <div className="flex gap-3 border-t border-slate-700 pt-2">
      <button className="text-slate-300 hover:text-white" onClick={() => { onNavigate(); updateWindow('equalizer', { visible: true, minimized: false }); bringToFront('equalizer'); }}>Equalizer</button>
      <button className="text-slate-300 hover:text-white" onClick={() => { onNavigate(); updateWindow('options', { visible: true, minimized: false }); bringToFront('options'); }}>All settings</button>
    </div>
  </div>;
});
