import React, { useState } from 'react';
import { Play, SkipForward, Volume2, Clock, Mic2, Activity, Loader, StopCircle, Timer, Gauge } from 'lucide-react';
import { TauriAPI } from '../../services/TauriAPI';
import { useStore } from '../../store/useStore';
import { nativeAlert, nativeError } from '../../utils/nativeDialog';
import { SettingToggle, SettingSlider, SettingSelect, SettingCard, SettingDivider, SettingButton } from './SettingsComponents';
import type { CrossfadeAPI } from '../../hooks/useCrossfade';

interface PlaybackTabProps {
  crossfade?: CrossfadeAPI;
}

export function PlaybackTab({ crossfade }: PlaybackTabProps) {
  const [analyzingRG, setAnalyzingRG] = useState(false);
  const [rgProgress, setRgProgress] = useState({ current: 0, total: 0 });

  // Get all playback settings from store
  const gaplessPlayback = useStore(state => state.gaplessPlayback);
  const setGaplessPlayback = useStore(state => state.setGaplessPlayback);
  const autoPlayOnStartup = useStore(state => state.autoPlayOnStartup);
  const setAutoPlayOnStartup = useStore(state => state.setAutoPlayOnStartup);
  const resumeLastTrack = useStore(state => state.resumeLastTrack);
  const setResumeLastTrack = useStore(state => state.setResumeLastTrack);
  const replayGainMode = useStore(state => state.replayGainMode);
  const setReplayGainMode = useStore(state => state.setReplayGainMode);
  const replayGainPreamp = useStore(state => state.replayGainPreamp);
  const setReplayGainPreamp = useStore(state => state.setReplayGainPreamp);
  const fadeOnPause = useStore(state => state.fadeOnPause);
  const setFadeOnPause = useStore(state => state.setFadeOnPause);
  const fadeDuration = useStore(state => state.fadeDuration);
  const setFadeDuration = useStore(state => state.setFadeDuration);
  const rememberTrackPosition = useStore(state => state.rememberTrackPosition);
  const setRememberTrackPosition = useStore(state => state.setRememberTrackPosition);
  const defaultVolume = useStore(state => state.defaultVolume);
  const setDefaultVolume = useStore(state => state.setDefaultVolume);
  const stopAfterCurrent = useStore(state => state.stopAfterCurrent);
  const setStopAfterCurrent = useStore(state => state.setStopAfterCurrent);
  const sleepTimerMinutes = useStore(state => state.sleepTimerMinutes);
  const setSleepTimerMinutes = useStore(state => state.setSleepTimerMinutes);
  const seekStepSize = useStore(state => state.seekStepSize);
  const setSeekStepSize = useStore(state => state.setSeekStepSize);
  const volumeStep = useStore(state => state.volumeStep);
  const setVolumeStep = useStore(state => state.setVolumeStep);
  const rememberQueue = useStore(state => state.rememberQueue);
  const setRememberQueue = useStore(state => state.setRememberQueue);

  return (
    <div className="space-y-6">
      {/* General Playback */}
      <SettingCard title="General" icon={Play} accent="cyan">
        <SettingToggle
          label="Gapless Playback"
          description="Seamless transitions between consecutive tracks without silence gaps"
          checked={gaplessPlayback}
          onChange={setGaplessPlayback}
          icon={SkipForward}
        />

        <SettingToggle
          label="Auto-play on Startup"
          description="Automatically start playing when the app launches"
          checked={autoPlayOnStartup}
          onChange={setAutoPlayOnStartup}
          icon={Play}
        />

        <SettingToggle
          label="Resume Last Track"
          description="Continue playing from where you left off when reopening the app"
          checked={resumeLastTrack}
          onChange={setResumeLastTrack}
          icon={Clock}
        />

        <SettingToggle
          label="Remember Position (Long Tracks)"
          description="Save playback position for audiobooks, podcasts, and tracks over 10 minutes"
          checked={rememberTrackPosition}
          onChange={setRememberTrackPosition}
          icon={Mic2}
        />

        <SettingToggle
          label="Stop After Current Track"
          description="Playback stops automatically after the current track finishes"
          checked={stopAfterCurrent}
          onChange={setStopAfterCurrent}
          icon={StopCircle}
        />

        <SettingToggle
          label="Remember Play Queue"
          description="Persist the play queue across app restarts"
          checked={rememberQueue}
          onChange={setRememberQueue}
          icon={Clock}
        />

        <SettingSlider
          label="Default Volume"
          description="Volume level used when no previous volume is saved"
          value={defaultVolume}
          onChange={setDefaultVolume}
          min={0}
          max={100}
          step={5}
          formatValue={v => `${v}%`}
          minLabel="0%"
          maxLabel="100%"
          accentColor="cyan"
        />
      </SettingCard>

      {/* Controls & Steps */}
      <SettingCard title="Controls" icon={Gauge} accent="orange">
        <SettingSlider
          label="Seek Step Size"
          description="How far forward/backward keyboard shortcuts skip"
          value={seekStepSize}
          onChange={setSeekStepSize}
          min={1}
          max={30}
          step={1}
          formatValue={v => `${v}s`}
          minLabel="1s"
          maxLabel="30s"
          accentColor="orange"
        />

        <SettingSlider
          label="Volume Step"
          description="How much volume changes per keyboard press"
          value={volumeStep}
          onChange={setVolumeStep}
          min={1}
          max={20}
          step={1}
          formatValue={v => `${v}%`}
          minLabel="1%"
          maxLabel="20%"
          accentColor="orange"
        />
      </SettingCard>

      {/* Sleep Timer */}
      <SettingCard title="Sleep Timer" icon={Timer} accent="indigo">
        <p className="text-xs text-slate-500 mb-3">
          Automatically stop playback after a set duration. Set to 0 to disable.
        </p>

        <SettingSlider
          label="Timer Duration"
          description={sleepTimerMinutes > 0 ? `Playback will stop after ${sleepTimerMinutes} minute${sleepTimerMinutes !== 1 ? 's' : ''}` : 'Disabled'}
          value={sleepTimerMinutes}
          onChange={setSleepTimerMinutes}
          min={0}
          max={120}
          step={5}
          formatValue={v => v === 0 ? 'Off' : `${v} min`}
          minLabel="Off"
          maxLabel="2h"
          accentColor="indigo"
        />

        {/* Quick presets */}
        <div className="flex gap-2 mt-2">
          {[0, 15, 30, 45, 60, 90].map(mins => (
            <button
              key={mins}
              onClick={() => setSleepTimerMinutes(mins)}
              onMouseDown={e => e.stopPropagation()}
              className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-all ${
                sleepTimerMinutes === mins
                  ? 'bg-indigo-500 text-white font-medium'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {mins === 0 ? 'Off' : `${mins}m`}
            </button>
          ))}
        </div>
      </SettingCard>

      {/* Fading & Transitions */}
      <SettingCard title="Fading & Transitions" icon={SkipForward} accent="purple">
        <SettingToggle
          label="Fade on Play/Pause"
          description="Smoothly fade volume when playing or pausing instead of abrupt stop"
          checked={fadeOnPause}
          onChange={setFadeOnPause}
        />

        {fadeOnPause && (
          <SettingSlider
            label="Fade Duration"
            description="How long the fade effect lasts"
            value={fadeDuration}
            onChange={setFadeDuration}
            min={50}
            max={500}
            step={25}
            formatValue={v => `${v}ms`}
            minLabel="50ms"
            maxLabel="500ms"
            accentColor="purple"
          />
        )}

        {crossfade && (
          <>
            <SettingDivider label="Crossfade" />

            <SettingToggle
              label="Enable Crossfade"
              description="Fade between tracks for smooth DJ-style transitions"
              checked={crossfade.enabled}
              onChange={crossfade.toggleEnabled}
            />

            {crossfade.enabled && (
              <SettingSlider
                label="Crossfade Duration"
                description="Length of the crossfade overlap between tracks"
                value={crossfade.duration}
                onChange={crossfade.setDuration}
                min={1000}
                max={10000}
                step={500}
                formatValue={v => `${(v / 1000).toFixed(1)}s`}
                minLabel="1s"
                maxLabel="10s"
                accentColor="purple"
              />
            )}
          </>
        )}
      </SettingCard>

      {/* ReplayGain */}
      <SettingCard title="Volume Normalization" icon={Volume2} accent="emerald">
        <SettingSelect
          label="ReplayGain Mode"
          description="Automatically adjust volume levels so all tracks play at similar loudness"
          value={replayGainMode}
          onChange={v => setReplayGainMode(v as 'off' | 'track' | 'album')}
          options={[
            { value: 'off', label: 'Off - No normalization' },
            { value: 'track', label: 'Track Gain - Normalize each track individually' },
            { value: 'album', label: 'Album Gain - Preserve album dynamics (coming soon)' },
          ]}
        />

        {replayGainMode !== 'off' && (
          <>
            <SettingSlider
              label="Pre-amp Adjustment"
              description="Additional gain applied after normalization"
              value={replayGainPreamp}
              onChange={setReplayGainPreamp}
              min={-15}
              max={15}
              step={0.5}
              formatValue={v => `${v > 0 ? '+' : ''}${v} dB`}
              minLabel="-15 dB"
              maxLabel="+15 dB"
              accentColor="emerald"
            />

            <SettingDivider label="Analysis" />

            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 mb-3">
              <p className="text-xs text-slate-400">
                Tracks need to be analyzed before ReplayGain can be applied. Analysis measures the loudness of each track using the EBU R128 standard.
              </p>
            </div>

            <SettingButton
              label={analyzingRG ? `Analyzing... (${rgProgress.current}/${rgProgress.total})` : "Analyze Library"}
              description="Scan all tracks without ReplayGain data"
              onClick={async () => {
                if (analyzingRG) return;

                try {
                  setAnalyzingRG(true);
                  const tracks = await TauriAPI.getAllTracks();

                  // Filter tracks that need analysis (no loudness data)
                  const needsAnalysis = tracks.filter(t => (t as unknown as { loudness?: number | null }).loudness === null || (t as unknown as { loudness?: number | null }).loudness === undefined);

                  if (needsAnalysis.length === 0) {
                    await nativeAlert('All tracks have already been analyzed!');
                    setAnalyzingRG(false);
                    return;
                  }

                  setRgProgress({ current: 0, total: needsAnalysis.length });

                  let analyzed = 0;
                  let failed = 0;

                  for (const track of needsAnalysis) {
                    try {
                      await TauriAPI.analyzeReplayGain(track.path);
                      analyzed++;
                    } catch (err) {
                      console.warn(`Failed to analyze ${track.path}:`, err);
                      failed++;
                    }
                    setRgProgress({ current: analyzed + failed, total: needsAnalysis.length });
                  }

                  await nativeAlert(`Analysis complete!\n\nAnalyzed: ${analyzed} tracks\nFailed: ${failed} tracks`);
                } catch (err) {
                  console.error('ReplayGain analysis failed:', err);
                  await nativeError(`Analysis failed: ${err}`);
                } finally {
                  setAnalyzingRG(false);
                  setRgProgress({ current: 0, total: 0 });
                }
              }}
              icon={analyzingRG ? Loader : Activity}
              variant="primary"
              loading={analyzingRG}
            />
          </>
        )}
      </SettingCard>
    </div>
  );
}
