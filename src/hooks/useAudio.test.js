import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useAudio } from '../hooks/useAudio';

describe('useAudio', () => {
  it('should initialize with default volume', () => {
    const { result } = renderHook(() => useAudio({ initialVolume: 0.5 }));
    expect(result.current.volume).toBe(0.5);
  });

  it('should update volume', () => {
    const { result } = renderHook(() => useAudio({ initialVolume: 0.5 }));
    act(() => {
      result.current.setVolume(0.8);
    });
    expect(result.current.volume).toBe(0.8);
  });

  // More tests can be added for play/pause/loadSrc if audio element is mocked
});
