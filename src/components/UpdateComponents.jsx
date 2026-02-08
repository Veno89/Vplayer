import React from 'react';
import { Download, X } from 'lucide-react';

/**
 * Update notification banner component
 */
export function UpdateBanner({ 
  updateInfo, 
  downloading, 
  downloadProgress, 
  onDownload, 
  onDismiss,
  currentColors 
}) {
  if (!updateInfo) return null;

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-[200] px-4 py-2 flex items-center justify-between gap-4"
      style={{ 
        backgroundColor: currentColors?.accent || '#3b82f6',
        color: 'white'
      }}
    >
      <div className="flex items-center gap-2">
        <Download size={18} />
        <span className="font-medium">
          Update available: v{updateInfo.version}
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {downloading ? (
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 bg-white/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <span className="text-sm">{downloadProgress}%</span>
          </div>
        ) : (
          <>
            <button
              onClick={onDownload}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
            >
              Download & Install
            </button>
            <button
              onClick={onDismiss}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
