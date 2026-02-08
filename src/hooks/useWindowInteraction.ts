import { useCallback, useRef } from 'react';
import { notifyDragStart, notifyDragEnd } from './useAutoResize';

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: any;
}

type SetWindowsFn = (updater: (prev: Record<string, WindowState>) => Record<string, WindowState>) => void;
type BringToFrontFn = (id: string) => void;

interface MinSizes {
  width: number;
  height: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// useDraggable — handles title-bar drag
// ─────────────────────────────────────────────────────────────────────────────

interface DraggableParams {
  id: string;
  windowData: WindowState;
  setWindows: SetWindowsFn;
  bringToFront: BringToFrontFn;
}

/**
 * Returns an `onMouseDown` handler for the window title bar.
 * Manages document-level mousemove/mouseup, RAF-batched position updates,
 * and auto-resize notifications.
 */
export function useDraggable({ id, windowData, setWindows, bringToFront }: DraggableParams) {
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.window-controls')) return;
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const startWindowX = windowData.x;
      const startWindowY = windowData.y;
      bringToFront(id);
      notifyDragStart();

      let raf: number | null = null;
      let pendingX = startWindowX;
      let pendingY = startWindowY;

      const flush = () => {
        setWindows((prev) => {
          if (!prev[id]) return prev;
          return { ...prev, [id]: { ...prev[id], x: pendingX, y: pendingY } };
        });
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        pendingX = Math.max(0, startWindowX + (moveEvent.clientX - startX));
        pendingY = Math.max(0, startWindowY + (moveEvent.clientY - startY));
        if (!raf) {
          raf = requestAnimationFrame(() => {
            flush();
            raf = null;
          });
        }
      };

      const handleMouseUp = () => {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = null;
          flush();
        }
        notifyDragEnd();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [id, windowData.x, windowData.y, setWindows, bringToFront],
  );

  return onMouseDown;
}

// ─────────────────────────────────────────────────────────────────────────────
// useResizable — handles bottom-right resize grip
// ─────────────────────────────────────────────────────────────────────────────

interface ResizableParams {
  id: string;
  windowData: WindowState;
  setWindows: SetWindowsFn;
  bringToFront: BringToFrontFn;
  minSizes: MinSizes;
}

/**
 * Returns an `onMouseDown` handler for the resize grip.
 * Manages document-level mousemove/mouseup, RAF-batched dimension updates,
 * and auto-resize notifications.
 */
export function useResizable({ id, windowData, setWindows, bringToFront, minSizes }: ResizableParams) {
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = windowData.width;
      const startHeight = windowData.height;
      bringToFront(id);
      notifyDragStart();

      let raf: number | null = null;
      let pendingW = startWidth;
      let pendingH = startHeight;

      const flush = () => {
        setWindows((prev) => {
          if (!prev[id]) return prev;
          return { ...prev, [id]: { ...prev[id], width: pendingW, height: pendingH } };
        });
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        pendingW = Math.max(minSizes.width, startWidth + (moveEvent.clientX - startX));
        pendingH = Math.max(minSizes.height, startHeight + (moveEvent.clientY - startY));
        if (!raf) {
          raf = requestAnimationFrame(() => {
            flush();
            raf = null;
          });
        }
      };

      const handleMouseUp = () => {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = null;
          flush();
        }
        notifyDragEnd();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [id, windowData.width, windowData.height, setWindows, bringToFront, minSizes.width, minSizes.height],
  );

  return onMouseDown;
}
