import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { notifyAppWindowVisibility, useAppVisibility } from '../useAppVisibility';

describe('useAppVisibility', () => {
  afterEach(() => {
    act(() => notifyAppWindowVisibility(true));
  });

  it('tracks JS-owned hide and show transitions', () => {
    const { result } = renderHook(() => useAppVisibility());
    expect(result.current).toBe(true);

    act(() => notifyAppWindowVisibility(false));
    expect(result.current).toBe(false);

    act(() => notifyAppWindowVisibility(true));
    expect(result.current).toBe(true);
  });
});
