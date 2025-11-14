import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';

export const Window = React.memo(function Window({ id, title, icon: Icon, children, className = "", windowData, bringToFront, setWindows, toggleWindow, currentColors, windowOpacity = 0.95 }) {
  if (!windowData.visible) return null;

  // Safety check for currentColors
  const colors = currentColors || { accent: 'text-blue-400', primary: 'bg-blue-600' };

  const handleTitleBarMouseDown = (e) => {
    if (e.target.closest('.window-controls')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWindowX = windowData.x;
    const startWindowY = windowData.y;
    bringToFront(id);
    let raf = null;
    let pendingX = startWindowX;
    let pendingY = startWindowY;
    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const newX = Math.max(0, Math.min(startWindowX + deltaX, window.innerWidth - 200));
      const newY = Math.max(0, Math.min(startWindowY + deltaY, window.innerHeight - 100));
      pendingX = newX;
      pendingY = newY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          setWindows((prev) => ({
            ...prev,
            [id]: { ...prev[id], x: pendingX, y: pendingY }
          }));
          raf = null;
        });
      }
    };
    const handleMouseUp = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
        setWindows((prev) => ({
          ...prev,
          [id]: { ...prev[id], x: pendingX, y: pendingY }
        }));
      }
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
    let raf = null;
    let pendingW = startWidth;
    let pendingH = startHeight;
    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const newWidth = Math.max(250, startWidth + deltaX);
      const newHeight = Math.max(150, startHeight + deltaY);
      pendingW = newWidth;
      pendingH = newHeight;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          setWindows((prev) => ({
            ...prev,
            [id]: { ...prev[id], width: pendingW, height: pendingH }
          }));
          raf = null;
        });
      }
    };
    const handleMouseUp = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
        setWindows((prev) => ({
          ...prev,
          [id]: { ...prev[id], width: pendingW, height: pendingH }
        }));
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (windowData.minimized) {
    return (
      <div
        style={{ left: windowData.x, top: windowData.y, zIndex: windowData.zIndex }}
        className="fixed bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-lg shadow-2xl"
      >
        <div 
          className="flex items-center justify-between px-3 py-2 cursor-move select-none" 
          onMouseDown={handleTitleBarMouseDown}
        >
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${currentColors.accent}`} />
            <span className="text-sm font-medium text-white">{title}</span>
          </div>
          <div className="window-controls flex gap-1">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setWindows((prev) => ({ ...prev, [id]: { ...prev[id], minimized: false } }))}
              className="p-1 hover:bg-slate-700 rounded transition-colors"
            >
              <span className="w-3 h-3 text-slate-400">&#9633;</span>
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
        zIndex: windowData.zIndex,
        opacity: windowOpacity
      }}
      className="fixed bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-lg shadow-2xl backdrop-blur-xl"
      onMouseDown={() => bringToFront(id)}
    >
      <div 
        className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border-b border-slate-700 cursor-move rounded-t-lg select-none" 
        onMouseDown={handleTitleBarMouseDown}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${colors.accent}`} />
          <span className="text-sm font-medium text-white">{title}</span>
        </div>
        <div className="window-controls flex gap-1">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setWindows((prev) => ({ ...prev, [id]: { ...prev[id], minimized: true } }))}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
          >
            <span className="w-3 h-3 text-slate-400">&#8211;</span>
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => toggleWindow(id)}
            className="p-1 hover:bg-red-500/20 rounded transition-colors"
          >
            <span className="w-3 h-3 text-slate-400">&#10005;</span>
          </button>
        </div>
      </div>
      <div className={`p-4 overflow-auto ${className}`} style={{ height: 'calc(100% - 40px)' }}>
        <ErrorBoundary fallbackMessage={`Error in ${title} window`}>
          {children}
        </ErrorBoundary>
      </div>
      <div
        className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize bg-slate-700/50 hover:bg-slate-600/50 transition-colors"
        onMouseDown={handleResizeMouseDown}
        style={{ 
          clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
          borderBottomRightRadius: '0.5rem'
        }}
      >
        <div className="absolute bottom-1 right-1 w-3 h-3" style={{
          borderTop: '2px solid currentColor',
          borderRight: '2px solid currentColor',
          transform: 'rotate(45deg)'
        }} />
      </div>
    </div>
  );
});
