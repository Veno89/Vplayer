/// <reference types="vitest/globals" />
import { isTrackWithinFolder, shouldStopPlaybackAfterFolderRemoval } from './libraryPaths';

describe('isTrackWithinFolder', () => {
  it('matches Windows paths case-insensitively across separator styles', () => {
    expect(isTrackWithinFolder('C:\\Music\\Album\\song.mp3', 'c:/music')).toBe(true);
  });

  it('does not count a similarly prefixed sibling folder', () => {
    expect(isTrackWithinFolder('C:/Music Extended/song.mp3', 'C:/Music')).toBe(false);
  });

  it('keeps playback when a nested registered root preserved the current track', () => {
    const current = { id: 'nested', path: 'C:/Music/Keep/song.mp3' };
    expect(shouldStopPlaybackAfterFolderRemoval(current, 'C:/Music', [{ id: 'nested' }])).toBe(false);
  });

  it('stops playback when removing the folder also removed the current track record', () => {
    const current = { id: 'removed', path: 'C:/Music/song.mp3' };
    expect(shouldStopPlaybackAfterFolderRemoval(current, 'C:/Music', [])).toBe(true);
  });

  it('leaves playback alone for a similarly prefixed sibling folder', () => {
    const current = { id: 'sibling', path: 'C:/Music Extended/song.mp3' };
    expect(shouldStopPlaybackAfterFolderRemoval(current, 'C:/Music', [])).toBe(false);
  });
});
