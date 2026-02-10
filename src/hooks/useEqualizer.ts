import { useEffect, useCallback, useRef } from 'react';
import { EQ_PRESETS } from '../utils/constants';
import { TauriAPI } from '../services/TauriAPI';
import { useStore } from '../store/useStore';
import type { EqBand } from '../store/types';

export interface EqualizerAPI {
  eqBands: EqBand[];
  setEqBands: (bands: EqBand[]) => void;
  currentPreset: string;
  applyPreset: (presetName: string) => void;
  resetEQ: () => void;
  presets: typeof EQ_PRESETS;
}

export function useEqualizer(): EqualizerAPI {
  // Read/write EQ bands directly from Zustand store (persisted) — no local copy
  const eqBands = useStore(state => state.eqBands);
  const setStoredEqBands = useStore(state => state.setEqBands);

  const initialSyncDone = useRef(false);
  const currentPresetRef = useRef('CUSTOM');

  // Convert UI bands (0-100) to backend format (-12 to +12 dB)
  const convertBandsToBackend = useCallback((bands: EqBand[]): number[] => {
    return bands.map(band => ((band.value - 50) / 50) * 12);
  }, []);

  // Sync EQ settings with backend
  const syncWithBackend = useCallback(async (bands: EqBand[]) => {
    try {
      const eqGains = convertBandsToBackend(bands);
      await TauriAPI.setAudioEffects({
        tempo: 1.0,
        reverb_mix: 0.0,
        reverb_room_size: 0.5,
        bass_boost: 0.0,
        echo_delay: 0.3,
        echo_feedback: 0.3,
        echo_mix: 0.0,
        eq_bands: eqGains,
      });
    } catch (err) {
      console.error('Failed to sync EQ with backend:', err);
    }
  }, [convertBandsToBackend]);

  // Sync with backend on initial mount
  useEffect(() => {
    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      syncWithBackend(eqBands);
    }
  }, [eqBands, syncWithBackend]);

  // Write to store and sync with backend
  const setEqBands = useCallback((bands: EqBand[]) => {
    setStoredEqBands(bands);
    syncWithBackend(bands);
  }, [setStoredEqBands, syncWithBackend]);

  // Apply preset
  const applyPreset = useCallback((presetName: string) => {
    const preset = (EQ_PRESETS as Record<string, { name: string; bands: number[] }>)[presetName];
    if (!preset) return;

    const newBands = eqBands.map((band, index) => ({
      ...band,
      // Presets are in dB (-12..+12); UI slider is 0-100 (50 = 0 dB)
      // Convert: ui = 50 + dB * (50/12)
      value: Math.round(50 + preset.bands[index] * (50 / 12))
    }));

    setEqBands(newBands);
    currentPresetRef.current = presetName;
  }, [eqBands, setEqBands]);

  // Reset to flat
  const resetEQ = useCallback(() => {
    applyPreset('FLAT');
  }, [applyPreset]);

  // Check if current EQ matches a preset
  const detectPreset = useCallback(() => {
    for (const [presetName, preset] of Object.entries(EQ_PRESETS as Record<string, { name: string; bands: number[] }>)) {
      const matches = eqBands.every((band, index) => {
        const expectedValue = 50 + preset.bands[index] * (50 / 12);
        return Math.abs(band.value - expectedValue) < 1;
      });
      
      if (matches) {
        currentPresetRef.current = presetName;
        return;
      }
    }
    currentPresetRef.current = 'CUSTOM';
  }, [eqBands]);

  // Detect preset on mount and when bands change
  useEffect(() => {
    detectPreset();
  }, [detectPreset]);

  return { 
    eqBands, 
    setEqBands, 
    get currentPreset() { return currentPresetRef.current; }, 
    applyPreset, 
    resetEQ,
    presets: EQ_PRESETS 
  };
}