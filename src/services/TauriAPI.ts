import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Track, Playlist, PlaylistTrack, TrackFilter } from '../types';

// ========== API-specific types ==========

/** Matches Rust EffectsConfig struct */
export interface AudioEffectsConfig {
    pitch_shift: number;
    tempo: number;
    reverb_mix: number;
    reverb_room_size: number;
    bass_boost: number;
    echo_delay: number;
    echo_feedback: number;
    echo_mix: number;
    eq_bands: number[];
}

/** Matches Rust TagUpdate struct */
export interface TagUpdate {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    genre?: string;
    comment?: string;
    track_number?: string;
    disc_number?: string;
}

/** Returned by get_performance_stats */
export interface PerformanceStats {
    database: {
        tracks: number;
        playlists: number;
        smartPlaylists: number;
        sizeBytes: number;
        indexes: number;
    };
    query: {
        sampleTimeMs: number;
    };
    memory: {
        estimatedUsage: number;
    };
}

/** Returned by check_missing_files — (trackId, path) tuples */
export type MissingFile = [string, string];

/** Options accepted by the file-open dialog */
export interface SelectFolderOptions {
    title?: string;
    defaultPath?: string;
}

/**
 * Centralized Tauri API service with error handling and logging
 */
class TauriAPIService {
    private debug: boolean;

    constructor() {
        this.debug = process.env.NODE_ENV === 'development';
    }

    /**
     * Log API calls in development mode
     */
    private _log(method: string, params: Record<string, unknown>, result: unknown, error?: unknown) {
        if (!this.debug) return;

        // Filter out noisy logs
        if (method === 'get_visualizer_data' || method === 'get_position' || method === 'get_duration') return;

        if (error) {
            console.error(`[TauriAPI] ${method} failed:`, { params, error });
        } else {
            console.log(`[TauriAPI] ${method}:`, { params, result });
        }
    }

