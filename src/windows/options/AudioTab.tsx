import React, { useState, useEffect } from 'react';
import { Volume2, Speaker, RefreshCw, Loader, Check, Radio, Gauge } from 'lucide-react';
import { SettingCard, SettingSlider, SettingToggle, SettingBadge, SettingDivider } from './SettingsComponents';
import { TauriAPI } from '../../services/TauriAPI';
import { nativeError } from '../../utils/nativeDialog';
import type { CrossfadeAPI } from '../../hooks/useCrossfade';

interface AudioDevice {
  name: string;
  is_default?: boolean;
  type?: string;
}

interface AudioTabProps {
  crossfade?: CrossfadeAPI;
}

export function AudioTab({ crossfade }: AudioTabProps) {
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [switchingDevice, setSwitchingDevice] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  useEffect(() => {
    loadAudioDevices();
    loadPlaybackSpeed();
  }, []);

  const loadAudioDevices = async () => {
    try {
      setLoadingDevices(true);
      const devices = await TauriAPI.getAudioDevices() as unknown as AudioDevice[];
      setAudioDevices(devices || []);
      const defaultDevice = devices?.find(d => d.is_default);
      if (defaultDevice) {
        setSelectedDevice(defaultDevice.name);
      }
    } catch (err) {
      console.error('Failed to load audio devices:', err);
      setAudioDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  };

  const loadPlaybackSpeed = async () => {
    try {
      const effects = await TauriAPI.getAudioEffects();
      if (effects && effects.tempo) {
        setPlaybackSpeed(effects.tempo);
      }
    } catch (err) {
      console.error('Failed to load playback speed:', err);
    }
  };

  const handleSpeedChange = async (speed: number) => {
    setPlaybackSpeed(speed);
    try {
      const effects = await TauriAPI.getAudioEffects();
      await TauriAPI.setAudioEffects({
        ...effects,
        tempo: speed,
      });
    } catch (err) {
      console.error('Failed to set playback speed:', err);
    }
  };

  const handleDeviceChange = async (deviceName: string) => {
    try {
      setSwitchingDevice(true);
      await TauriAPI.setAudioDevice(deviceName);
      setSelectedDevice(deviceName);
    } catch (err) {
      console.error('Failed to set audio device:', err);
      await nativeError(`Failed to set audio device: ${err}`);
    } finally {
      setSwitchingDevice(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Audio Output Device */}
      <SettingCard title="Output Device" icon={Speaker} accent="violet">
        <p className="text-xs text-slate-500 mb-4">
          Select which audio device to use for playback
        </p>

        {loadingDevices ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-5 h-5 animate-spin text-violet-400 mr-2" />
            <span className="text-slate-400 text-sm">Detecting audio devices...</span>
          </div>
        ) : audioDevices.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-700 rounded-xl">
            <Speaker className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">No audio devices found</p>
            <p className="text-slate-600 text-xs mt-1">Check your system audio settings</p>
          </div>
        ) : (
          <div className="space-y-2">
            {audioDevices.map((device, idx) => (
              <DeviceOption
                key={idx}
                device={device}
                isSelected={selectedDevice === device.name}
                onSelect={() => handleDeviceChange(device.name)}
                disabled={switchingDevice}
              />
            ))}
          </div>
        )}

        <button
          onClick={loadAudioDevices}
          onMouseDown={e => e.stopPropagation()}
          disabled={loadingDevices || switchingDevice}
          className="mt-4 w-full px-4 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-white text-sm rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loadingDevices ? 'animate-spin' : ''}`} />
          {switchingDevice ? 'Switching...' : 'Refresh Devices'}
        </button>
      </SettingCard>

      {/* Crossfade Settings */}
      {crossfade && (
        <SettingCard title="Crossfade" icon={Radio} accent="pink">
          <p className="text-xs text-slate-500 mb-4">
            Smoothly blend between tracks for continuous listening
          </p>
          
          <SettingToggle
            label="Enable Crossfade"
            description="Overlap and fade between consecutive tracks"
            checked={crossfade.enabled}
            onChange={crossfade.toggleEnabled}
          />

          {crossfade.enabled && (
            <>
              <SettingDivider />
              
              <SettingSlider
                label="Crossfade Duration"
                description="How long the tracks overlap during transition"
                value={crossfade.duration}
                onChange={crossfade.setDuration}
                min={1000}
                max={10000}
                step={500}
                formatValue={v => `${(v / 1000).toFixed(1)}s`}
                minLabel="1s"
                maxLabel="10s"
                accentColor="pink"
              />
              
              {/* Visual crossfade preview */}
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <p className="text-xs text-slate-400 mb-3">Preview</p>
                <div className="relative h-8 flex items-center">
                  {/* Track A (fading out) */}
                  <div 
                    className="absolute left-0 h-6 bg-gradient-to-r from-pink-500 to-pink-500/0 rounded-l"
                    style={{ width: `${50 + (crossfade.duration / 200)}%` }}
                  >
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-white font-medium">Track A</span>
                  </div>
                  {/* Track B (fading in) */}
                  <div 
                    className="absolute right-0 h-6 bg-gradient-to-l from-violet-500 to-violet-500/0 rounded-r"
                    style={{ width: `${50 + (crossfade.duration / 200)}%` }}
                  >
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white font-medium">Track B</span>
                  </div>
                  {/* Overlap indicator */}
                  <div className="absolute left-1/2 -translate-x-1/2 h-full flex items-center">
                    <div className="px-2 py-0.5 bg-slate-900 rounded text-[9px] text-slate-400 border border-slate-700">
                      {(crossfade.duration / 1000).toFixed(1)}s overlap
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </SettingCard>
      )}

      {/* Playback Speed */}
      <SettingCard title="Playback Speed" icon={Gauge} accent="orange">
        <p className="text-xs text-slate-500 mb-4">
          Adjust the speed of audio playback (affects tempo, not pitch)
        </p>
        
        <SettingSlider
          label="Speed"
          description="Change how fast tracks play"
          value={playbackSpeed}
          onChange={handleSpeedChange}
          min={0.5}
          max={2.0}
          step={0.05}
          formatValue={v => `${v.toFixed(2)}x`}
          minLabel="0.5x"
          maxLabel="2.0x"
          accentColor="orange"
        />
        
        {/* Speed presets */}
        <div className="flex gap-2 mt-3">
          {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(speed => (
            <button
              key={speed}
              onClick={() => handleSpeedChange(speed)}
              onMouseDown={e => e.stopPropagation()}
              className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-all ${
                Math.abs(playbackSpeed - speed) < 0.01
                  ? 'bg-orange-500 text-white font-medium'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
        
        {playbackSpeed !== 1.0 && (
          <p className="text-xs text-orange-400 mt-3 text-center">
            Playing at {playbackSpeed}x speed
          </p>
        )}
      </SettingCard>

      {/* Audio Quality Info */}
      <SettingCard title="Audio Quality" icon={Volume2} accent="emerald">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <p className="text-slate-500 text-xs mb-1">Sample Rate</p>
            <p className="text-white text-sm font-medium">44.1 kHz</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <p className="text-slate-500 text-xs mb-1">Bit Depth</p>
            <p className="text-white text-sm font-medium">16-bit</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <p className="text-slate-500 text-xs mb-1">Channels</p>
            <p className="text-white text-sm font-medium">Stereo</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <p className="text-slate-500 text-xs mb-1">Engine</p>
            <p className="text-white text-sm font-medium">Rodio</p>
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-3 text-center">
          Audio is processed natively by the Rust backend for maximum performance
        </p>
      </SettingCard>
    </div>
  );
}

// Device option component
interface DeviceOptionProps {
  device: AudioDevice;
  isSelected: boolean;
  onSelect: () => void;
  disabled: boolean;
}

function DeviceOption({ device, isSelected, onSelect, disabled }: DeviceOptionProps) {
  return (
    <button
      onClick={onSelect}
      onMouseDown={e => e.stopPropagation()}
      disabled={disabled}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
        isSelected
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {/* Radio indicator */}
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
        isSelected ? 'border-violet-500 bg-violet-500' : 'border-slate-600'
      }`}>
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>
      
      {/* Device info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium truncate">{device.name}</span>
          {device.is_default && (
            <SettingBadge variant="primary">System Default</SettingBadge>
          )}
        </div>
        {device.type && (
          <p className="text-slate-500 text-xs mt-0.5">{device.type}</p>
        )}
      </div>
      
      {/* Speaker icon */}
      <Speaker className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-violet-400' : 'text-slate-600'}`} />
    </button>
  );
}
