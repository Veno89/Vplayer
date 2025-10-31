import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useLibrary } from '../hooks/useLibrary';

describe('useLibrary', () => {
  it('should initialize with empty tracks and folders', () => {
    const { result } = renderHook(() => useLibrary({}));
    expect(result.current.tracks).toEqual([]);
    expect(result.current.libraryFolders).toEqual([]);
    expect(result.current.orphanedTracks).toEqual([]);
  });

  it('should allow setting tracks', () => {
    const { result } = renderHook(() => useLibrary({}));
    act(() => {
      result.current.setTracks([{ title: 'Song', path: 'folder/song.mp3' }]);
    });
    expect(result.current.tracks.length).toBe(1);
    expect(result.current.tracks[0].title).toBe('Song');
  });
});
