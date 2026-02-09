/// <reference types="vitest/globals" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaylistContent } from './PlaylistContent';
import type { Track } from '../types';
import type { ColorScheme } from '../store/types';

describe('PlaylistContent', () => {
  it('renders empty state when no tracks', () => {
    render(<PlaylistContent tracks={[]} currentTrack={0} setCurrentTrack={() => {}} currentColors={{ accent: '#fff' } as ColorScheme} loadingTrackIndex={null} />);
    expect(screen.getByText(/No music in library/i)).toBeInTheDocument();
  });

  it('renders tracks when provided', () => {
    const tracks: Track[] = [
      { id: '1', path: '/song1.mp3', name: 'song1.mp3', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: 180 },
      { id: '2', path: '/song2.mp3', name: 'song2.mp3', title: 'Song 2', artist: 'Artist 2', album: 'Album 2', duration: 240 }
    ];
    render(<PlaylistContent tracks={tracks} currentTrack={0} setCurrentTrack={() => {}} currentColors={{ accent: '#fff' } as ColorScheme} loadingTrackIndex={null} />);
    expect(screen.getByText(/Song 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Song 2/i)).toBeInTheDocument();
  });
});
