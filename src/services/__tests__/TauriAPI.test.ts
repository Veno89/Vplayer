import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

// We import the singleton *after* mocks are in place (setupTests.js mocks @tauri-apps/api/core)
import { TauriAPI } from '../TauriAPI';

/**
 * TauriAPI test suite
 *
 * Verifies that every method on the singleton:
 *   1. Calls `invoke` with the correct Tauri command name
 *   2. Passes the right argument shape
 *   3. Propagates results back to the caller
 *   4. Wraps errors with user-friendly messages
 */
describe('TauriAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Audio Player Commands
  // ---------------------------------------------------------------------------
  describe('Audio Player Commands', () => {
    it('loadTrack should invoke load_track with path', async () => {
      await TauriAPI.loadTrack('/music/song.mp3');
      expect(invoke).toHaveBeenCalledWith('load_track', { path: '/music/song.mp3' });
    });

    it('play should invoke play_audio', async () => {
      await TauriAPI.play();
      expect(invoke).toHaveBeenCalledWith('play_audio', {});
    });

    it('pause should invoke pause_audio', async () => {
      await TauriAPI.pause();
      expect(invoke).toHaveBeenCalledWith('pause_audio', {});
    });

    it('stop should invoke stop_audio', async () => {
      await TauriAPI.stop();
      expect(invoke).toHaveBeenCalledWith('stop_audio', {});
    });

    it('setVolume should invoke set_volume', async () => {
      await TauriAPI.setVolume(0.75);
      expect(invoke).toHaveBeenCalledWith('set_volume', { volume: 0.75 });
    });

    it('seekTo should invoke seek_to', async () => {
      await TauriAPI.seekTo(42.5);
      expect(invoke).toHaveBeenCalledWith('seek_to', { position: 42.5 });
    });

    it('getPosition should invoke get_position', async () => {
      const pos = await TauriAPI.getPosition();
      expect(invoke).toHaveBeenCalledWith('get_position', {});
      expect(pos).toBe(0); // default from setupTests mock
    });

    it('isPlaying should invoke is_playing', async () => {
      const playing = await TauriAPI.isPlaying();
      expect(invoke).toHaveBeenCalledWith('is_playing', {});
      expect(playing).toBe(false);
    });

    it('isFinished should invoke is_finished', async () => {
      const finished = await TauriAPI.isFinished();
      expect(invoke).toHaveBeenCalledWith('is_finished', {});
      expect(finished).toBe(false);
    });

    it('getDuration should invoke get_duration', async () => {
      const dur = await TauriAPI.getDuration();
      expect(invoke).toHaveBeenCalledWith('get_duration', {});
      expect(dur).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Balance / Pan Commands
  // ---------------------------------------------------------------------------
  describe('Balance Commands', () => {
    it('setBalance should invoke set_balance', async () => {
      await TauriAPI.setBalance(-0.5);
      expect(invoke).toHaveBeenCalledWith('set_balance', { balance: -0.5 });
    });

    it('getBalance should invoke get_balance', async () => {
      await TauriAPI.getBalance();
      expect(invoke).toHaveBeenCalledWith('get_balance', {});
    });
  });

  // ---------------------------------------------------------------------------
  // Library Commands
  // ---------------------------------------------------------------------------
  describe('Library Commands', () => {
    it('getAllTracks should invoke get_all_tracks', async () => {
      const tracks = await TauriAPI.getAllTracks();
      expect(invoke).toHaveBeenCalledWith('get_all_tracks', {});
      expect(tracks).toEqual([]);
    });

    it('getAllFolders should invoke get_all_folders', async () => {
      const folders = await TauriAPI.getAllFolders();
      expect(invoke).toHaveBeenCalledWith('get_all_folders', {});
      expect(folders).toEqual([]);
    });

    it('scanFolder should invoke scan_folder with folderPath', async () => {
      await TauriAPI.scanFolder('/music');
      expect(invoke).toHaveBeenCalledWith('scan_folder', { folderPath: '/music' });
    });

    it('incrementPlayCount should invoke increment_play_count', async () => {
      await TauriAPI.incrementPlayCount('track-123');
      expect(invoke).toHaveBeenCalledWith('increment_play_count', { trackId: 'track-123' });
    });

    it('updateTrackRating should invoke update_track_rating', async () => {
      await TauriAPI.updateTrackRating('track-1', 5);
      expect(invoke).toHaveBeenCalledWith('update_track_rating', { trackId: 'track-1', rating: 5 });
    });

    it('removeTrack should invoke remove_track', async () => {
      await TauriAPI.removeTrack('track-1');
      expect(invoke).toHaveBeenCalledWith('remove_track', { trackId: 'track-1' });
    });

    it('removeFolder should invoke remove_folder', async () => {
      await TauriAPI.removeFolder('folder-1', '/music/rock');
      expect(invoke).toHaveBeenCalledWith('remove_folder', { folderId: 'folder-1', folderPath: '/music/rock' });
    });
  });

  // ---------------------------------------------------------------------------
  // Playlist Commands
  // ---------------------------------------------------------------------------
  describe('Playlist Commands', () => {
    it('getAllPlaylists should invoke get_all_playlists', async () => {
      const playlists = await TauriAPI.getAllPlaylists();
      expect(invoke).toHaveBeenCalledWith('get_all_playlists', {});
      expect(playlists).toEqual([]);
    });

    it('createPlaylist should invoke create_playlist', async () => {
      await TauriAPI.createPlaylist('My Playlist');
      expect(invoke).toHaveBeenCalledWith('create_playlist', { name: 'My Playlist' });
    });

    it('deletePlaylist should invoke delete_playlist', async () => {
      await TauriAPI.deletePlaylist('pl-1');
      expect(invoke).toHaveBeenCalledWith('delete_playlist', { playlistId: 'pl-1' });
    });

    it('addTrackToPlaylist should invoke add_track_to_playlist', async () => {
      await TauriAPI.addTrackToPlaylist('pl-1', 'track-1');
      expect(invoke).toHaveBeenCalledWith('add_track_to_playlist', {
        playlistId: 'pl-1',
        trackId: 'track-1',
      });
    });

    it('addTracksToPlaylist should invoke add_tracks_to_playlist', async () => {
      await TauriAPI.addTracksToPlaylist('pl-1', ['t1', 't2', 't3']);
      expect(invoke).toHaveBeenCalledWith('add_tracks_to_playlist', {
        playlistId: 'pl-1',
        trackIds: ['t1', 't2', 't3'],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Audio Recovery & Device Commands
  // ---------------------------------------------------------------------------
  describe('Audio Recovery & Device Commands', () => {
    it('recoverAudio should invoke recover_audio', async () => {
      await TauriAPI.recoverAudio();
      expect(invoke).toHaveBeenCalledWith('recover_audio', {});
    });

    it('isAudioDeviceAvailable should invoke is_audio_device_available', async () => {
      await TauriAPI.isAudioDeviceAvailable();
      expect(invoke).toHaveBeenCalledWith('is_audio_device_available', {});
    });

    it('hasAudioDeviceChanged should invoke has_audio_device_changed', async () => {
      await TauriAPI.hasAudioDeviceChanged();
      expect(invoke).toHaveBeenCalledWith('has_audio_device_changed', {});
    });

    it('getInactiveDuration should invoke get_inactive_duration', async () => {
      await TauriAPI.getInactiveDuration();
      expect(invoke).toHaveBeenCalledWith('get_inactive_duration', {});
    });
  });

  // ---------------------------------------------------------------------------
  // Gapless Playback Commands
  // ---------------------------------------------------------------------------
  describe('Gapless Playback Commands', () => {
    it('preloadTrack should invoke preload_track', async () => {
      await TauriAPI.preloadTrack('/music/next.mp3');
      expect(invoke).toHaveBeenCalledWith('preload_track', { path: '/music/next.mp3' });
    });

    it('swapToPreloaded should invoke swap_to_preloaded', async () => {
      await TauriAPI.swapToPreloaded();
      expect(invoke).toHaveBeenCalledWith('swap_to_preloaded', {});
    });

    it('clearPreload should invoke clear_preload', async () => {
      await TauriAPI.clearPreload();
      expect(invoke).toHaveBeenCalledWith('clear_preload', {});
    });

    it('hasPreloaded should invoke has_preloaded', async () => {
      await TauriAPI.hasPreloaded();
      expect(invoke).toHaveBeenCalledWith('has_preloaded', {});
    });
  });

  // ---------------------------------------------------------------------------
  // Error Formatting
  // ---------------------------------------------------------------------------
  describe('Error formatting', () => {
    it('should convert Decode errors to user-friendly messages', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('Decode error: bad codec');
      await expect(TauriAPI.loadTrack('/bad.mp3')).rejects.toThrow(
        'Audio file is corrupted or in an unsupported format',
      );
    });

    it('should convert permission errors to user-friendly messages', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('Access denied to restricted folder');
      await expect(TauriAPI.scanFolder('/restricted')).rejects.toThrow(
        'Permission denied',
      );
    });

    it('should convert not-found errors to user-friendly messages', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('No such file or directory');
      await expect(TauriAPI.loadTrack('/missing.mp3')).rejects.toThrow(
        'File or folder not found',
      );
    });

    it('should pass through unknown errors with command name', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('Something weird happened');
      await expect(TauriAPI.play()).rejects.toThrow('play_audio failed');
    });
  });

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  describe('checkHealth', () => {
    it('should return healthy: true when isPlaying succeeds', async () => {
      const health = await TauriAPI.checkHealth();
      expect(health).toEqual({ healthy: true, error: null });
    });

    it('should return healthy: false when invoke throws', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('Audio system unresponsive');
      const health = await TauriAPI.checkHealth();
      expect(health.healthy).toBe(false);
      expect(health.error).toContain('failed');
    });
  });

  // ---------------------------------------------------------------------------
  // ReplayGain Commands
  // ---------------------------------------------------------------------------
  describe('ReplayGain Commands', () => {
    it('setReplayGain should invoke set_replaygain', async () => {
      await TauriAPI.setReplayGain(-3.5, 2.0);
      expect(invoke).toHaveBeenCalledWith('set_replaygain', { gainDb: -3.5, preampDb: 2.0 });
    });

    it('clearReplayGain should invoke clear_replaygain', async () => {
      await TauriAPI.clearReplayGain();
      expect(invoke).toHaveBeenCalledWith('clear_replaygain', {});
    });

    it('analyzeReplayGain should invoke analyze_replaygain', async () => {
      await TauriAPI.analyzeReplayGain('/music/song.mp3');
      expect(invoke).toHaveBeenCalledWith('analyze_replaygain', { trackPath: '/music/song.mp3' });
    });
  });

  // ---------------------------------------------------------------------------
  // Effects Commands
  // ---------------------------------------------------------------------------
  describe('Effects Commands', () => {
    it('setAudioEffects should invoke set_audio_effects', async () => {
      const config = { bands: [0, 1, 2] };
      await TauriAPI.setAudioEffects(config);
      expect(invoke).toHaveBeenCalledWith('set_audio_effects', { config });
    });

    it('setEffectsEnabled should invoke set_effects_enabled', async () => {
      await TauriAPI.setEffectsEnabled(true);
      expect(invoke).toHaveBeenCalledWith('set_effects_enabled', { enabled: true });
    });
  });

  // ---------------------------------------------------------------------------
  // Database & Performance Commands
  // ---------------------------------------------------------------------------
  describe('Database Commands', () => {
    it('vacuumDatabase should invoke vacuum_database', async () => {
      await TauriAPI.vacuumDatabase();
      expect(invoke).toHaveBeenCalledWith('vacuum_database', {});
    });

    it('getDatabaseSize should invoke get_database_size', async () => {
      await TauriAPI.getDatabaseSize();
      expect(invoke).toHaveBeenCalledWith('get_database_size', {});
    });

    it('getCacheSize should invoke get_cache_size', async () => {
      await TauriAPI.getCacheSize();
      expect(invoke).toHaveBeenCalledWith('get_cache_size', {});
    });

    it('clearAlbumArtCache should invoke clear_album_art_cache', async () => {
      await TauriAPI.clearAlbumArtCache();
      expect(invoke).toHaveBeenCalledWith('clear_album_art_cache', {});
    });
  });
});
