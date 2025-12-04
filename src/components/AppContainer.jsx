import React from 'react';
import { ToastContainer } from './Toast';

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
