import { List, ArrowDown, ArrowDownToLine } from 'lucide-react';

/**
 * Playlist header with title, track count, and scroll controls
 */
export function PlaylistHeader({
    playlistName,
    trackCount,
    totalTracks,
    searchQuery,
    autoScroll,
    onToggleAutoScroll,
    onScrollToCurrentTrack,
    showScrollButton,
    currentColors
}) {
    return (
        <div className="flex items-center justify-between px-3">
            <h3 className="text-white font-semibold flex items-center gap-2">
                <List className={`w-5 h-5 ${currentColors.accent}`} />
                {playlistName || 'Select a Playlist'}
            </h3>
            <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">
                    {trackCount} track{trackCount !== 1 ? 's' : ''}
                    {searchQuery && totalTracks !== trackCount && (
                        <span className={`ml-1 ${currentColors.accent}`}>
                            (filtered from {totalTracks})
                        </span>
                    )}
                </span>
                {/* Auto-scroll toggle */}
                <button
                    onClick={onToggleAutoScroll}
                    className={`p-1.5 rounded transition-colors ${autoScroll
                            ? `${currentColors.accent} bg-slate-800`
                            : 'text-slate-400 hover:bg-slate-700'
                        }`}
                    title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
                >
                    <ArrowDown className="w-4 h-4" />
                </button>
                {/* Manual scroll to current track button */}
                {showScrollButton && (
                    <button
                        onClick={onScrollToCurrentTrack}
                        className="p-1.5 text-slate-400 hover:bg-slate-700 rounded transition-colors"
                        title="Jump to current track"
                    >
                        <ArrowDownToLine className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
