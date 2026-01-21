import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { WINDOW_MIN_SIZES } from '../utils/constants';
import { notifyDragStart, notifyDragEnd } from '../hooks/useAutoResize';

export const Window = React.memo(function Window({ id, title, icon: Icon, children, className = "", windowData, bringToFront, setWindows, toggleWindow, currentColors, windowOpacity = 0.95 }) {
  if (!windowData.visible) return null;

  // Check if this is the library window and if it's currently dragging
  // If so, we want to send it to the back temporarily
  const isLibraryDragging = id === 'library' && children?.props?.['data-library-dragging'];

  // Safety check for currentColors with comprehensive fallback
  const colors = currentColors || {
    accent: 'text-cyan-400',
    primary: 'bg-cyan-500',
    windowBg: 'rgba(15, 23, 42, 0.95)',
    windowBorder: 'rgba(51, 65, 85, 0.8)',
    headerBg: 'rgba(30, 41, 59, 0.8)',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    border: '#334155',
  };

  // Get minimum sizes for this window type (with fallbacks)
  const minSizes = WINDOW_MIN_SIZES[id] || { width: 250, height: 150 };

  const handleTitleBarMouseDown = (e) => {
    if (e.target.closest('.window-controls')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWindowX = windowData.x;
    const startWindowY = windowData.y;
    bringToFront(id);
    notifyDragStart(); // Notify auto-resize that dragging started
    let raf = null;
    let pendingX = startWindowX;
    let pendingY = startWindowY;
    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      // Allow dragging anywhere (positive coordinates only) - auto-resize will expand the main window
      const newX = Math.max(0, startWindowX + deltaX);
      const newY = Math.max(0, startWindowY + deltaY);
      pendingX = newX;
      pendingY = newY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          setWindows((prev) => {
            if (!prev[id]) return prev;
            return {
              ...prev,
              [id]: { ...prev[id], x: pendingX, y: pendingY }
            };
          });
          raf = null;
        });
      }
    };
    const handleMouseUp = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
        setWindows((prev) => {
          if (!prev[id]) return prev;
          return {
            ...prev,
            [id]: { ...prev[id], x: pendingX, y: pendingY }
          };
        });
      }
      notifyDragEnd(); // Notify auto-resize that dragging ended
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = windowData.width;
    const startHeight = windowData.height;
    bringToFront(id);
    notifyDragStart(); // Notify auto-resize that resizing started
    let raf = null;
    let pendingW = startWidth;
    let pendingH = startHeight;
    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const newWidth = Math.max(minSizes.width, startWidth + deltaX);
      const newHeight = Math.max(minSizes.height, startHeight + deltaY);
      pendingW = newWidth;
      pendingH = newHeight;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          setWindows((prev) => {
            if (!prev[id]) return prev;
            return {
              ...prev,
              [id]: { ...prev[id], width: pendingW, height: pendingH }
            };
          });
          raf = null;
        });
      }
    };
    const handleMouseUp = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
        setWindows((prev) => {
          if (!prev[id]) return prev;
          return {
            ...prev,
            [id]: { ...prev[id], width: pendingW, height: pendingH }
          };
        });
      }
      notifyDragEnd(); // Notify auto-resize that resizing ended
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (windowData.minimized) {
    return (
      <div
        style={{
          left: windowData.x,
          top: windowData.y,
          zIndex: windowData.zIndex,
          background: colors.windowBg || 'rgba(15, 23, 42, 0.95)',
          borderColor: colors.windowBorder || 'rgba(51, 65, 85, 0.8)',
        }}
        className="fixed border rounded-lg shadow-2xl backdrop-blur-xl"
      >
        <div
          className="flex items-center justify-between px-3 py-2 cursor-move select-none"
          onMouseDown={handleTitleBarMouseDown}
        >
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${colors.accent}`} />
            <span className="text-sm font-medium" style={{ color: colors.text || '#f8fafc' }}>{title}</span>
          </div>
          <div className="window-controls flex gap-1">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setWindows((prev) => ({ ...prev, [id]: { ...prev[id], minimized: false } }))}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <span className="w-3 h-3" style={{ color: colors.textMuted || '#94a3b8' }}>&#9633;</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        left: windowData.x,
        top: windowData.y,
        width: windowData.width,
        height: windowData.height,
        zIndex: isLibraryDragging ? 1 : windowData.zIndex,
        opacity: windowOpacity,
        background: colors.windowBg || 'rgba(15, 23, 42, 0.95)',
        borderColor: colors.windowBorder || 'rgba(51, 65, 85, 0.8)',
      }}
      className="fixed border rounded-lg shadow-2xl backdrop-blur-xl"
      onMouseDown={(e) => {
        // Don't stopPropagation if clicking on a draggable element (let drag work)
        const isDraggable = e.target.draggable || e.target.closest('[draggable="true"]');
        if (isDraggable) {
          // Don't bringToFront here - causes re-render that cancels drag!
          return;
        }
        e.stopPropagation();
        bringToFront(id);
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b cursor-move rounded-t-lg select-none"
        style={{
          background: colors.headerBg || 'rgba(30, 41, 59, 0.8)',
          borderColor: colors.windowBorder || 'rgba(51, 65, 85, 0.8)',
        }}
        onMouseDown={handleTitleBarMouseDown}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${colors.accent}`} />
          <span className="text-sm font-medium" style={{ color: colors.text || '#f8fafc' }}>{title}</span>
        </div>
        <div className="window-controls flex gap-1">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setWindows((prev) => ({ ...prev, [id]: { ...prev[id], minimized: true } }))}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <span className="w-3 h-3" style={{ color: colors.textMuted || '#94a3b8' }}>&#8211;</span>
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => toggleWindow(id)}
            className="p-1 hover:bg-red-500/20 rounded transition-colors"
          >
            <span className="w-3 h-3" style={{ color: colors.textMuted || '#94a3b8' }}>&#10005;</span>
          </button>
        </div>
      </div>
      <div
        className={`p-4 overflow-auto ${className}`}
        style={{
          height: 'calc(100% - 40px)',
          pointerEvents: 'auto',
          color: colors.text || '#f8fafc',
        }}
      >
        <ErrorBoundary fallbackMessage={`Error in ${title} window`}>
          {children}
        </ErrorBoundary>
      </div>
      <div
        className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize transition-colors hover:opacity-80"
        onMouseDown={handleResizeMouseDown}
        style={{
          clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
          borderBottomRightRadius: '0.5rem',
          background: `${colors.border || '#334155'}50`,
        }}
      >
        <div className="absolute bottom-1 right-1 w-3 h-3" style={{
          borderTop: `2px solid ${colors.textSubtle || '#64748b'}`,
          borderRight: `2px solid ${colors.textSubtle || '#64748b'}`,
          transform: 'rotate(45deg)'
        }} />
      </div>
    </div>
  );
});
