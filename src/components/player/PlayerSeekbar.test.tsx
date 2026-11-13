import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerSeekbar } from './PlayerSeekbar';
import { useStore } from '../../store/useStore';

vi.mock('../WaveformSeekbar', () => ({ WaveformSeekbar: () => null }));
const track = { id: 'a', name: 'A', path: '/a.mp3', duration: 100 };
beforeEach(() => {
  useStore.setState({ ...useStore.getInitialState(), activePlaybackTracks: [track], currentTrack: 0, currentTrackId: 'a', duration: 100, progress: 10, seekStepSize: 15 });
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
  Element.prototype.releasePointerCapture = vi.fn();
  // jsdom does not supply PointerEvent coordinates by default.
  vi.stubGlobal('PointerEvent', MouseEvent);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('Player seek interaction', () => {
  const setup = () => {
    const seek = vi.fn();
    render(<PlayerSeekbar track={track} disabled={false} onSeek={seek} />);
    const bar = screen.getByRole('slider');
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 } as DOMRect);
    return { seek, bar };
  };
  it('previews dragging immediately and seeks exactly once at release', () => {
    const { seek, bar } = setup();
    fireEvent.pointerDown(bar, { clientX: 20, button: 0 });
    fireEvent.pointerMove(bar, { clientX: 65 });
    expect(bar).toHaveAttribute('aria-valuenow', '65');
    expect(seek).not.toHaveBeenCalled();
    fireEvent.pointerUp(bar, { clientX: 80 });
    expect(seek).toHaveBeenCalledExactlyOnceWith(80);
    expect(bar).toHaveAttribute('aria-valuenow', '80');
    act(() => useStore.setState({ progress: 80 }));
    expect(bar).toHaveAttribute('aria-valuenow', '80');
  });
  it('cancels an interrupted drag without sending a seek', () => {
    const { seek, bar } = setup();
    fireEvent.pointerDown(bar, { clientX: 70, button: 0 });
    fireEvent.pointerCancel(bar);
    expect(bar).toHaveAttribute('aria-valuenow', '10');
    expect(seek).not.toHaveBeenCalled();
  });
  it('uses configured keyboard steps and clamps at the track boundaries', () => {
    const { seek, bar } = setup();
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    expect(seek).toHaveBeenLastCalledWith(25);
    fireEvent.keyDown(bar, { key: 'End' });
    expect(seek).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(bar, { key: 'Home' });
    expect(seek).toHaveBeenLastCalledWith(0);
  });
  it('does not apply an old drag to a newly selected track', () => {
    const { seek, bar } = setup();
    fireEvent.pointerDown(bar, { clientX: 20, button: 0 });
    act(() => useStore.setState({ currentTrackId: 'b' }));
    fireEvent.pointerUp(bar, { clientX: 80 });
    expect(seek).not.toHaveBeenCalled();
  });
});
