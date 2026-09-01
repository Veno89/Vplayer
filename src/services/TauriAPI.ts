import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Track, Playlist, PlaylistTrack, TrackFilter } from '../types';
import { DEFAULT_EFFECT_ORDER, type EffectId } from '../types/audioEffects';

// ========== API-specific types ==========

/** Matches Rust EffectsConfig struct */
export type { EffectId };
export { DEFAULT_EFFECT_ORDER };

export interface AudioEffectsConfig {
    tempo: number;
    reverb_mix: number;
    reverb_room_size: number;
    bass_boost: number;
    echo_delay: number;
    echo_feedback: number;
    echo_mix: number;
    eq_bands: number[];
    /** Processing chain order. Soft clipper always runs last. */
    effect_order?: EffectId[];
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
        smart_playlists: number;
        size_bytes: number;
        size_mb: number;
        indexes: number;
    };
    performance: {
        query_time_ms: number;
    };
    recommendations: {
        vacuum_recommended: boolean;
        optimize_queries: boolean;
    };
}

export interface RuntimeDiagnostics {
    pid: number;
    uptime_ms: number;
    audio: {
        device_available: boolean;
        playing: boolean;
        inactive_duration_sec: number;
        needs_reinit: boolean;
        is_reinitializing: boolean;
    };
    scanning: {
        active_count: number;
        cancelling_count: number;
    };
    timestamp_ms: number;
}

export interface VisualizerData {
    spectrum: number[];
    waveform: number[];
    beat_detected: boolean;
    peak_frequency: number;
    rms_level: number;
}

/** Returned by check_missing_files — (trackId, path) tuples */
export type MissingFile = [string, string];

/** Options accepted by the file-open dialog */
export interface SelectFolderOptions {
    title?: string;
    defaultPath?: string;
}

/** Returned by get_tracks_page for large-library loading */
export interface TracksPageResponse {
    tracks: Track[];
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
}

