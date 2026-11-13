import { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaveformSeekbar } from './WaveformSeekbar';
import { TauriAPI } from '../services/TauriAPI';

vi.mock('../services/TauriAPI', () => ({ TauriAPI: { getTrackWaveform: vi.fn() } }));
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('Waveform lifetime', () => {
  const props = { trackId: 'a', trackPath: '/a.mp3', progressPercent: 20, accentHex: '#00ffff' };
  it('survives StrictMode cleanup and avoids decoding tracks skipped immediately', async () => {
    vi.mocked(TauriAPI.getTrackWaveform).mockResolvedValue([.1, .8]);
    const view = render(<StrictMode><WaveformSeekbar {...props} /></StrictMode>);
    await act(() => vi.advanceTimersByTimeAsync(100));
    view.rerender(<StrictMode><WaveformSeekbar {...props} trackId="b" trackPath="/b.mp3" /></StrictMode>);
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(TauriAPI.getTrackWaveform).toHaveBeenCalledExactlyOnceWith('b', '/b.mp3', 200);
    expect(view.container.querySelector('path')).toBeInTheDocument();
  });
  it('hides the previous track while the next waveform is pending', async () => {
    vi.mocked(TauriAPI.getTrackWaveform).mockResolvedValueOnce([.2, .6]).mockImplementationOnce(() => new Promise(() => {}));
    const view = render(<WaveformSeekbar {...props} />);
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(view.container.querySelector('path')).toBeInTheDocument();
    view.rerender(<WaveformSeekbar {...props} trackId="b" trackPath="/b.mp3" />);
    expect(view.container.querySelector('path')).not.toBeInTheDocument();
  });
});
