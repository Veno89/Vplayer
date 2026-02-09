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

interface PlaylistColumnHeadersProps {
    sortConfig: SortConfig;
    onSort: (columnKey: string) => void;
    columnWidths: ColumnWidths;
    onColumnResize: (updater: (prev: ColumnWidths) => ColumnWidths) => void;
}

/**
 * Sortable column headers for playlist track list
 */
export function PlaylistColumnHeaders({
    sortConfig,
    onSort,
    columnWidths,
    onColumnResize
}: PlaylistColumnHeadersProps) {
    const SortIndicator = ({ columnKey }: { columnKey: string }) => {
        if (sortConfig.key !== columnKey) return null;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="w-3 h-3" />
            : <ArrowDown className="w-3 h-3" />;
    };

    const handleResize = (columnKey: string, startX: number) => {
        const startWidth = columnWidths[columnKey];

        const handleMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - startX;
            onColumnResize(prev => ({
                ...prev,
                [columnKey]: Math.max(50, startWidth + delta)
            }));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const Resizer = ({ columnKey }: { columnKey: string }) => (
        <div
            className="absolute right-0 top-0 bottom-0 w-2 flex justify-center cursor-col-resize z-10 group"
            style={{ marginRight: -4 }} /* Center on the border */
            onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleResize(columnKey, e.clientX);
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Always visible border line */}
            <div className="w-px h-full bg-slate-600 group-hover:bg-cyan-400 group-hover:w-0.5 transition-all" />
        </div>
    );

    return (
        <div className="flex items-center px-3 text-xs text-slate-500 font-medium border-b border-slate-700 pb-2 select-none">
            {/* Checkbox spacer */}
            <span className="w-6 mr-1"></span>

            {/* Number (resizable) */}
            <div
                className="relative flex items-center justify-center flex-shrink-0 px-1"
                style={{ width: columnWidths.number || 40 }}
            >
                #
                <Resizer columnKey="number" />
            </div>

            {/* Title (fixed width, resizable like other columns) */}
            <div
                className="relative flex items-center gap-1 cursor-pointer hover:text-cyan-400 transition-colors px-1"
                style={{ width: columnWidths.title }}
                onClick={() => onSort('title')}
            >
                Title
                <SortIndicator columnKey="title" />
                <Resizer columnKey="title" />
            </div>

            {/* Artist */}
            <div
                className="relative flex items-center gap-1 cursor-pointer hover:text-cyan-400 transition-colors px-1"
                style={{ width: columnWidths.artist }}
                onClick={() => onSort('artist')}
            >
                Artist
                <SortIndicator columnKey="artist" />
                <Resizer columnKey="artist" />
            </div>

            {/* Album */}
            <div
                className="relative hidden lg:flex items-center gap-1 cursor-pointer hover:text-cyan-400 transition-colors px-1"
                style={{ width: columnWidths.album }}
                onClick={() => onSort('album')}
            >
                Album
                <SortIndicator columnKey="album" />
                <Resizer columnKey="album" />
            </div>

            {/* Rating */}
            <div
                className="relative flex justify-center items-center gap-1 cursor-pointer hover:text-cyan-400 transition-colors px-1"
                style={{ width: columnWidths.rating }}
                onClick={() => onSort('rating')}
            >
                Rating
                <SortIndicator columnKey="rating" />
                <Resizer columnKey="rating" />
            </div>

            {/* Duration */}
            <div
                className="relative flex justify-end items-center gap-1 cursor-pointer hover:text-cyan-400 transition-colors px-1"
                style={{ width: columnWidths.duration }}
                onClick={() => onSort('duration')}
            >
                Dur.
                <SortIndicator columnKey="duration" />
            </div>

            {/* Menu spacer */}
            <span className="w-8 ml-2"></span>
        </div>
    );
}
