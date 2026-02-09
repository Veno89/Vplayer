import React, { useEffect, type ReactNode } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ToastContainer } from './Toast';
import { FolderPlus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { usePlayerContext } from '../context/PlayerProvider';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { useDragDrop } from '../hooks/useDragDrop';
import { useToast } from '../hooks/useToast';

/**
 * Main application container — self-sufficient.
 * Reads theme, toast, drag-drop, and audio error state from store/context.
 * Also handles background image URL conversion (file:// → Tauri asset://).
 */
export const AppContainer = ({ children }: { children: ReactNode }) => {
  const currentColors = useCurrentColors();
  const fontSize = useStore(s => s.fontSize);
  const backgroundImage = useStore(s => s.backgroundImage);
  const setBackgroundImage = useStore(s => s.setBackgroundImage);
  const backgroundBlur = useStore(s => s.backgroundBlur);
  const backgroundOpacity = useStore(s => s.backgroundOpacity);

  // Convert file:// URLs to Tauri asset:// URLs for background images
  useEffect(() => {
    if (backgroundImage && backgroundImage.startsWith('file://')) {
      try {
        const filePath = decodeURIComponent(backgroundImage.replace('file:///', ''));
        setBackgroundImage(convertFileSrc(filePath));
      } catch (err) {
        console.error('Failed to convert background image URL:', err);
        setBackgroundImage(null);
      }
    }
  }, [backgroundImage, setBackgroundImage]);

  const { audioBackendError, library } = usePlayerContext();
  const toast = useToast();
  const { toasts, removeToast } = toast;
  const dragDrop = useDragDrop({ addFolder: library.addFolder, refreshTracks: library.refreshTracks, toast });

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
      onDrop={dragDrop.handleDrop}
      onDragOver={dragDrop.handleDragOver}
      onDragLeave={dragDrop.handleDragLeave}
      style={{ 
        fontSize: `${fontSize}px`,
        background: `linear-gradient(to bottom right, ${colors.gradientFrom}, ${colors.gradientVia}, ${colors.gradientTo})`,
        // Apply theme-aware scrollbar colors via CSS custom properties
        '--scrollbar-track': colors.scrollbarTrack,
        '--scrollbar-thumb': colors.scrollbarThumb,
        '--theme-accent': colors.color,
        '--theme-selection': colors.selection || 'rgba(6, 182, 212, 0.2)',
      } as React.CSSProperties}
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
      {dragDrop.isDraggingExternal && (
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
