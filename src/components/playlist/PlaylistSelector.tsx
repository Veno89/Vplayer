import type { ReactNode } from 'react';
interface Props {
  playlists: { id: string; name: string }[];
  currentPlaylist: string | null;
  currentColors: { accent?: string };
  onSelect: (id: string) => void;
  actions: ReactNode;
}
export function PlaylistSelector({
  playlists,
  currentPlaylist,
  currentColors,
  onSelect,
  actions,
}: Props) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-3">
      <div
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        aria-label="Choose playlist"
      >
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            aria-pressed={currentPlaylist === playlist.id}
            onClick={() => onSelect(playlist.id)}
            className={`whitespace-nowrap rounded-sm px-3 py-1 text-sm transition-colors ${currentPlaylist === playlist.id ? `${currentColors.accent} bg-slate-800` : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
            {playlist.name}
          </button>
        ))}
      </div>
      {actions}
    </div>
  );
}
