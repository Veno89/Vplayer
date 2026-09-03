import { describe, expect, it } from 'vitest';
import { smoothSpectrumFrame } from './VisualizerWindow';

function smoothForDuration(frameMs: number, durationMs: number, target: number): number {
  const current = [0];
  let elapsed = 0;

  while (elapsed < durationMs) {
    const step = Math.min(frameMs, durationMs - elapsed);
    smoothSpectrumFrame(current, [target], step);
    elapsed += step;
  }

  return current[0];
}

describe('visualizer spectrum smoothing', () => {
  it('responds quickly to new peaks and releases them more gently', () => {
    const current = [0];

    smoothSpectrumFrame(current, [1], 50);
    const attacked = current[0];
    expect(attacked).toBeGreaterThan(0.6);

    smoothSpectrumFrame(current, [0], 50);
    expect(current[0]).toBeLessThan(attacked);
    expect(current[0]).toBeGreaterThan(0.4);
  });

  it('produces the same motion at different render rates', () => {
    const atThirtyFps = smoothForDuration(1000 / 30, 200, 1);
    const atSixtyFps = smoothForDuration(1000 / 60, 200, 1);

    expect(atThirtyFps).toBeCloseTo(atSixtyFps, 6);
  });

  it('resizes safely and clamps invalid backend values', () => {
    const current = [Number.NaN];

    smoothSpectrumFrame(current, [2, Number.NaN, -1], 50);

    expect(current).toHaveLength(3);
    expect(current[0]).toBeGreaterThan(0);
    expect(current[0]).toBeLessThanOrEqual(1);
    expect(current[1]).toBe(0);
    expect(current[2]).toBe(0);
  });
});
