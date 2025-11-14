import React from 'react';
import { Music, ListMusic, Folder, Search, Sparkles, History, BarChart3 } from 'lucide-react';

export function EmptyState({ type = 'library', onAction }) {
  const states = {
    library: {
      icon: Folder,
      title: 'No music in your library',
      description: 'Add a folder to start building your music collection',
      actionText: 'Add Folder',
      actionKey: 'addFolder',
    },
    playlist: {
      icon: ListMusic,
      title: 'This playlist is empty',
      description: 'Add tracks to this playlist to start listening',
      actionText: 'Browse Library',
      actionKey: 'browseLibrary',
    },
    search: {
      icon: Search,
      title: 'No results found',
      description: 'Try adjusting your search terms or filters',
      actionText: 'Clear Search',
      actionKey: 'clearSearch',
    },
    queue: {
      icon: Music,
      title: 'Queue is empty',
      description: 'Add tracks to the queue from your library or playlists',
      actionText: null,
      actionKey: null,
    },
    smartPlaylist: {
      icon: Sparkles,
      title: 'No tracks match criteria',
      description: 'Adjust your smart playlist rules to include more tracks',
      actionText: 'Edit Rules',
      actionKey: 'editRules',
    },
    history: {
      icon: History,
      title: 'No listening history yet',
      description: 'Start playing music to build your listening history',
      actionText: 'Browse Library',
      actionKey: 'browseLibrary',
    },
    stats: {
      icon: BarChart3,
      title: 'No statistics available',
      description: 'Add music to your library to see statistics',
      actionText: 'Add Folder',
      actionKey: 'addFolder',
    },
    duplicates: {
      icon: Music,
      title: 'No duplicates found',
      description: 'Your library is clean! No duplicate tracks detected',
      actionText: null,
      actionKey: null,
    },
  };

  const state = states[type] || states.library;
  const Icon = state.icon;

  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
        <Icon className="w-10 h-10 text-slate-500" />
      </div>
      
      <h3 className="text-lg font-semibold text-white mb-2">
        {state.title}
      </h3>
      
      <p className="text-sm text-slate-400 max-w-md mb-6">
        {state.description}
      </p>
      
      {state.actionText && onAction && (
        <button
          onClick={() => onAction(state.actionKey)}
          onMouseDown={e => e.stopPropagation()}
          className="px-6 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-medium transition-colors"
        >
          {state.actionText}
        </button>
      )}
    </div>
  );
}
