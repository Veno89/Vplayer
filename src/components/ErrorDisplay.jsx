import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

/**
 * Standardized error display component
 */
export function ErrorDisplay({ 
  error, 
  onRetry, 
  onDismiss,
  variant = 'banner', // 'banner' | 'inline' | 'modal'
  title = 'Something went wrong',
}) {
  if (!error) return null;

  const message = error?.message || String(error);

  if (variant === 'banner') {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-red-900/90 backdrop-blur-sm text-white px-4 py-3 border-b border-red-700">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3 flex-1">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">{title}</div>
              <div className="text-sm text-red-200 mt-0.5">{message}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-sm flex items-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-1.5 hover:bg-red-800 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 text-red-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white mb-1">{title}</div>
            <div className="text-sm">{message}</div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-3 px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-sm flex items-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            )}
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 hover:bg-red-800/50 rounded transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-red-700 rounded-lg shadow-2xl max-w-md w-full mx-4">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-red-900/30 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-300">{message}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded font-medium transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
