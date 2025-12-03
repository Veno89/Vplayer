import { useState, useEffect, useCallback, useRef } from 'react';
import { EQ_PRESETS, STORAGE_KEYS } from '../utils/constants';
import { TauriAPI } from '../services/TauriAPI';

export function useEqualizer() {
  // Load saved EQ from localStorage or use flat preset
  const savedEQ = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EQ_BANDS);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const [eqBands, setEqBands] = useState(
    savedEQ || [
      { freq: "60Hz", value: 50 },
      { freq: "170Hz", value: 50 },
      { freq: "310Hz", value: 50 },
      { freq: "600Hz", value: 50 },
      { freq: "1kHz", value: 50 },
      { freq: "3kHz", value: 50 },
      { freq: "6kHz", value: 50 },
      { freq: "12kHz", value: 50 },
      { freq: "14kHz", value: 50 },
      { freq: "16kHz", value: 50 }
    ]
  );

  const [currentPreset, setCurrentPreset] = useState('CUSTOM');
  const initialSyncDone = useRef(false);

  // Convert UI bands (0-100) to backend format (-12 to +12 dB)
  const convertBandsToBackend = useCallback((bands) => {
    return bands.map(band => ((band.value - 50) / 50) * 12);
  }, []);

  // Sync EQ settings with backend
  const syncWithBackend = useCallback(async (bands) => {
    try {
      const eqGains = convertBandsToBackend(bands);
      await TauriAPI.setAudioEffects({
        pitch_shift: 0.0,
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

  // Save EQ to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.EQ_BANDS, JSON.stringify(eqBands));
    } catch (err) {
      console.warn('Failed to save EQ settings:', err);
    }
  }, [eqBands]);

  // Apply preset
  const applyPreset = useCallback((presetName) => {
    const preset = EQ_PRESETS[presetName];
    if (!preset) return;

    const newBands = eqBands.map((band, index) => ({
      ...band,
      value: 50 + preset.bands[index] * 5 // Convert from -10..+10 to 0..100 scale
    }));

    setEqBands(newBands);
    setCurrentPreset(presetName);
  }, [eqBands]);

  // Reset to flat
  const resetEQ = useCallback(() => {
    applyPreset('FLAT');
  }, [applyPreset]);

  // Check if current EQ matches a preset
  const detectPreset = useCallback(() => {
    for (const [presetName, preset] of Object.entries(EQ_PRESETS)) {
      const matches = eqBands.every((band, index) => {
        const expectedValue = 50 + preset.bands[index] * 5;
        return Math.abs(band.value - expectedValue) < 1;
      });
      
      if (matches) {
        setCurrentPreset(presetName);
        return;
      }
    }
    setCurrentPreset('CUSTOM');
  }, [eqBands]);

  // Detect preset on mount and when bands change
  useEffect(() => {
    detectPreset();
  }, [detectPreset]);

  return { 
    eqBands, 
    setEqBands, 
    currentPreset, 
    applyPreset, 
    resetEQ,
    presets: EQ_PRESETS 
  };
}