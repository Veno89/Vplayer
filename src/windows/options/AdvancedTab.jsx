import React, { useState, useEffect } from 'react';
import { Database, Trash2, RotateCw, Download, Upload, Bug, HardDrive, FileJson, AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { useStore } from '../../store/useStore';
import { SettingCard, SettingButton, SettingInfo, SettingToggle, SettingDivider } from './SettingsComponents';

export function AdvancedTab({ debugVisible, setDebugVisible }) {
  const [cacheSize, setCacheSize] = useState(0);
  const [dbSize, setDbSize] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [appVersion, setAppVersion] = useState('0.6.3');

  useEffect(() => {
    loadStats();
    // Get actual version from Tauri
    getVersion().then(v => setAppVersion(v)).catch(() => {});
  }, []);

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const [cache, db] = await Promise.all([
        invoke('get_cache_size').catch(() => 0),
        invoke('get_database_size').catch(() => 0)
      ]);
      setCacheSize(cache || 0);
      setDbSize(db || 0);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const handleClearCache = async () => {
    if (!confirm('Clear all cached album art? This will remove cached images but not affect your music files.')) return;
    try {
      setClearing(true);
      await invoke('clear_album_art_cache');
      await loadStats();
      alert('Cache cleared successfully!');
    } catch (err) {
      alert(`Failed to clear cache: ${err}`);
    } finally {
      setClearing(false);
    }
  };

  const handleOptimizeDb = async () => {
    if (!confirm('Optimize the database? This may take a moment for large libraries.')) return;
    try {
      setOptimizing(true);
      await invoke('vacuum_database');
      await loadStats();
      alert('Database optimized successfully!');
    } catch (err) {
      alert(`Failed to optimize database: ${err}`);
    } finally {
      setOptimizing(false);
    }
  };

  const handleExportSettings = async () => {
    try {
      setExporting(true);

      // Get all settings from store
      const state = useStore.getState();
      const settings = {
        version: appVersion,
        exportedAt: new Date().toISOString(),
        settings: {
          colorScheme: state.colorScheme,
          backgroundBlur: state.backgroundBlur,
          backgroundOpacity: state.backgroundOpacity,
          windowOpacity: state.windowOpacity,
          fontSize: state.fontSize,
          gaplessPlayback: state.gaplessPlayback,
          autoPlayOnStartup: state.autoPlayOnStartup,
          resumeLastTrack: state.resumeLastTrack,
          skipSilence: state.skipSilence,
          replayGainMode: state.replayGainMode,
          replayGainPreamp: state.replayGainPreamp,
          playbackSpeed: state.playbackSpeed,
          fadeOnPause: state.fadeOnPause,
          fadeDuration: state.fadeDuration,
          defaultVolume: state.defaultVolume,
          autoScanOnStartup: state.autoScanOnStartup,
          watchFolderChanges: state.watchFolderChanges,
          duplicateSensitivity: state.duplicateSensitivity,
          showHiddenFiles: state.showHiddenFiles,
          metadataLanguage: state.metadataLanguage,
          albumArtSize: state.albumArtSize,
          autoFetchAlbumArt: state.autoFetchAlbumArt,
          minimizeToTray: state.minimizeToTray,
          closeToTray: state.closeToTray,
          startMinimized: state.startMinimized,
          rememberWindowPositions: state.rememberWindowPositions,
          confirmBeforeDelete: state.confirmBeforeDelete,
          showNotifications: state.showNotifications,
          snapToGrid: state.snapToGrid,
          gridSize: state.gridSize,
          cacheSizeLimit: state.cacheSizeLimit,
          maxConcurrentScans: state.maxConcurrentScans,
          thumbnailQuality: state.thumbnailQuality,
          hardwareAcceleration: state.hardwareAcceleration,
          audioBufferSize: state.audioBufferSize,
        }
      };

      // Create a download using Blob and link
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'vplayer-settings.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert('Settings exported successfully!');
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Failed to export settings: ${err}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImportSettings = async () => {
    try {
      setImporting(true);
      
      // Create a file input element and trigger click
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) {
          setImporting(false);
          return;
        }
        
        try {
          const contents = await file.text();
          const imported = JSON.parse(contents);
          
          if (!imported.settings) {
            throw new Error('Invalid settings file format');
          }

          // Apply settings to store
          const store = useStore.getState();
          Object.entries(imported.settings).forEach(([key, value]) => {
            const setter = store[`set${key.charAt(0).toUpperCase() + key.slice(1)}`];
            if (setter && value !== undefined) {
              setter(value);
            }
          });

          alert('Settings imported successfully! Some changes may require a restart.');
        } catch (err) {
          console.error('Import failed:', err);
          alert(`Failed to import settings: ${err}`);
        } finally {
          setImporting(false);
        }
      };
      
      input.oncancel = () => setImporting(false);
      input.click();
    } catch (err) {
      console.error('Import failed:', err);
      alert(`Failed to import settings: ${err}`);
      setImporting(false);
    }
  };

  const handleResetSettings = async () => {
    if (!confirm('Reset ALL settings to defaults? This cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? All your preferences will be lost.')) return;
    
    try {
      setResetting(true);
      localStorage.removeItem('vplayer-storage');
      alert('Settings reset! The app will now reload.');
      window.location.reload();
    } catch (err) {
      alert(`Failed to reset settings: ${err}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Storage Info */}
      <SettingCard title="Storage" icon={HardDrive} accent="cyan">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <Database className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">Library Database</p>
                <p className="text-slate-500 text-xs">Track metadata and playlists</p>
              </div>
            </div>
            <span className="text-cyan-400 font-mono text-sm">
              {loadingStats ? <Loader className="w-4 h-4 animate-spin" /> : formatBytes(dbSize)}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">Album Art Cache</p>
                <p className="text-slate-500 text-xs">Cached cover images</p>
              </div>
            </div>
            <span className="text-amber-400 font-mono text-sm">
              {loadingStats ? <Loader className="w-4 h-4 animate-spin" /> : formatBytes(cacheSize)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <SettingButton
            label="Clear Cache"
            onClick={handleClearCache}
            icon={Trash2}
            variant="warning"
            loading={clearing}
          />
          <SettingButton
            label="Optimize DB"
            onClick={handleOptimizeDb}
            icon={RotateCw}
            variant="primary"
            loading={optimizing}
          />
        </div>
      </SettingCard>

      {/* Import/Export */}
      <SettingCard title="Settings Backup" icon={FileJson} accent="emerald">
        <p className="text-xs text-slate-500 mb-4">
          Export your settings to a file or import from a previous backup
        </p>

        <div className="grid grid-cols-2 gap-2">
          <SettingButton
            label="Export Settings"
            onClick={handleExportSettings}
            icon={Download}
            variant="success"
            loading={exporting}
          />
          <SettingButton
            label="Import Settings"
            onClick={handleImportSettings}
            icon={Upload}
            variant="default"
            loading={importing}
          />
        </div>
      </SettingCard>

      {/* Debug */}
      <SettingCard title="Developer" icon={Bug} accent="violet">
        <SettingToggle
          label="Show Debug Panel"
          description="Display technical information and performance metrics"
          checked={debugVisible}
          onChange={setDebugVisible}
          icon={Bug}
        />
      </SettingCard>

      {/* Danger Zone */}
      <SettingCard title="Danger Zone" icon={AlertTriangle} accent="red">
        <div className="p-4 rounded-xl border-2 border-dashed border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-white text-sm font-medium">Reset All Settings</p>
              <p className="text-slate-500 text-xs mt-1">
                This will reset all preferences to their default values. Your music library and playlists will not be affected.
              </p>
              <button
                onClick={handleResetSettings}
                onMouseDown={e => e.stopPropagation()}
                disabled={resetting}
                className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50"
              >
                {resetting ? 'Resetting...' : 'Reset to Defaults'}
              </button>
            </div>
          </div>
        </div>
      </SettingCard>
    </div>
  );
}
