/**
 * useTrayBehavior – syncs tray-related settings to the Rust backend and
 * handles `minimizeToTray` / `startMinimized` from the JS side.
 *
 * Mount this once in VPlayer (or App).
 */
import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { TauriAPI } from '../services/TauriAPI';

let startMinimizedHandled = false;

export function useTrayBehavior() {
  const closeToTray = useStore(s => s.closeToTray);
  const minimizeToTray = useStore(s => s.minimizeToTray);
  const startMinimized = useStore(s => s.startMinimized);

  const minimizeToTrayRef = useRef(minimizeToTray);
  minimizeToTrayRef.current = minimizeToTray;

  // ── Sync settings to Rust whenever they change ─────────────────────
  useEffect(() => {
    TauriAPI.setTraySettings(closeToTray, minimizeToTray, startMinimized).catch(() => {});
  }, [closeToTray, minimizeToTray, startMinimized]);

  // ── startMinimized: hide the window once on first mount ────────────
  useEffect(() => {
    if (startMinimized && !startMinimizedHandled) {
      startMinimizedHandled = true;
      (async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().hide();
        } catch { /* not in Tauri context */ }
      })();
    } else {
      startMinimizedHandled = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // ── minimizeToTray: listen for window state changes and hide when minimized ─
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        // Listen for focus changes — when the window loses focus due to
        // being minimized, we detect it and hide to tray.
        unlisten = await win.onFocusChanged(async ({ payload: focused }) => {
          if (!focused && minimizeToTrayRef.current) {
            try {
              const minimized = await win.isMinimized();
              if (minimized) {
                await win.hide();
              }
            } catch { /* ignore transient errors */ }
          }
        });
      } catch { /* not in Tauri context */ }
    };

    setup();

    return () => { unlisten?.(); };
  }, []);
}