/** Matches the parsed Rust Lrc response. */
export interface LyricsData {
    metadata: {
        title?: string;
        artist?: string;
        album?: string;
        by?: string;
        offset: number;
    };
    lines: Array<{ timestamp: number; text: string }>;
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
     * Helper to wrap a promise with a timeout
     */
    private _withTimeout<T>(promise: Promise<T>, ms: number, command: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = window.setTimeout(
                () => reject(new Error(`Command '${command}' timed out after ${ms}ms`)),
                ms,
            );
            promise.then(
                value => {
                    window.clearTimeout(timer);
                    resolve(value);
                },
                error => {
                    window.clearTimeout(timer);
                    reject(error);
                },
            );
        });
    }

    /**
     * Wrapper around invoke with error handling and timeouts
     */
    private async _invoke<T>(command: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
        // Default timeouts based on command type
        let effectiveTimeout = timeoutMs || 10000; // Default 10s
        
        if (!timeoutMs) {
            // Long-running commands
            if (command.includes('scan') || command.includes('get_tracks_page') || command.includes('find_duplicates') || command.includes('vacuum') || command.includes('analyze')) {
                effectiveTimeout = 60000; // 60s for scans and heavy DB operations
            } else if (command.includes('get_album_art')) {
                effectiveTimeout = 15000; // 15s for image loading
            } else if (command.includes('export_playlist') || command.includes('import_playlist')) {
                effectiveTimeout = 30000; // 30s for playlist IO
            } else if (command.includes('play') || command.includes('pause') || command.includes('stop') || command.includes('seek')) {
                effectiveTimeout = 5000; // 5s for playback commands
            }
        }

        try {
            const invokePromise = invoke<T>(command, params);
            const result = await this._withTimeout(invokePromise, effectiveTimeout, command);
            this._log(command, params, result);
            return result;
        } catch (error) {
            this._log(command, params, null, error);
            
            // Auto-cancel scans if they time out on the frontend
            if (command.includes('scan') && String(error).includes('timed out')) {
                console.warn(`[TauriAPI] Scan command '${command}' timed out. Issuing backend cancellation.`);
                const scanId = params && 'scanId' in params ? params.scanId : undefined;
                // Fire and forget cancellation
                invoke('cancel_scan', scanId ? { scanId } : undefined).catch(err => console.error("Failed to auto-cancel scan:", err));
            }
            
            throw this._formatError(command, error);
        }
    }

    /**
     * Format error messages for better user feedback
     */
    private _formatError(command: string, error: unknown): Error {
        const errorStr = String(error);

        if (errorStr.includes('timed out')) {
            return new Error(command.includes('scan')
                ? 'Operation timed out. Backend cancellation was requested.'
                : 'Operation timed out. The backend may still be finishing the request.');
        }

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

    async loadTrack(trackId: string, path: string, requestId: number): Promise<void> {
        return this._invoke('load_track', { trackId, path, requestId });
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

    // Backward-compatible alias used by tests/legacy code.
    async getPosition(): Promise<number> {
        return this._invoke('get_position');
    }

    async isPlaying(): Promise<boolean> {
        return this._invoke('is_playing');
    }

    // Backward-compatible alias used by tests/legacy code.
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
    async analyzeReplayGain(trackId: string, trackPath: string): Promise<{ track_gain: number, track_peak: number, loudness: number }> {
        return this._invoke('analyze_replaygain', { trackId, trackPath });
    }

    /**
     * Get stored ReplayGain data for a track
     * @param {string} trackPath - Path to the audio file
     */
    async getTrackReplayGain(trackId: string, trackPath: string): Promise<{ track_gain: number, track_peak: number, loudness: number } | null> {
        return this._invoke('get_track_replaygain', { trackId, trackPath });
    }

    async getAlbumReplayGain(artist: string, album: string): Promise<{
        album_gain: number;
        album_peak: number;
        loudness: number;
        track_count: number;
    } | null> {
        return this._invoke('get_album_replaygain', { artist, album });
    }

    async analyzeAlbumReplayGain(artist: string, album: string): Promise<{
        album_gain: number;
        album_peak: number;
        loudness: number;
        track_count: number;
    } | null> {
        return this._invoke('analyze_album_replaygain', { artist, album });
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

    async scanFolder(folderPath: string, scanId?: string): Promise<Track[]> {
        return this._invoke('scan_folder', { folderPath, scanId: scanId || Date.now().toString() });
    }

    async scanFolderIncremental(folderPath: string, scanId?: string): Promise<Track[]> {
        return this._invoke('scan_folder_incremental', { folderPath, scanId: scanId || Date.now().toString() });
    }

    async cancelScan(scanId: string): Promise<void> {
        return this._invoke('cancel_scan', { scanId });
    }

    /** Return all track IDs whose file path starts with `folderPath`. */
    async getTrackIdsForFolder(folderPath: string): Promise<string[]> {
        return this._invoke('get_track_ids_for_folder', { folderPath });
    }

    async getAllTracks(): Promise<Track[]> {
        return this._invoke('get_all_tracks');
    }

    async getFilteredTracks(filter: TrackFilter): Promise<Track[]> {
        return this._invoke('get_filtered_tracks', { filter });
    }

    async getTracksPage(offset: number, limit: number, filter?: TrackFilter | null): Promise<TracksPageResponse> {
        return this._invoke('get_tracks_page', {
            offset,
            limit,
            filter: filter ?? null,
        });
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
    async showInFolder(trackId: string, path: string): Promise<void> {
        return this._invoke('show_in_folder', { trackId, path });
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

    async getAlbumArtBatch(trackIds: string[]): Promise<Record<string, string | null>> {
        const items = await this._invoke<Array<[string, string | null]>>('get_album_art_batch', { trackIds });
        const byId: Record<string, string | null> = {};
        for (const [trackId, art] of items) {
            byId[trackId] = art;
        }
        return byId;
    }

    async extractAndCacheAlbumArt(trackId: string, trackPath: string): Promise<string | null> {
        return this._invoke('extract_and_cache_album_art', { trackId, trackPath });
    }

    // ========== Gapless Playback Commands ==========

    async preloadTrack(trackId: string, path: string): Promise<void> {
        return this._invoke('preload_track', { trackId, path });
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

    async getPreloadedPath(): Promise<string | null> {
        return this._invoke('get_preloaded_path');
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

    async getVisualizerData(): Promise<VisualizerData> {
        return this._invoke('get_visualizer_data');
    }

    async setVisualizerActive(active: boolean): Promise<void> {
        return this._invoke('set_visualizer_active', { active });
    }

    async setVisualizerMode(mode: string): Promise<void> {
        return this._invoke('set_visualizer_mode', { mode });
    }

    async setBeatSensitivity(sensitivity: number): Promise<void> {
        return this._invoke('set_beat_sensitivity', { sensitivity });
    }

    async getTrackWaveform(trackId: string, path: string, numBars?: number): Promise<number[]> {
        return this._invoke('get_track_waveform', { trackId, path, numBars: numBars ?? 200 });
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

    async getPlaylistTracks(playlistId: string, offset?: number, limit?: number): Promise<Track[]> {
        return this._invoke('get_playlist_tracks', { playlistId, offset, limit });
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

    /** Fetch all audio health info in a single IPC round-trip. */
    async getAudioHealth(): Promise<{
        healthy: boolean;
        needs_reinit: boolean;
        inactive_duration: number;
        device_changed: boolean;
        device_available: boolean;
    }> {
        return this._invoke('get_audio_health');
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

    // Backward-compatible alias used by tests/legacy code.
    async updateTrackRating(trackId: string, rating: number): Promise<void> {
        return this.setTrackRating(trackId, rating);
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

    async loadLyrics(trackId: string, trackPath: string): Promise<LyricsData> {
        return this._invoke('load_lyrics', { trackId, trackPath });
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

    async getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
        return this._invoke('get_runtime_diagnostics');
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
