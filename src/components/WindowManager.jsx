import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { Window } from './Window';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { WINDOW_REGISTRY } from '../windowRegistry';

/**
 * Window manager component
 * Renders all visible windows from the static WINDOW_REGISTRY.
 * Each window is self-sufficient — reads its own state from store / context.
 */
export const WindowManager = () => {
  const windows = useStore(s => s.windows);
  const bringToFront = useStore(s => s.bringToFront);
  const setWindows = useStore(s => s.setWindows);
  const toggleWindow = useStore(s => s.toggleWindow);
  const windowOpacity = useStore(s => s.windowOpacity);
  const currentColors = useCurrentColors();

  return (
    <>
      {WINDOW_REGISTRY.map(cfg => (
        windows[cfg.id]?.visible && (
          <ErrorBoundary key={cfg.id} fallbackMessage={`Failed to render ${cfg.title} window`}>
            <Window
              id={cfg.id}
              title={cfg.title}
              icon={cfg.icon}
              windowData={windows[cfg.id]}
              currentColors={currentColors}
              bringToFront={bringToFront}
              setWindows={setWindows}
              toggleWindow={toggleWindow}
              windowOpacity={windowOpacity}
            >
              <cfg.Component />
            </Window>
          </ErrorBoundary>
        )
      ))}
    </>
  );
};
