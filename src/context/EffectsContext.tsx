import { createContext, useContext, useEffect, useMemo, type ReactNode, type MutableRefObject } from 'react';
import { useCrossfade } from '../hooks/useCrossfade';
import type { CrossfadeAPI } from '../hooks/useCrossfade';

// ─────────────────────────────────────────────────────────────────────────────
// Context type
// ─────────────────────────────────────────────────────────────────────────────

export interface EffectsContextValue {
  crossfade: CrossfadeAPI;
}

const EffectsContext = createContext<EffectsContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export interface EffectsProviderProps {
  children: ReactNode;
  /** Ref bridge — EffectsProvider writes the live crossfade API here so
   *  AudioEngineProvider's onEnded/onDeviceLost callbacks can access it. */
  crossfadeRef: MutableRefObject<CrossfadeAPI | null>;
}

export function EffectsProvider({ children, crossfadeRef }: EffectsProviderProps) {
  // ── Crossfade ─────────────────────────────────────────────────────
  const crossfade = useCrossfade();

  // Keep the ref in sync for the AudioEngine's onEnded/onDeviceLost callbacks
  useEffect(() => { crossfadeRef.current = crossfade; });

  const value = useMemo<EffectsContextValue>(() => ({ crossfade }), [crossfade]);

  return (
    <EffectsContext.Provider value={value}>
      {children}
    </EffectsContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useEffectsContext(): EffectsContextValue {
  const ctx = useContext(EffectsContext);
  if (!ctx) throw new Error('useEffectsContext must be used within <EffectsProvider>');
  return ctx;
}
