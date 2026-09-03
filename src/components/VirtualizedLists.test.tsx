import React, { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackList, type TrackListHandle } from './TrackList';
import { VirtualFolderTrackList } from '../windows/LibraryWindow';
import type { ColorScheme } from '../store/types';
import type { Track } from '../types';

const tracks: Track[] = [
  { id: 'track-1', path: 'C:/Music/one.mp3', name: 'one.mp3', title: 'Song One', artist: 'Artist', album: 'Album', duration: 120 },
  { id: 'track-2', path: 'C:/Music/two.mp3', name: 'two.mp3', title: 'Song Two', artist: 'Artist', album: 'Album', duration: 180 },
  { id: 'track-3', path: 'C:/Music/three.mp3', name: 'three.mp3', title: 'Song Three', artist: 'Artist', album: 'Album', duration: 240 },
];

const colors = {
  name: 'Test',
  accent: 'text-cyan-400',
  background: 'bg-slate-950',
  primary: 'bg-cyan-600',
  text: 'text-white',
  textMuted: 'text-slate-400',
} as ColorScheme;

const scrollTo = vi.fn();
let originalScrollTo: PropertyDescriptor | undefined;

beforeAll(() => {
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  });
});

afterAll(() => {
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  }
});

beforeEach(() => {
  scrollTo.mockClear();
});

describe('react-window v2 integrations', () => {
  it('preserves TrackList listbox navigation and the public scroll adapter', () => {
    const onPlayTrack = vi.fn();
    const listRef = React.createRef<TrackListHandle>();

    render(
      <TrackList
        ref={listRef}
        tracks={tracks}
        currentTrack={0}
        onSelect={vi.fn()}
        onPlayTrack={onPlayTrack}
        currentColors={colors}
        loadingTrackIndex={null}
        height={120}
        itemSize={40}
      />
    );

    const listbox = screen.getByRole('listbox', { name: 'Track list' });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute('aria-posinset', '1');
    expect(options[0]).toHaveAttribute('aria-setsize', '3');
    expect(screen.getByText('Song One')).toBeInTheDocument();

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onPlayTrack).toHaveBeenCalledWith(1);

    act(() => listRef.current?.scrollToItem(2, 'center'));
    expect(scrollTo).toHaveBeenCalled();
  });

  it('renders semantic library rows and preserves drag payload callbacks', () => {
    vi.useFakeTimers();
    const onTrackDragStart = vi.fn();
    const onTrackDragEnd = vi.fn();
    const setIsDragging = vi.fn();
    const dataTransfer = {
      effectAllowed: 'none',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };

    render(
      <VirtualFolderTrackList
        label="Tracks in Music"
        tracks={tracks}
        onTrackDragStart={onTrackDragStart}
        onTrackDragEnd={onTrackDragEnd}
        setIsDragging={setIsDragging}
      />
    );

    expect(screen.getByRole('list', { name: 'Tracks in Music' })).toBeInTheDocument();
    const firstRow = screen.getByText('Song One').closest('[role="listitem"]');
    expect(firstRow).not.toBeNull();

    fireEvent.dragStart(firstRow!, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/json',
      JSON.stringify([{ id: 'track-1', path: 'C:/Music/one.mp3', title: 'Song One', artist: 'Artist', album: 'Album' }])
    );
    expect(onTrackDragStart).toHaveBeenCalledWith([
      { id: 'track-1', path: 'C:/Music/one.mp3', title: 'Song One', artist: 'Artist', album: 'Album' },
    ]);
    expect(setIsDragging).toHaveBeenCalledWith(true);

    fireEvent.dragEnd(firstRow!);
    expect(onTrackDragEnd).toHaveBeenCalledOnce();
    expect(setIsDragging).toHaveBeenLastCalledWith(false);

    act(() => vi.runAllTimers());
    vi.useRealTimers();
  });
});
