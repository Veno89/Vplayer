import { Search, X } from 'lucide-react';
import type { RefObject } from 'react';

interface PlaylistSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Search bar for filtering playlist tracks
 */
export function PlaylistSearchBar({
  value,
  onChange,
  onClear,
  inputRef,
}: PlaylistSearchBarProps) {
  return (
    <div className="px-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          ref={inputRef}
          aria-label="Search playlist"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              onClear();
            }
          }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-800/50 border border-slate-700 rounded-sm pl-10 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        />
        {value && (
          <button
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded-sm transition-colors"
            title="Clear search"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>
    </div>
  );
}