    /**
     * Wrapper around invoke with error handling
     */
    private async _invoke<T>(command: string, params: Record<string, unknown> = {}): Promise<T> {
        try {
            const result = await invoke<T>(command, params);
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
    private _formatError(command: string, error: unknown): Error {
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

    async loadTrack(path: string): Promise<void> {
        return this._invoke('load_track', { path });
    }

    async play(): Promise<void> {
        return this._invoke('play_audio');
    }

    async pause(): Promise<void> {
        return this._invoke('pause_audio');
    }

    async stop(): Promise<void> {
        return this._invoke('stop_audio');
    }

    async setVolume(volume: number): Promise<void> {
        return this._invoke('set_volume', { volume });
    }

    async seekTo(position: number): Promise<void> {
        return this._invoke('seek_to', { position });
    }

    async getPosition(): Promise<number> {
        return this._invoke('get_position');
    }

    async isPlaying(): Promise<boolean> {
        return this._invoke('is_playing');
    }

    async isFinished(): Promise<boolean> {
        return this._invoke('is_finished');
    }

    async getDuration(): Promise<number> {
        return this._invoke('get_duration');
    }

    // ========== Balance/Pan Commands ==========

    /**
     * Set stereo balance/pan
     * @param {number} balance - Balance value from -1.0 (left) to 1.0 (right), 0.0 is center
     */
    async setBalance(balance: number): Promise<void> {
        return this._invoke('set_balance', { balance });
    }

    /**
     * Get current stereo balance
     * @returns {Promise<number>} Current balance value (-1.0 to 1.0)
     */
    async getBalance(): Promise<number> {
        return this._invoke('get_balance');
    }

    // ========== ReplayGain Commands ==========

    /**
     * Analyze a track for ReplayGain data (LUFS loudness measurement)
     * @param {string} trackPath - Path to the audio file
     */
    async analyzeReplayGain(trackPath: string): Promise<{ track_gain: number, track_peak: number, loudness: number }> {
        return this._invoke('analyze_replaygain', { trackPath });
    }

    /**
     * Get stored ReplayGain data for a track
     * @param {string} trackPath - Path to the audio file
     */
    async getTrackReplayGain(trackPath: string): Promise<{ track_gain: number, track_peak: number, loudness: number } | null> {
        return this._invoke('get_track_replaygain', { trackPath });
    }

    /**
     * Set ReplayGain adjustment for current playback
     * @param {number} gainDb - ReplayGain value in dB
     * @param {number} preampDb - Additional preamp adjustment in dB
     */
    async setReplayGain(gainDb: number, preampDb: number): Promise<void> {
        return this._invoke('set_replaygain', { gainDb, preampDb });
    }

    /**
     * Clear ReplayGain adjustment (reset to unity gain)
     */
    async clearReplayGain(): Promise<void> {
        return this._invoke('clear_replaygain');
    }

    // ========== Library Commands ==========

    async scanFolder(folderPath: string): Promise<Track[]> {
        return this._invoke('scan_folder', { folderPath });
    }

    async scanFolderIncremental(folderPath: string): Promise<Track[]> {
        return this._invoke('scan_folder_incremental', { folderPath });
    }

    async getAllTracks(): Promise<Track[]> {
        return this._invoke('get_all_tracks');
    }

    async getFilteredTracks(filter: TrackFilter): Promise<Track[]> {
        return this._invoke('get_filtered_tracks', { filter });
    }

    async getAllFolders(): Promise<[string, string, string, number][]> {
        return this._invoke('get_all_folders');
    }

    async removeTrack(trackId: string): Promise<void> {
        return this._invoke('remove_track', { trackId });
    }

    async removeFolder(folderId: string, folderPath: string): Promise<void> {
        return this._invoke('remove_folder', { folderId, folderPath });
    }

    async updateTrackRating(trackId: string, rating: number): Promise<void> {
        return this._invoke('update_track_rating', { trackId, rating });
    }

    async incrementPlayCount(trackId: string): Promise<void> {
        return this._invoke('increment_play_count', { trackId });
    }

    async findDuplicates(sensitivity?: string): Promise<Track[][]> {
        return this._invoke('find_duplicates', { sensitivity: sensitivity ?? null });
    }

    async removeDuplicateFolders(): Promise<void> {
        return this._invoke('remove_duplicate_folders');
    }

    /**
     * Show a file in the system file explorer
     * @param {string} path - Full path to the file
     */
    async showInFolder(path: string): Promise<void> {
        return this._invoke('show_in_folder', { path });
    }

    /**
     * Reset play count for a track
     * @param {string} trackId - Track ID
     */
    async resetPlayCount(trackId: string): Promise<void> {
        return this._invoke('reset_play_count', { trackId });
    }

    // ========== Album Art Commands ==========

    async getAlbumArt(trackId: string): Promise<string | null> {
        return this._invoke('get_album_art', { trackId });
    }

    async extractAndCacheAlbumArt(trackId: string, trackPath: string): Promise<string | null> {
        return this._invoke('extract_and_cache_album_art', { trackId, trackPath });
    }

    // ========== Gapless Playback Commands ==========

    async preloadTrack(path: string): Promise<void> {
        return this._invoke('preload_track', { path });
    }

    async swapToPreloaded(): Promise<void> {
        return this._invoke('swap_to_preloaded');
    }

    async clearPreload(): Promise<void> {
        return this._invoke('clear_preload');
    }

    async hasPreloaded(): Promise<boolean> {
        return this._invoke('has_preloaded');
    }

    // ========== Audio Effects Commands ==========

    async setAudioEffects(config: AudioEffectsConfig): Promise<void> {
        return this._invoke('set_audio_effects', { config });
    }

    async getAudioEffects(): Promise<AudioEffectsConfig> {
        return this._invoke('get_audio_effects');
    }

    async setEffectsEnabled(enabled: boolean): Promise<void> {
        return this._invoke('set_effects_enabled', { enabled });
    }

    async isEffectsEnabled(): Promise<boolean> {
        return this._invoke('is_effects_enabled');
    }

    // ========== Visualizer Commands ==========

    async getVisualizerData(): Promise<number[]> {
        return this._invoke('get_visualizer_data');
    }

    async setVisualizerMode(mode: string): Promise<void> {
        return this._invoke('set_visualizer_mode', { mode });
    }

    async setBeatSensitivity(sensitivity: number): Promise<void> {
        return this._invoke('set_beat_sensitivity', { sensitivity });
    }

    // ========== Tag Editor Commands ==========

    async updateTrackTags(trackId: string, trackPath: string, tags: TagUpdate): Promise<void> {
        return this._invoke('update_track_tags', { trackId, trackPath, tags });
    }

    // ========== Playlist Import/Export Commands ==========

    async exportPlaylist(playlistId: string, outputPath: string): Promise<void> {
        return this._invoke('export_playlist', { playlistId, outputPath });
    }

    async importPlaylist(playlistName: string, inputPath: string): Promise<void> {
        return this._invoke('import_playlist', { playlistName, inputPath });
    }

    // ========== Playlist Commands ==========

    async getAllPlaylists(): Promise<Playlist[]> {
        return this._invoke('get_all_playlists');
    }

    async getPlaylistTracks(playlistId: string): Promise<Track[]> {
        return this._invoke('get_playlist_tracks', { playlistId });
    }

    async createPlaylist(name: string): Promise<Playlist> {
        return this._invoke('create_playlist', { name });
    }

    async deletePlaylist(playlistId: string): Promise<void> {
        return this._invoke('delete_playlist', { playlistId });
    }

    async renamePlaylist(playlistId: string, newName: string): Promise<Playlist> {
        return this._invoke('rename_playlist', { playlistId, newName });
    }

    async addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
        return this._invoke('add_track_to_playlist', { playlistId, trackId });
    }

    /**
     * Batch add multiple tracks to a playlist (single transaction)
     * Much more efficient than calling addTrackToPlaylist multiple times
     */
    async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
        return this._invoke('add_tracks_to_playlist', { playlistId, trackIds });
    }

    async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
        return this._invoke('remove_track_from_playlist', { playlistId, trackId });
    }

