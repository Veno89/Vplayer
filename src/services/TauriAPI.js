import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';

/**
 * Centralized Tauri API service with error handling and logging
 */
class TauriAPIService {
  constructor() {
    this.debug = process.env.NODE_ENV === 'development';
  }

  /**
   * Log API calls in development mode
   */
  _log(method, params, result, error) {
    if (!this.debug) return;
    
    if (error) {
      console.error(`[TauriAPI] ${method} failed:`, { params, error });
    } else {
      console.log(`[TauriAPI] ${method}:`, { params, result });
    }
  }

  /**
   * Wrapper around invoke with error handling
   */
  async _invoke(command, params = {}) {
    try {
      const result = await invoke(command, params);
      this._log(command, params, result);
      return result;
    } catch (error) {
      this._log(command, params, null, error);
      throw this._formatError(command, error);
    }
  }

  /**
   * Format error messages for better user feedback
   */
  _formatError(command, error) {
    const errorStr = String(error);
    
    // Map common errors to user-friendly messages
    if (errorStr.includes('Decode error')) {
      return new Error(`Audio file is corrupted or in an unsupported format`);
    }
    if (errorStr.includes('permission denied') || errorStr.includes('Access denied')) {
      return new Error(`Permission denied. Check file/folder permissions.`);
    }
    if (errorStr.includes('not found') || errorStr.includes('No such file')) {
      return new Error(`File or folder not found.`);
    }
    
    return new Error(`${command} failed: ${errorStr}`);
  }

  // ========== Audio Player Commands ==========

  async loadTrack(path) {
    return this._invoke('load_track', { path });
  }

  async play() {
    return this._invoke('play_audio');
  }

  async pause() {
    return this._invoke('pause_audio');
  }

  async stop() {
    return this._invoke('stop_audio');
  }

  async setVolume(volume) {
    return this._invoke('set_volume', { volume });
  }

  async seekTo(position) {
    return this._invoke('seek_to', { position });
  }

  async getPosition() {
    return this._invoke('get_position');
  }

  async isPlaying() {
    return this._invoke('is_playing');
  }

  async isFinished() {
    return this._invoke('is_finished');
  }

  async getDuration() {
    return this._invoke('get_duration');
  }

  // ========== Library Commands ==========

  async scanFolder(folderPath) {
    return this._invoke('scan_folder', { folderPath });
  }

  async scanFolderIncremental(folderPath) {
    return this._invoke('scan_folder_incremental', { folderPath });
  }

  async getAllTracks() {
    return this._invoke('get_all_tracks');
  }

  async getAllFolders() {
    return this._invoke('get_all_folders');
  }

  async removeTrack(trackId) {
    return this._invoke('remove_track', { trackId });
  }

  async removeFolder(folderId, folderPath) {
    return this._invoke('remove_folder', { folderId, folderPath });
  }

  async updateTrackRating(trackId, rating) {
    return this._invoke('update_track_rating', { trackId, rating });
  }

  async incrementPlayCount(trackId) {
    return this._invoke('increment_play_count', { trackId });
  }

  async findDuplicates() {
    return this._invoke('find_duplicates');
  }

  // ========== Album Art Commands ==========

  async getAlbumArt(trackId) {
    return this._invoke('get_album_art', { trackId });
  }

  async extractAndCacheAlbumArt(trackId, trackPath) {
    return this._invoke('extract_and_cache_album_art', { trackId, trackPath });
  }

  // ========== Gapless Playback Commands ==========

  async preloadTrack(path) {
    return this._invoke('preload_track', { path });
  }

  async swapToPreloaded() {
    return this._invoke('swap_to_preloaded');
  }

  clearPreload() {
    return this._invoke('clear_preload');
  }

  async hasPreloaded() {
    return this._invoke('has_preloaded');
  }

  // ========== Audio Effects Commands ==========

  async setAudioEffects(config) {
    return this._invoke('set_audio_effects', { config });
  }

  async getAudioEffects() {
    return this._invoke('get_audio_effects');
  }

  async setEffectsEnabled(enabled) {
    return this._invoke('set_effects_enabled', { enabled });
  }

  async isEffectsEnabled() {
    return this._invoke('is_effects_enabled');
  }

  // ========== Visualizer Commands ==========

  async getVisualizerData() {
    return this._invoke('get_visualizer_data');
  }

  async setVisualizerMode(mode) {
    return this._invoke('set_visualizer_mode', { mode });
  }

  async setBeatSensitivity(sensitivity) {
    return this._invoke('set_beat_sensitivity', { sensitivity });
  }

  // ========== Tag Editor Commands ==========

  async updateTrackTags(trackId, trackPath, tags) {
    return this._invoke('update_track_tags', { trackId, trackPath, tags });
  }

  // ========== Playlist Import/Export Commands ==========

  async exportPlaylist(playlistId, outputPath) {
    return this._invoke('export_playlist', { playlistId, outputPath });
  }

  async importPlaylist(playlistName, inputPath) {
    return this._invoke('import_playlist', { playlistName, inputPath });
  }

  // ========== Playlist Commands ==========

  async getAllPlaylists() {
    return this._invoke('get_all_playlists');
  }

  async getPlaylistTracks(playlistId) {
    return this._invoke('get_playlist_tracks', { playlistId });
  }

  async createPlaylist(name) {
    return this._invoke('create_playlist', { name });
  }

  async deletePlaylist(playlistId) {
    return this._invoke('delete_playlist', { playlistId });
  }

  async renamePlaylist(playlistId, newName) {
    return this._invoke('rename_playlist', { playlistId, newName });
  }

  async addTrackToPlaylist(playlistId, trackId) {
    return this._invoke('add_track_to_playlist', { playlistId, trackId });
  }

  async removeTrackFromPlaylist(playlistId, trackId) {
    return this._invoke('remove_track_from_playlist', { playlistId, trackId });
  }

  async reorderPlaylistTracks(playlistId, trackPositions) {
    return this._invoke('reorder_playlist_tracks', { playlistId, trackPositions });
  }

  // ========== Dialog Commands ==========

  async selectFolder(options = {}) {
    try {
      const result = await open({
        directory: true,
        multiple: false,
        title: 'Select Music Folder',
        ...options,
      });
      this._log('selectFolder', options, result);
      return result;
    } catch (error) {
      this._log('selectFolder', options, null, error);
      throw this._formatError('selectFolder', error);
    }
  }

  // ========== Event Listeners ==========

  async onEvent(eventName, callback) {
    try {
      const unlisten = await listen(eventName, callback);
      this._log(`listen:${eventName}`, {}, 'Listener registered');
      return unlisten;
    } catch (error) {
      this._log(`listen:${eventName}`, {}, null, error);
      throw this._formatError(`listen:${eventName}`, error);
    }
  }

  // ========== Health Check ==========

  async checkHealth() {
    try {
      await this.isPlaying();
      return { healthy: true, error: null };
    } catch (error) {
      return { 
        healthy: false, 
        error: this._formatError('health_check', error).message 
      };
    }
  }
}

// Export singleton instance
export const TauriAPI = new TauriAPIService();
