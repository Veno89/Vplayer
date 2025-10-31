import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaylistContent } from './PlaylistContent';

describe('PlaylistContent', () => {
  it('renders empty state when no tracks', () => {
    render(<PlaylistContent tracks={[]} currentTrack={0} setCurrentTrack={() => {}} currentColors={{ accent: '#fff' }} loadingTrackIndex={null} />);
    expect(screen.getByText(/No music in library/i)).toBeInTheDocument();
  });

  it('renders tracks when provided', () => {
    const tracks = [
      { title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: '3:00' },
      { title: 'Song 2', artist: 'Artist 2', album: 'Album 2', duration: '4:00' }
    ];
    render(<PlaylistContent tracks={tracks} currentTrack={0} setCurrentTrack={() => {}} currentColors={{ accent: '#fff' }} loadingTrackIndex={null} />);
    expect(screen.getByText(/Song 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Song 2/i)).toBeInTheDocument();
  });
});
