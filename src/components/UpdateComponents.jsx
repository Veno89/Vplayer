import React from 'react';
import { Download, X, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

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

/**
 * Update checker button for options/settings
 */
export function UpdateChecker({ 
  checking, 
  updateAvailable, 
  error, 
  onCheck, 
  currentColors 
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onCheck(false)}
        disabled={checking}
        className="flex items-center gap-2 px-3 py-2 rounded transition-colors"
        style={{ 
          backgroundColor: currentColors?.surface || '#1e1e1e',
          opacity: checking ? 0.7 : 1
        }}
      >
        <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
        <span>{checking ? 'Checking...' : 'Check for Updates'}</span>
      </button>
      
      {updateAvailable && (
        <div className="flex items-center gap-1 text-green-400">
          <CheckCircle size={16} />
          <span className="text-sm">Update available!</span>
        </div>
      )}
      
      {error && (
        <div className="flex items-center gap-1 text-red-400">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}
      
      {!updateAvailable && !error && !checking && (
        <span className="text-sm opacity-60">You're up to date</span>
      )}
    </div>
  );
}

/**
 * Update dialog modal
 */
export function UpdateDialog({ 
  updateInfo, 
  downloading, 
  downloadProgress, 
  error,
  onDownload, 
  onDismiss,
  currentColors 
}) {
  if (!updateInfo) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50">
      <div 
        className="w-full max-w-md p-6 rounded-lg shadow-xl"
        style={{ backgroundColor: currentColors?.background || '#121212' }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Update Available</h2>
            <p className="text-sm opacity-60">
              Version {updateInfo.version} is ready to install
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {updateInfo.body && (
          <div 
            className="mb-4 p-3 rounded text-sm max-h-48 overflow-y-auto"
            style={{ backgroundColor: currentColors?.surface || '#1e1e1e' }}
          >
            <h3 className="font-medium mb-2">What's new:</h3>
            <div className="opacity-80 whitespace-pre-wrap">{updateInfo.body}</div>
          </div>
        )}
        
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 text-red-400 rounded text-sm">
            {error}
          </div>
        )}
        
        {downloading ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Downloading...</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-300"
                style={{ 
                  width: `${downloadProgress}%`,
                  backgroundColor: currentColors?.accent || '#3b82f6'
                }}
              />
            </div>
            <p className="text-xs opacity-60">
              The app will restart automatically after installation
            </p>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={onDownload}
              className="flex-1 py-2 rounded font-medium transition-colors"
              style={{ backgroundColor: currentColors?.accent || '#3b82f6' }}
            >
              Download & Install
            </button>
            <button
              onClick={onDismiss}
              className="px-4 py-2 rounded font-medium transition-colors"
              style={{ backgroundColor: currentColors?.surface || '#1e1e1e' }}
            >
              Later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
