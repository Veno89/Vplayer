import React, { useState, useEffect } from 'react';
import { Zap, HardDrive, Cpu, Image, Activity, Gauge } from 'lucide-react';
import { TauriAPI } from '../../services/TauriAPI';
import { useStore } from '../../store/useStore';
import { SettingToggle, SettingSlider, SettingSelect, SettingCard, SettingInfo, SettingDivider } from './SettingsComponents';

export function PerformanceTab() {
  const [memoryUsage, setMemoryUsage] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Get settings from store
  const cacheSizeLimit = useStore(state => state.cacheSizeLimit);
  const setCacheSizeLimit = useStore(state => state.setCacheSizeLimit);
  const maxConcurrentScans = useStore(state => state.maxConcurrentScans);
  const setMaxConcurrentScans = useStore(state => state.setMaxConcurrentScans);
  const thumbnailQuality = useStore(state => state.thumbnailQuality);
  const setThumbnailQuality = useStore(state => state.setThumbnailQuality);
  
  // New settings
  const hardwareAcceleration = useStore(state => state.hardwareAcceleration);
  const setHardwareAcceleration = useStore(state => state.setHardwareAcceleration);
  const audioBufferSize = useStore(state => state.audioBufferSize);
  const setAudioBufferSize = useStore(state => state.setAudioBufferSize);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      // Use get_performance_stats which returns various metrics
      const stats = await TauriAPI.getPerformanceStats().catch(() => ({}));
      // Also get cache size separately
      const cacheUsed = await TauriAPI.getCacheSize().catch(() => 0);
      setMemoryUsage({ 
        cache_used: cacheUsed,
        memory_used: stats?.memory_mb ? stats.memory_mb * 1024 * 1024 : 0,
        ...stats 
      });
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
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Calculate cache usage percentage for visual
  const cachePercentage = Math.min(100, (memoryUsage?.cache_used || 0) / (cacheSizeLimit * 1024 * 1024) * 100);

  return (
    <div className="space-y-6">
      {/* Resource Monitor */}
      <SettingCard title="Resource Monitor" icon={Activity} accent="cyan">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-400 text-xs">Cache Usage</span>
            </div>
            <p className="text-white text-lg font-bold">
              {loadingStats ? '...' : formatBytes(memoryUsage?.cache_used || 0)}
            </p>
            <p className="text-slate-500 text-xs">of {cacheSizeLimit} MB limit</p>
            
            {/* Progress bar */}
            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                style={{ width: `${cachePercentage}%` }}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400 text-xs">Memory</span>
            </div>
            <p className="text-white text-lg font-bold">
              {loadingStats ? '...' : formatBytes(memoryUsage?.memory_used || 0)}
            </p>
            <p className="text-slate-500 text-xs">process memory</p>
          </div>
        </div>

        <button
          onClick={loadStats}
          onMouseDown={e => e.stopPropagation()}
          disabled={loadingStats}
          className="mt-3 w-full px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-50"
        >
          {loadingStats ? 'Refreshing...' : 'Refresh Stats'}
        </button>
      </SettingCard>

      {/* Cache Settings */}
      <SettingCard title="Cache" icon={HardDrive} accent="amber">
        <SettingSlider
          label="Cache Size Limit"
          description="Maximum disk space for caching album art and metadata"
          value={cacheSizeLimit}
          onChange={setCacheSizeLimit}
          min={100}
          max={2000}
          step={100}
          formatValue={v => v >= 1000 ? `${(v/1000).toFixed(1)} GB` : `${v} MB`}
          minLabel="100 MB"
          maxLabel="2 GB"
          accentColor="amber"
        />

        <SettingSelect
          label="Thumbnail Quality"
          description="Resolution and compression level for cached album art"
          value={thumbnailQuality}
          onChange={setThumbnailQuality}
          icon={Image}
          options={[
            { value: 'low', label: 'Low - Fast loading, smaller cache' },
            { value: 'medium', label: 'Medium - Balanced quality' },
            { value: 'high', label: 'High - Best quality, larger cache' },
          ]}
        />
      </SettingCard>

      {/* Scanning Performance */}
      <SettingCard title="Library Scanning" icon={Gauge} accent="violet">
        <SettingSlider
          label="Max Concurrent Scans"
          description="Number of files to process simultaneously (higher = faster but more CPU)"
          value={maxConcurrentScans}
          onChange={setMaxConcurrentScans}
          min={1}
          max={8}
          step={1}
          formatValue={v => `${v} threads`}
          minLabel="1"
          maxLabel="8"
          accentColor="violet"
        />

        {/* Visual indicator */}
        <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">CPU Impact</span>
            <span className={`text-xs font-medium ${
              maxConcurrentScans <= 2 ? 'text-emerald-400' :
              maxConcurrentScans <= 4 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {maxConcurrentScans <= 2 ? 'Low' : maxConcurrentScans <= 4 ? 'Medium' : 'High'}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded ${
                  i < maxConcurrentScans
                    ? i < 2 ? 'bg-emerald-500' : i < 4 ? 'bg-amber-500' : 'bg-red-500'
                    : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      </SettingCard>

      {/* Audio Performance */}
      <SettingCard title="Audio Engine" icon={Zap} accent="pink">
        <SettingToggle
          label="Hardware Acceleration"
          description="Use GPU for audio visualization rendering when available"
          checked={hardwareAcceleration}
          onChange={setHardwareAcceleration}
          icon={Cpu}
        />

        <SettingDivider />

        <SettingSlider
          label="Audio Buffer Size"
          description="Larger buffers reduce glitches but add latency"
          value={audioBufferSize}
          onChange={setAudioBufferSize}
          min={1024}
          max={16384}
          step={1024}
          formatValue={v => `${v} samples`}
          minLabel="1024"
          maxLabel="16384"
          accentColor="pink"
        />

        {/* Latency indicator */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
          <span className="text-xs text-slate-400">Estimated Latency</span>
          <span className="text-pink-400 text-sm font-medium">
            ~{Math.round(audioBufferSize / 44.1)} ms
          </span>
        </div>

        <p className="text-xs text-slate-600 text-center">
          Lower values = less latency, higher values = fewer audio glitches
        </p>
      </SettingCard>
    </div>
  );
}
