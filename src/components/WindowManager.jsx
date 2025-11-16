import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { Window } from './Window';

/**
 * Window manager component
 * Renders all visible windows with error boundaries
 * 
 * @param {Object} props
 * @param {Array} props.windowConfigs - Window configuration array
 * @param {Object} props.windows - Window state object
 * @param {Object} props.currentColors - Current color scheme
 * @param {Function} props.bringToFront - Bring window to front callback
 * @param {Function} props.setWindows - Set windows state callback
 * @param {Function} props.toggleWindow - Toggle window visibility callback
 * @param {number} props.windowOpacity - Window opacity (0-1)
 */
export const WindowManager = ({ 
  windowConfigs, 
  windows, 
  currentColors,
  bringToFront,
  setWindows,
  toggleWindow,
  windowOpacity
}) => {
  return (
    <>
      {windowConfigs.map(cfg => (
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
              {cfg.content}
            </Window>
          </ErrorBoundary>
        )
      ))}
    </>
  );
};
