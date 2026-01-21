import { Plus, Trash2 } from 'lucide-react';

/**
 * Horizontal playlist selector/tab bar
 */
export function PlaylistSelector({
    playlists,
    currentPlaylist,
    currentColors,
    onSelect,
    onNew,
    onDelete
}) {
    return (
        <div className="flex items-center gap-2 px-3">
            <div className="flex-1 overflow-x-auto flex gap-1">
                {playlists.map(pl => (
                    <button
                        key={pl.id}
                        onClick={() => onSelect(pl.id)}
                        className={`px-3 py-1 text-sm rounded whitespace-nowrap transition-colors ${currentPlaylist === pl.id
                                ? `${currentColors.accent} bg-slate-800`
                                : 'text-slate-400 hover:text-white hover:bg-slate-700'
                            }`}
                    >
                        {pl.name}
                    </button>
                ))}
            </div>
            <button
                onClick={onNew}
                className="p-1.5 hover:bg-slate-700 rounded transition-colors"
                title="New Playlist"
            >
                <Plus className="w-4 h-4 text-slate-400" />
            </button>
            {currentPlaylist && (
                <button
                    onClick={() => onDelete(currentPlaylist)}
                    className="p-1.5 hover:bg-red-900/50 rounded transition-colors"
                    title="Delete Playlist"
                >
                    <Trash2 className="w-4 h-4 text-red-400" />
                </button>
            )}
        </div>
    );
}