    async reorderPlaylistTracks(playlistId: string, trackPositions: [string, number][]): Promise<void> {
        return this._invoke('reorder_playlist_tracks', { playlistId, trackPositions });
    }

    // ========== Dialog Commands ==========

    async selectFolder(options: SelectFolderOptions = {}): Promise<string | null> {
        try {
            const result = await open({
                directory: true,
                multiple: false,
                title: 'Select Music Folder',
                ...options,
            });
            this._log('selectFolder', options as unknown as Record<string, unknown>, result);
            return result as string | null;
        } catch (error) {
            this._log('selectFolder', options as unknown as Record<string, unknown>, null, error);
            throw this._formatError('selectFolder', error);
        }
    }

    // ========== Event Listeners ==========

    async onEvent<T>(eventName: string, callback: (event: { payload: T, [key: string]: any }) => void): Promise<UnlistenFn> {
        try {
            const unlisten = await listen(eventName, callback);
            this._log(`listen:${eventName}`, {}, 'Listener registered');
            return unlisten;
        } catch (error) {
            this._log(`listen:${eventName}`, {}, null, error);
            throw this._formatError(`listen:${eventName}`, error);
        }
    }

    // ========== Audio Recovery & Device Commands ==========

    async recoverAudio(): Promise<boolean> {
        return this._invoke('recover_audio');
    }

    async isAudioDeviceAvailable(): Promise<boolean> {
        return this._invoke('is_audio_device_available');
    }

    async hasAudioDeviceChanged(): Promise<boolean> {
        return this._invoke('has_audio_device_changed');
    }

    async getInactiveDuration(): Promise<number> {
        return this._invoke('get_inactive_duration');
    }

    async getAudioDevices(): Promise<string[]> {
        return this._invoke('get_audio_devices');
    }

    async setAudioDevice(deviceName: string): Promise<void> {
        return this._invoke('set_audio_device', { deviceName });
    }

    // ========== Track Rating (set_track_rating command) ==========

    async setTrackRating(trackId: string, rating: number): Promise<void> {
        return this._invoke('set_track_rating', { trackId, rating });
    }

    // ========== Folder Watch Commands ==========

    async startFolderWatch(folderPath: string): Promise<void> {
        return this._invoke('start_folder_watch', { folderPath });
    }

    async stopFolderWatch(folderPath: string): Promise<void> {
        return this._invoke('stop_folder_watch', { folderPath });
    }

    // ========== History Commands ==========

    async getRecentlyPlayed(limit: number = 50): Promise<Track[]> {
        return this._invoke('get_recently_played', { limit });
    }

    async getMostPlayed(limit: number = 50): Promise<Track[]> {
        return this._invoke('get_most_played', { limit });
    }

    // ========== Lyrics Commands ==========

    async loadLyrics(trackPath: string): Promise<string | null> {
        return this._invoke('load_lyrics', { trackPath });
    }

    // ========== File System Commands ==========

    async writeTextFile(filePath: string, content: string): Promise<void> {
        return this._invoke('write_text_file', { filePath, content });
    }

    async checkMissingFiles(): Promise<MissingFile[]> {
        return this._invoke('check_missing_files');
    }

    // ========== Database & Performance Commands ==========

    async getPerformanceStats(): Promise<PerformanceStats> {
        return this._invoke('get_performance_stats');
    }

    async getCacheSize(): Promise<number> {
        return this._invoke('get_cache_size');
    }

    async getDatabaseSize(): Promise<number> {
        return this._invoke('get_database_size');
    }

    async vacuumDatabase(): Promise<void> {
        return this._invoke('vacuum_database');
    }

    async clearAlbumArtCache(): Promise<void> {
        return this._invoke('clear_album_art_cache');
    }

    // ========== Tray Settings Commands ==========

    async setTraySettings(closeToTray: boolean, minimizeToTray: boolean, startMinimized: boolean): Promise<void> {
        return this._invoke('set_tray_settings', { closeToTray, minimizeToTray, startMinimized });
    }

    async getTraySettings(): Promise<{ closeToTray: boolean; minimizeToTray: boolean; startMinimized: boolean }> {
        return this._invoke('get_tray_settings');
    }

    // ========== Cache Limit Commands ==========

    async enforceCacheLimit(limitMb: number): Promise<number> {
        return this._invoke('enforce_cache_limit', { limitMb });
    }

    // ========== Health Check ==========

    async checkHealth(): Promise<{ healthy: boolean, error: string | null }> {
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
