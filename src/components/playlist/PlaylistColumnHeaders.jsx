import { ArrowUp, ArrowDown } from 'lucide-react';

/**
 * Sortable column headers for playlist track list
 */
export function PlaylistColumnHeaders({
    sortConfig,
    onSort
}) {
    const SortIndicator = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return null;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="w-3 h-3" />
            : <ArrowDown className="w-3 h-3" />;
    };

    return (
        <div className="flex items-center px-3 text-xs text-slate-500 font-medium border-b border-slate-700 pb-2 select-none">
            <span className="w-10 text-center">#</span>
            <div
                className="flex-1 flex items-center gap-1 cursor-pointer hover:text-cyan-400 transition-colors"
                onClick={() => onSort('title')}
            >
                Title
                <SortIndicator columnKey="title" />
            </div>
            <div
                className="w-40 flex items-center gap-1 cursor-pointer hover:text-cyan-400 transition-colors"
                onClick={() => onSort('artist')}
            >
                Artist
                <SortIndicator columnKey="artist" />
            </div>
            <div
                className="w-40 hidden lg:flex items-center gap-1 cursor-pointer hover:text-cyan-400 transition-colors"
                onClick={() => onSort('album')}
            >
                Album
                <SortIndicator columnKey="album" />
            </div>
            <span className="w-16 text-right">Duration</span>
            <span className="w-8"></span>
        </div>
    );
}
