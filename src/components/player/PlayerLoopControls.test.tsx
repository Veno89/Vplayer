import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayerLoopControls, parseLoopTime } from './PlayerLoopControls';
import { useStore } from '../../store/useStore';

beforeEach(() => useStore.setState({ ...useStore.getInitialState(), duration: 100, progress: 10 }));
afterEach(cleanup);
describe('A–B loop editing', () => {
  it('parses precise timestamps and rejects malformed values', () => {
    expect(parseLoopTime('1:02.125')).toBe(62.125);
    expect(parseLoopTime('1:02:03')).toBe(3723);
    expect(parseLoopTime('12.5')).toBe(12.5);
    for (const value of ['', '-1', '1:60', 'NaN', '1::2']) expect(parseLoopTime(value)).toBeNull();
  });
  it('validates edits and preserves loop points when disabling the loop', () => {
    render(<PlayerLoopControls disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit loop timestamps' }));
    fireEvent.change(screen.getByLabelText('Loop start time'), { target: { value: '0:30' } });
    fireEvent.change(screen.getByLabelText('Loop end time'), { target: { value: '0:10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(useStore.getState().abRepeat.enabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Loop end time'), { target: { value: '0:40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disable A–B loop' }));
    expect(useStore.getState().abRepeat).toEqual({ enabled: false, pointA: 30, pointB: 40 });
    fireEvent.click(screen.getByRole('button', { name: 'Enable A–B loop' }));
    expect(useStore.getState().abRepeat.enabled).toBe(true);
  });
});
