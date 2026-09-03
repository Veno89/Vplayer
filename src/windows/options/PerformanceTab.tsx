import React, { useState, useEffect } from 'react';
import { HardDrive, Cpu, Activity } from 'lucide-react';
import { TauriAPI } from '../../services/TauriAPI';
import { useStore } from '../../store/useStore';
import { SettingSlider, SettingCard } from './SettingsComponents';

interface ResourceUsageInfo {
  cache_used: number;
  database_used: number;
}

export function PerformanceTab() {
  const [resourceUsage, setResourceUsage] = useState<ResourceUsageInfo | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Get settings from store
  const cacheSizeLimit = useStore(state => state.cacheSizeLimit);
  const setCacheSizeLimit = useStore(state => state.setCacheSizeLimit);

  useEffect(() => {
    loadStats();
  }, []);

  // The application root debounces cache enforcement after this durable
  // setting changes, avoiding a full disk scan for every slider event.
  const handleCacheLimitChange = (value: number) => {
    setCacheSizeLimit(value);
  };

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const stats = await TauriAPI.getPerformanceStats().catch(() => null);
      const cacheUsed = await TauriAPI.getCacheSize().catch(() => 0);
      setResourceUsage({
        cache_used: cacheUsed,
        database_used: stats?.database.size_bytes ?? 0,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Calculate cache usage percentage for visual
  const cachePercentage = Math.min(100, (resourceUsage?.cache_used || 0) / (cacheSizeLimit * 1024 * 1024) * 100);

  return (
    <div className="space-y-6">
      {/* Resource Monitor */}
      <SettingCard title="Resource Monitor" icon={Activity} accent="cyan">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-linear-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-400 text-xs">Cache Usage</span>
            </div>
            <p className="text-white text-lg font-bold">
              {loadingStats ? '...' : formatBytes(resourceUsage?.cache_used || 0)}
            </p>
            <p className="text-slate-500 text-xs">of {cacheSizeLimit} MB limit</p>
            
            {/* Progress bar */}
            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-linear-to-r from-cyan-500 to-blue-500 transition-all"
                style={{ width: `${cachePercentage}%` }}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-linear-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400 text-xs">Database</span>
            </div>
            <p className="text-white text-lg font-bold">
              {loadingStats ? '...' : formatBytes(resourceUsage?.database_used || 0)}
            </p>
            <p className="text-slate-500 text-xs">on-disk size</p>
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
          onChange={handleCacheLimitChange}
          min={100}
          max={2000}
          step={100}
          formatValue={v => v >= 1000 ? `${(v/1000).toFixed(1)} GB` : `${v} MB`}
          minLabel="100 MB"
          maxLabel="2 GB"
          accentColor="amber"
        />
      </SettingCard>
    </div>
  );
}
