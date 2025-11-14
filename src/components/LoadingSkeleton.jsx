import React from 'react';

export function LoadingSkeleton({ type = 'track', count = 5 }) {
  if (type === 'track') {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 p-2 rounded animate-pulse"
          >
            <div className="w-8 h-8 bg-slate-700 rounded"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-700 rounded w-3/4"></div>
              <div className="h-3 bg-slate-700 rounded w-1/2"></div>
            </div>
            <div className="w-12 h-4 bg-slate-700 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'album') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="space-y-2 animate-pulse">
            <div className="aspect-square bg-slate-700 rounded-lg"></div>
            <div className="h-4 bg-slate-700 rounded w-3/4"></div>
            <div className="h-3 bg-slate-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'stats') {
    return (
      <div className="space-y-4">
        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="p-4 rounded-lg bg-slate-800/30 border border-slate-700 animate-pulse"
            >
              <div className="h-4 bg-slate-700 rounded w-1/2 mb-3"></div>
              <div className="h-8 bg-slate-700 rounded w-3/4"></div>
            </div>
          ))}
        </div>

        {/* Lists */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div
              key={idx}
              className="p-4 rounded-lg bg-slate-800/30 border border-slate-700 animate-pulse"
            >
              <div className="h-5 bg-slate-700 rounded w-1/3 mb-4"></div>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-700 rounded"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-700 rounded w-3/4"></div>
                      <div className="h-3 bg-slate-700 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'playlist') {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700 animate-pulse"
          >
            <div className="w-12 h-12 bg-slate-700 rounded"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-700 rounded w-1/3"></div>
              <div className="h-3 bg-slate-700 rounded w-1/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Default skeleton
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="h-12 bg-slate-700 rounded"></div>
      ))}
    </div>
  );
}
