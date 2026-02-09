import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { COLOR_SCHEMES } from '../utils/colorSchemes';
import type { ColorScheme } from '../store/types';

/**
 * Lightweight hook for derived currentColors.
 * Use this in self-sufficient window components instead of passing colors as props.
 */
export function useCurrentColors(): ColorScheme {
  const colorScheme = useStore((state) => state.colorScheme);
  const customThemes = useStore((state) => state.customThemes);
  return useMemo(
    () => customThemes?.[colorScheme] || (COLOR_SCHEMES as Record<string, ColorScheme>)[colorScheme] || COLOR_SCHEMES.default,
    [colorScheme, customThemes],
  );
}

// NOTE: useUIState, usePlayerState and useWindowManagement were removed as dead code.
// Consumers should use granular selectors directly:
//   const playing = useStore(s => s.playing)
// This avoids unnecessary re-renders from subscribing to 20+ selectors at once.