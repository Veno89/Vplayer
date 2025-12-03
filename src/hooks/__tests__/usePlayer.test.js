import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayer } from '../usePlayer';

describe('usePlayer', () => {
  let mockAudio;
  let mockPlayer;
  let mockToast;
  let mockCrossfade;

  beforeEach(() => {
    // Mock audio backend
    mockAudio = {
      seek: vi.fn().mockResolvedValue(undefined),
      changeVolume: vi.fn().mockResolvedValue(undefined),
    };

    // Mock player state
    mockPlayer = {
      currentTrack: 0,
      setCurrentTrack: vi.fn(),
      shuffle: false,
      repeatMode: 'off',
      progress: 0,
      duration: 180,
      volume: 0.7,
      setVolume: vi.fn(),
    };

    // Mock toast service
    mockToast = {
      showError: vi.fn(),
      showWarning: vi.fn(),
      showSuccess: vi.fn(),
    };

    // Mock crossfade
    mockCrossfade = null;
  });

  describe('handleNextTrack', () => {
    it('should advance to next track in sequential mode', () => {
      const tracks = [
        { id: '1', title: 'Track 1' },
        { id: '2', title: 'Track 2' },
        { id: '3', title: 'Track 3' },
      ];

      const { result } = renderHook(() =>
        usePlayer({
          audio: mockAudio,
          player: mockPlayer,
          tracks,
          toast: mockToast,
          crossfade: mockCrossfade,
        })
      );

      act(() => {
        result.current.handleNextTrack();
      });

      expect(mockPlayer.setCurrentTrack).toHaveBeenCalledWith(1);
    });

    it('should wrap to first track when repeat is all', () => {
      const tracks = [
        { id: '1', title: 'Track 1' },
        { id: '2', title: 'Track 2' },
      ];

      mockPlayer.currentTrack = 1; // Last track
      mockPlayer.repeatMode = 'all';

      const { result } = renderHook(() =>
        usePlayer({
          audio: mockAudio,
          player: mockPlayer,
          tracks,
          toast: mockToast,
          crossfade: mockCrossfade,
        })
      );

      act(() => {
        result.current.handleNextTrack();
      });

      expect(mockPlayer.setCurrentTrack).toHaveBeenCalledWith(0);
    });

    it('should select random track in shuffle mode', () => {
      const tracks = [
        { id: '1', title: 'Track 1' },
        { id: '2', title: 'Track 2' },
        { id: '3', title: 'Track 3' },
      ];

      mockPlayer.shuffle = true;

      const { result } = renderHook(() =>
        usePlayer({
          audio: mockAudio,
          player: mockPlayer,
          tracks,
          toast: mockToast,
          crossfade: mockCrossfade,
        })
      );

      act(() => {
        result.current.handleNextTrack();
      });

      // Should call setCurrentTrack with some track index
      expect(mockPlayer.setCurrentTrack).toHaveBeenCalled();
      const calledWith = mockPlayer.setCurrentTrack.mock.calls[0][0];
      expect(calledWith).toBeGreaterThanOrEqual(0);
      expect(calledWith).toBeLessThan(tracks.length);
    });
  });

  describe('handlePrevTrack', () => {
    it('should go to previous track', () => {
      const tracks = [
        { id: '1', title: 'Track 1' },
        { id: '2', title: 'Track 2' },
        { id: '3', title: 'Track 3' },
      ];

      mockPlayer.currentTrack = 1;
      mockPlayer.progress = 1; // Less than threshold

      const { result } = renderHook(() =>
        usePlayer({
          audio: mockAudio,
          player: mockPlayer,
          tracks,
          toast: mockToast,
          crossfade: mockCrossfade,
        })
      );

      act(() => {
        result.current.handlePrevTrack();
      });

      expect(mockPlayer.setCurrentTrack).toHaveBeenCalledWith(0);
    });

    it('should restart current track if past threshold', () => {
      const tracks = [
        { id: '1', title: 'Track 1' },
        { id: '2', title: 'Track 2' },
      ];

      mockPlayer.currentTrack = 1;
      mockPlayer.progress = 5; // Past threshold (> 3 seconds)

      const { result } = renderHook(() =>
        usePlayer({
          audio: mockAudio,
          player: mockPlayer,
          tracks,
          toast: mockToast,
          crossfade: mockCrossfade,
        })
      );

      act(() => {
        result.current.handlePrevTrack();
      });

      expect(mockAudio.seek).toHaveBeenCalledWith(0);
      expect(mockPlayer.setCurrentTrack).not.toHaveBeenCalled();
    });
  });

  describe('handleSeek', () => {
    it('should seek to correct position based on percentage', async () => {
      const tracks = [{ id: '1', title: 'Track 1' }];

      mockPlayer.duration = 100; // 100 seconds

      const { result } = renderHook(() =>
        usePlayer({
          audio: mockAudio,
          player: mockPlayer,
          tracks,
          toast: mockToast,
          crossfade: mockCrossfade,
        })
      );

      act(() => {
        result.current.handleSeek(50); // 50%
      });

      // Wait for the throttled seek to complete
      await vi.waitFor(() => {
        expect(mockAudio.seek).toHaveBeenCalledWith(50); // 50 seconds
      });
    });
  });

  describe('handleVolumeChange', () => {
    it('should update volume', () => {
      const tracks = [{ id: '1', title: 'Track 1' }];

      const { result } = renderHook(() =>
        usePlayer({
          audio: mockAudio,
          player: mockPlayer,
          tracks,
          toast: mockToast,
          crossfade: mockCrossfade,
        })
      );

      act(() => {
        result.current.handleVolumeChange(0.5);
      });

      expect(mockPlayer.setVolume).toHaveBeenCalledWith(0.5);
      expect(mockAudio.changeVolume).toHaveBeenCalledWith(0.5);
    });

    it('should toggle mute', () => {
      const tracks = [{ id: '1', title: 'Track 1' }];

      mockPlayer.volume = 0.7;

      const { result } = renderHook(() =>
        usePlayer({
          audio: mockAudio,
          player: mockPlayer,
          tracks,
          toast: mockToast,
          crossfade: mockCrossfade,
        })
      );

      act(() => {
        result.current.handleToggleMute();
      });

      // Should mute (set to 0)
      expect(mockPlayer.setVolume).toHaveBeenCalledWith(0);
    });
  });
});
