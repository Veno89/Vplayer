import React from 'react';
import { ToastContainer } from './Toast';
import { FolderPlus } from 'lucide-react';

/**
 * Main application container
 * Handles app-level layout, background, toast notifications, and error display
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render
 * @param {Array} props.toasts - Toast notifications
 * @param {Function} props.removeToast - Remove toast callback
 * @param {string|null} props.audioBackendError - Audio backend error message
 * @param {Function} props.onDrop - Drop event handler
 * @param {Function} props.onDragOver - Drag over event handler
 * @param {Function} props.onDragLeave - Drag leave event handler
 * @param {boolean} props.isDraggingExternal - Whether files are being dragged over
 * @param {number} props.fontSize - Base font size
 * @param {string} props.backgroundImage - Background image URL
 * @param {number} props.backgroundBlur - Background blur amount
 * @param {number} props.backgroundOpacity - Background opacity (0-1)
 * @param {Object} props.currentColors - Theme color configuration
 */
export const AppContainer = ({ 
  children, 
  toasts, 
  removeToast, 
  audioBackendError,
  onDrop,
  onDragOver,
  onDragLeave,
  isDraggingExternal,
  fontSize,
  backgroundImage,
  backgroundBlur,
  backgroundOpacity,
  currentColors
}) => {
  // Default colors for fallback
  const colors = currentColors || {
    gradientFrom: '#0f172a',
    gradientVia: '#1e293b',
    gradientTo: '#0f172a',
    scrollbarTrack: '#1e293b',
    scrollbarThumb: '#475569',
    color: '#06b6d4',
  };

  return (
    <div 
      className="w-full h-screen overflow-hidden relative"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      style={{ 
        fontSize: `${fontSize}px`,
        background: `linear-gradient(to bottom right, ${colors.gradientFrom}, ${colors.gradientVia}, ${colors.gradientTo})`,
        // Apply theme-aware scrollbar colors via CSS custom properties
        '--scrollbar-track': colors.scrollbarTrack,
        '--scrollbar-thumb': colors.scrollbarThumb,
        '--theme-accent': colors.color,
        '--theme-selection': colors.selection || 'rgba(6, 182, 212, 0.2)',
      }}
    >
      {backgroundImage && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url("${backgroundImage}")`,
            filter: `blur(${backgroundBlur}px)`,
            opacity: backgroundOpacity,
            transform: 'scale(1.1)'
          }}
        />
      )}
      
      {/* Drop zone overlay */}
      {isDraggingExternal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div 
            className="flex flex-col items-center gap-4 p-12 rounded-2xl border-4 border-dashed"
            style={{ 
              borderColor: colors.color,
              background: `${colors.color}10`
            }}
          >
            <FolderPlus 
              className="w-20 h-20 animate-pulse" 
              style={{ color: colors.color }}
            />
            <div className="text-center">
              <p className="text-xl font-semibold text-white">
                Drop folders to add to library
              </p>
              <p className="text-sm text-slate-400 mt-2">
                Supported: MP3, FLAC, WAV, OGG, M4A, AAC, WMA
              </p>
            </div>
          </div>
        </div>
      )}
      
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {audioBackendError && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-900/90 backdrop-blur-sm text-white px-4 py-3 text-center text-sm border-b border-red-700">
          <div className="font-semibold">Audio System Unavailable</div>
          <div className="text-xs mt-1 text-red-200">
            {audioBackendError}. Playback controls are disabled. Please restart the application.
          </div>
        </div>
      )}

      {children}
    </div>
  );
};
