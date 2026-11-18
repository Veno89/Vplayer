import { useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

export interface SortConfig {
  key: string | null;
  direction: 'asc' | 'desc';
}
export interface ColumnWidths {
  number: number;
  title: number;
  artist: number;
  album: number;
  rating: number;
  duration: number;
  [key: string]: number;
}
interface Props {
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  columnWidths: ColumnWidths;
  onColumnResize: (updater: (previous: ColumnWidths) => ColumnWidths) => void;
  showArtist?: boolean;
  showAlbum?: boolean;
  showRating?: boolean;
  showNumber?: boolean;
}
export function PlaylistColumnHeaders({
  sortConfig,
  onSort,
  columnWidths,
  onColumnResize,
  showArtist = true,
  showAlbum = true,
  showRating = true,
  showNumber = true,
}: Props) {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const resize = (key: string, startX: number) => {
    cleanup.current?.();
    const width = columnWidths[key];
    const previousCursor = document.body.style.cursor;
    const move = (event: MouseEvent) =>
      onColumnResize((previous) => ({
        ...previous,
        [key]: Math.max(
          key === 'number' ? 28 : 60,
          Math.min(600, width + event.clientX - startX)
        ),
      }));
    const stop = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', stop);
      document.body.style.cursor = previousCursor;
      cleanup.current = null;
    };
    cleanup.current = stop;
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
  };
  const columns = [
    ...(showNumber ? [['number', '#']] : []),
    ['title', 'Title'],
    ...(showArtist ? [['artist', 'Artist']] : []),
    ...(showAlbum ? [['album', 'Album']] : []),
    ...(showRating ? [['rating', 'Rating']] : []),
    ['duration', 'Time'],
  ];
  return (
    <div className="flex items-center border-b border-slate-700 px-3 py-2 text-xs text-slate-400 select-none">
      <span className="w-6 shrink-0" />
      {columns.map(([key, label]) => (
        <div
          key={key}
          className="relative shrink-0 px-1"
          style={{ width: columnWidths[key] }}
        >
          <button
            className={`flex w-full items-center gap-1 hover:text-white ${key === 'rating' || key === 'number' ? 'justify-center' : key === 'duration' ? 'justify-end' : ''}`}
            aria-label={
              key === 'number'
                ? 'Original order'
                : `Sort by ${label.toLowerCase()}`
            }
            title={
              sortConfig.key === key
                ? `${label}: ${sortConfig.direction === 'asc' ? 'ascending' : 'descending'}`
                : label
            }
            onClick={() => onSort(key)}
          >
            {label}
            {sortConfig.key === key &&
              (sortConfig.direction === 'asc' ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              ))}
          </button>
          {key !== 'duration' && (
            <span
              role="separator"
              tabIndex={0}
              aria-label={`Resize ${label.toLowerCase()} column`}
              aria-orientation="vertical"
              aria-valuenow={columnWidths[key]}
              aria-valuemin={28}
              aria-valuemax={600}
              className="absolute right-0 top-0 h-full w-1 cursor-col-resize border-r border-slate-700 hover:border-cyan-400"
              onMouseDown={(event) => {
                event.preventDefault();
                resize(key, event.clientX);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  onColumnResize((previous) => ({
                    ...previous,
                    [key]: Math.max(
                      60,
                      Math.min(
                        600,
                        columnWidths[key] +
                          (event.key === 'ArrowRight' ? 10 : -10)
                      )
                    ),
                  }));
                }
              }}
            />
          )}
        </div>
      ))}
      <span className="w-8 shrink-0" />
    </div>
  );
}
