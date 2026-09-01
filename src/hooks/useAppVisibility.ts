import { useEffect, useState } from 'react';
import { TauriAPI } from '../services/TauriAPI';

const APP_VISIBILITY_EVENT = 'vplayer-app-visibility';
let nativeWindowVisible = true;

function pageIsVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/**
 * Update the frontend immediately when a JS-owned tray path hides or shows the
 * window. Native tray paths emit the same state through Tauri.
 */
export function notifyAppWindowVisibility(visible: boolean): void {
  nativeWindowVisible = visible;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<boolean>(APP_VISIBILITY_EVENT, { detail: visible }));
  }
}

/** True only while both the native window and its document are visible. */
export function useAppVisibility(): boolean {
  const [visible, setVisible] = useState(() => nativeWindowVisible && pageIsVisible());

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const update = () => setVisible(nativeWindowVisible && pageIsVisible());
    const onLocalVisibility = (event: Event) => {
      nativeWindowVisible = (event as CustomEvent<boolean>).detail;
      update();
    };

    document.addEventListener('visibilitychange', update);
    window.addEventListener(APP_VISIBILITY_EVENT, onLocalVisibility);

    TauriAPI.onEvent<boolean>('app-window-visibility-changed', ({ payload }) => {
      nativeWindowVisible = payload;
      if (!disposed) update();
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    }).catch(() => {
      // Browser/tests: the DOM visibility signal remains available.
    });

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener(APP_VISIBILITY_EVENT, onLocalVisibility);
      unlisten?.();
    };
  }, []);

  return visible;
}
