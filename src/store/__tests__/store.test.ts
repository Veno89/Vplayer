/**
 * Store slice tests — pure function tests that verify Zustand store logic.
 * Covers the most important behaviors: queue operations, window management,
 * A-B repeat, shuffle, layout application, theme CRUD.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../useStore';

const makeMockTrack = (overrides = {}) => ({
  id: `track-${Math.random().toString(36).slice(2, 8)}`,
  name: 'Test Track',
  title: 'Test Track',
  artist: 'Test Artist',
  album: 'Test Album',
  path: '/test/track.mp3',
  duration: 200,
  ...overrides,
});

describe('playerSlice', () => {
  beforeEach(() => {
    // Reset the store to default state before each test
    useStore.setState(useStore.getInitialState());
  });

  describe('queue operations', () => {
    it('adds tracks to end of queue', () => {
      const track = makeMockTrack({ id: 'a' });
      useStore.getState().addToQueue(track, 'end');
      expect(useStore.getState().queue).toHaveLength(1);
      expect(useStore.getState().queue[0].id).toBe('a');
    });

    it('adds tracks to start of queue', () => {
      const a = makeMockTrack({ id: 'a' });
      const b = makeMockTrack({ id: 'b' });
      useStore.getState().addToQueue(a, 'end');
      useStore.getState().addToQueue(b, 'start');
      expect(useStore.getState().queue[0].id).toBe('b');
      expect(useStore.getState().queue[1].id).toBe('a');
    });

    it('adds tracks as next in queue', () => {
      const a = makeMockTrack({ id: 'a' });
      const b = makeMockTrack({ id: 'b' });
      const c = makeMockTrack({ id: 'c' });
      useStore.getState().addToQueue([a, b], 'end');
      useStore.getState().addToQueue(c, 'next'); // inserts at index 1 (after queueIndex 0)
      expect(useStore.getState().queue.map(t => t.id)).toEqual(['a', 'c', 'b']);
    });

    it('removes a track from queue', () => {
      const tracks = [makeMockTrack({ id: 'a' }), makeMockTrack({ id: 'b' }), makeMockTrack({ id: 'c' })];
      useStore.getState().addToQueue(tracks, 'end');
      useStore.getState().removeFromQueue(1); // remove 'b'
      expect(useStore.getState().queue.map(t => t.id)).toEqual(['a', 'c']);
    });

    it('clears the queue', () => {
      useStore.getState().addToQueue([makeMockTrack(), makeMockTrack()], 'end');
      useStore.getState().clearQueue();
      expect(useStore.getState().queue).toHaveLength(0);
      expect(useStore.getState().queueIndex).toBe(0);
    });

    it('replaces the queue', () => {
      useStore.getState().addToQueue(makeMockTrack(), 'end');
      const newTracks = [makeMockTrack({ id: 'x' }), makeMockTrack({ id: 'y' })];
      useStore.getState().replaceQueue(newTracks, 1);
      expect(useStore.getState().queue).toHaveLength(2);
      expect(useStore.getState().queueIndex).toBe(1);
    });

    it('moves track within queue', () => {
      const tracks = [makeMockTrack({ id: 'a' }), makeMockTrack({ id: 'b' }), makeMockTrack({ id: 'c' })];
      useStore.getState().addToQueue(tracks, 'end');
      useStore.getState().moveInQueue(0, 2); // move 'a' to position 2
      expect(useStore.getState().queue.map(t => t.id)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('A-B repeat', () => {
    it('sets point A and B, enabling repeat', () => {
      useStore.getState().setPointA(10);
      expect(useStore.getState().abRepeat.pointA).toBe(10);
      expect(useStore.getState().abRepeat.enabled).toBe(false);

      useStore.getState().setPointB(30);
      expect(useStore.getState().abRepeat.pointB).toBe(30);
      expect(useStore.getState().abRepeat.enabled).toBe(true);
    });

    it('clears A-B repeat', () => {
      useStore.getState().setPointA(10);
      useStore.getState().setPointB(30);
      useStore.getState().clearABRepeat();
      expect(useStore.getState().abRepeat).toEqual({
        enabled: false,
        pointA: null,
        pointB: null,
      });
    });

    it('toggleABRepeat only if both points are set', () => {
      useStore.getState().setPointA(5);
      useStore.getState().toggleABRepeat(); // only A set → stays false
      expect(useStore.getState().abRepeat.enabled).toBe(false);

      useStore.getState().setPointB(15);
      expect(useStore.getState().abRepeat.enabled).toBe(true);
      useStore.getState().toggleABRepeat(); // now both set → toggle off
      expect(useStore.getState().abRepeat.enabled).toBe(false);
    });
  });

  describe('player setters', () => {
    it('sets current track and resets progress', () => {
      useStore.setState({ progress: 50 });
      useStore.getState().setCurrentTrack(0);
      expect(useStore.getState().progress).toBe(0);
      expect(useStore.getState().currentTrack).toBe(0);
    });

    it('setPlaying accepts updater function', () => {
      useStore.getState().setPlaying(true);
      expect(useStore.getState().playing).toBe(true);
      useStore.getState().setPlaying((prev) => !prev);
      expect(useStore.getState().playing).toBe(false);
    });

    it('setShuffle accepts updater function', () => {
      useStore.getState().setShuffle(true);
      expect(useStore.getState().shuffle).toBe(true);
      useStore.getState().setShuffle((prev) => !prev);
      expect(useStore.getState().shuffle).toBe(false);
    });

    it('cycles repeat mode', () => {
      useStore.getState().setRepeatMode('all');
      expect(useStore.getState().repeatMode).toBe('all');
      useStore.getState().setRepeatMode('one');
      expect(useStore.getState().repeatMode).toBe('one');
      useStore.getState().setRepeatMode('off');
      expect(useStore.getState().repeatMode).toBe('off');
    });
  });
});

describe('uiSlice', () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState());
  });

  describe('window management', () => {
    it('toggles window visibility', () => {
      useStore.getState().toggleWindow('player');
      const state1 = useStore.getState();
      const wasVisible = !state1.windows.player?.visible; // toggled
      // Toggle again
      useStore.getState().toggleWindow('player');
      const state2 = useStore.getState();
      expect(state2.windows.player.visible).toBe(wasVisible);
    });

    it('creates window if it does not exist on toggle', () => {
      useStore.getState().toggleWindow('nonexistent-window');
      expect(useStore.getState().windows['nonexistent-window']).toBeDefined();
      expect(useStore.getState().windows['nonexistent-window'].visible).toBe(true);
    });

    it('bringToFront increases zIndex', () => {
      const initialZ = useStore.getState().maxZIndex;
      useStore.getState().bringToFront('player');
      expect(useStore.getState().windows.player.zIndex).toBe(initialZ + 1);
      expect(useStore.getState().maxZIndex).toBe(initialZ + 1);
    });

    it('updateWindow merges partial updates', () => {
      useStore.getState().updateWindow('player', { width: 999, height: 777 });
      expect(useStore.getState().windows.player.width).toBe(999);
      expect(useStore.getState().windows.player.height).toBe(777);
    });
  });

  describe('themes', () => {
    it('saves and retrieves a custom theme', () => {
      const theme = { name: 'My Theme', accent: '#f00', background: '#000', primary: '#fff', text: '#eee', textMuted: '#999' } as import('../../store/types').ColorScheme;
      useStore.getState().saveCustomTheme(theme);
      expect(useStore.getState().customThemes['my-theme']).toEqual(theme);
    });

    it('deletes a custom theme and resets to default if active', () => {
      const theme = { name: 'Del Me', accent: '#f00', background: '#000', primary: '#fff', text: '#eee', textMuted: '#999' } as import('../../store/types').ColorScheme;
      useStore.getState().saveCustomTheme(theme);
      useStore.getState().setColorScheme('del-me');
      useStore.getState().deleteCustomTheme('Del Me');
      expect(useStore.getState().customThemes['del-me']).toBeUndefined();
      expect(useStore.getState().colorScheme).toBe('default');
    });
  });

  describe('layouts', () => {
    it('applies a layout template', () => {
      useStore.getState().applyLayout('mini');
      // mini layout has only player visible
      const { windows } = useStore.getState();
      expect(windows.player.visible).toBe(true);
      expect(windows.playlist.visible).toBe(false);
    });

    it('getLayouts returns all templates', () => {
      const layouts = useStore.getState().getLayouts();
      expect(layouts.length).toBeGreaterThanOrEqual(7);
      expect(layouts.some(l => l.name === 'classic')).toBe(true);
    });
  });
});
