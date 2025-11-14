import React, { useState } from 'react';
import { Search, Filter, X, ChevronDown, Star } from 'lucide-react';

/**
 * AdvancedSearch component - provides advanced filtering for tracks
 * @param {object} filters - Current filter values
 * @param {function} onFiltersChange - Callback when filters change
 * @param {boolean} showAdvanced - Whether to show advanced filters
 * @param {function} onToggleAdvanced - Toggle advanced filters visibility
 */
export function AdvancedSearch({ 
  filters = {}, 
  onFiltersChange, 
  showAdvanced = false, 
  onToggleAdvanced 
}) {
  const [localFilters, setLocalFilters] = useState({
    query: filters.query || '',
    genre: filters.genre || '',
    yearFrom: filters.yearFrom || '',
    yearTo: filters.yearTo || '',
    minRating: filters.minRating || 0,
    durationFrom: filters.durationFrom || '',
    durationTo: filters.durationTo || '',
    ...filters
  });

  const handleChange = (field, value) => {
    const newFilters = { ...localFilters, [field]: value };
    setLocalFilters(newFilters);
    if (onFiltersChange) {
      onFiltersChange(newFilters);
    }
  };

  const handleClearFilters = () => {
    const emptyFilters = {
      query: '',
      genre: '',
      yearFrom: '',
      yearTo: '',
      minRating: 0,
      durationFrom: '',
      durationTo: ''
    };
    setLocalFilters(emptyFilters);
    if (onFiltersChange) {
      onFiltersChange(emptyFilters);
    }
  };

  const hasActiveFilters = 
    localFilters.genre || 
    localFilters.yearFrom || 
    localFilters.yearTo || 
    localFilters.minRating > 0 || 
    localFilters.durationFrom || 
    localFilters.durationTo;

  return (
    <div className="space-y-3">
      {/* Basic Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={localFilters.query}
          onChange={(e) => handleChange('query', e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Search by title, artist, or album..."
          className="w-full pl-10 pr-10 py-2 bg-slate-800 text-white text-sm rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
        />
        {localFilters.query && (
          <button
            onClick={() => handleChange('query', '')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Advanced Filters Toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={onToggleAdvanced}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <Filter className="w-3 h-3" />
          Advanced Filters
          <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear Filters
          </button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-slate-800/50 rounded border border-slate-700">
          {/* Genre Filter */}
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Genre</label>
            <input
              type="text"
              value={localFilters.genre}
              onChange={(e) => handleChange('genre', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="e.g., Rock, Jazz, Classical..."
              className="w-full px-3 py-1.5 bg-slate-900 text-white text-sm rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Year Range */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Year From</label>
            <input
              type="number"
              value={localFilters.yearFrom}
              onChange={(e) => handleChange('yearFrom', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="1970"
              min="1900"
              max="2100"
              className="w-full px-3 py-1.5 bg-slate-900 text-white text-sm rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Year To</label>
            <input
              type="number"
              value={localFilters.yearTo}
              onChange={(e) => handleChange('yearTo', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="2025"
              min="1900"
              max="2100"
              className="w-full px-3 py-1.5 bg-slate-900 text-white text-sm rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Minimum Rating */}
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Minimum Rating</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="5"
                value={localFilters.minRating}
                onChange={(e) => handleChange('minRating', parseInt(e.target.value))}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex-1 h-1 accent-yellow-500"
              />
              <div className="flex items-center gap-1 w-16">
                <Star className={`w-3 h-3 ${localFilters.minRating > 0 ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'}`} />
                <span className="text-xs text-white">{localFilters.minRating}+</span>
              </div>
            </div>
          </div>

          {/* Duration Range (in minutes) */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Min Duration (min)</label>
            <input
              type="number"
              value={localFilters.durationFrom}
              onChange={(e) => handleChange('durationFrom', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="0"
              min="0"
              step="0.5"
              className="w-full px-3 py-1.5 bg-slate-900 text-white text-sm rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Max Duration (min)</label>
            <input
              type="number"
              value={localFilters.durationTo}
              onChange={(e) => handleChange('durationTo', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="10"
              min="0"
              step="0.5"
              className="w-full px-3 py-1.5 bg-slate-900 text-white text-sm rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
