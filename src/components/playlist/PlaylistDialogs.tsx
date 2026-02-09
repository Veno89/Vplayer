import { createPortal } from 'react-dom';
import { StarRating } from '../StarRating';
import type { Track, Playlist } from '../../types';
import type { ColorScheme } from '../../store/types';

interface NewPlaylistDialogProps {
    isOpen: boolean;
    name: string;
    onNameChange: (name: string) => void;
    onCreate: () => void;
    onClose: () => void;
    currentColors: ColorScheme;
}

interface PlaylistPickerDialogProps {
    track: Track | null;
    playlists: Playlist[];
    onAdd: (playlistId: string, trackId: string) => void;
    onClose: () => void;
}

interface RatingDialogProps {
    track: Track | null;
    onRate: (trackId: string, rating: number) => void;
    onClose: () => void;
}

interface BatchPlaylistPickerDialogProps {
    isOpen: boolean;
    selectedCount: number;
    playlists: Playlist[];
    onAdd: (playlistId: string) => void;
    onClose: () => void;
}

/**
 * New Playlist Dialog
 */
export function NewPlaylistDialog({
    isOpen,
    name,
    onNameChange,
    onCreate,
    onClose,
    currentColors
}: NewPlaylistDialogProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-4 w-80 shadow-xl">
                <h3 className="text-white font-semibold mb-3">New Playlist</h3>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onCreate()}
                    placeholder="Playlist name"
                    className="w-full px-3 py-2 bg-slate-900 text-white rounded border border-slate-700 focus:outline-none focus:border-blue-500 mb-3"
                    autoFocus
                />
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onCreate}
                        className={`px-3 py-1.5 text-sm text-white rounded transition-colors ${currentColors.accent} bg-slate-900 hover:bg-slate-800`}
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Playlist Picker Dialog - Select playlist to add track to
 */
export function PlaylistPickerDialog({
    track,
    playlists,
    onAdd,
    onClose
}: PlaylistPickerDialogProps) {
    if (!track) return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]"
            onClick={onClose}
        >
            <div
                className="bg-slate-800 rounded-lg p-4 w-80 shadow-xl max-h-96 overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-white font-semibold mb-3">Add to Playlist</h3>
                <p className="text-slate-400 text-sm mb-3 truncate">
                    "{track.title || track.name}"
                </p>
                <div className="flex-1 overflow-y-auto space-y-1">
                    {playlists.length === 0 ? (
                        <p className="text-slate-500 text-sm text-center py-4">No playlists yet</p>
                    ) : (
                        playlists.map(pl => (
                            <button
                                key={pl.id}
                                onClick={() => onAdd(pl.id, track.id)}
                                className="w-full px-3 py-2 text-left text-sm text-white bg-slate-700/50 hover:bg-slate-700 rounded transition-colors"
                            >
                                {pl.name}
                            </button>
                        ))
                    )}
                </div>
                <div className="flex gap-2 justify-end mt-3 pt-3 border-t border-slate-700">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

/**
 * Rating Dialog - Set track rating
 */
export function RatingDialog({
    track,
    onRate,
    onClose
}: RatingDialogProps) {
    if (!track) return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]"
            onClick={onClose}
        >
            <div
                className="bg-slate-800 rounded-lg p-4 w-72 shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-white font-semibold mb-3">Set Rating</h3>
                <p className="text-slate-400 text-sm mb-4 truncate">
                    "{track.title || track.name}"
                </p>
                <div className="flex justify-center mb-4">
                    <StarRating
                        rating={track.rating || 0}
                        onRatingChange={(newRating) => onRate(track.id, newRating)}
                        size="lg"
                    />
                </div>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

/**
 * Batch Playlist Picker Dialog - Add multiple tracks to playlist
 */
export function BatchPlaylistPickerDialog({
    isOpen,
    selectedCount,
    playlists,
    onAdd,
    onClose
}: BatchPlaylistPickerDialogProps) {
    if (!isOpen || selectedCount === 0) return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]"
            onClick={onClose}
        >
            <div
                className="bg-slate-800 rounded-lg p-4 w-80 shadow-xl max-h-96 overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-white font-semibold mb-3">
                    Add {selectedCount} Tracks to Playlist
                </h3>
                <div className="flex-1 overflow-y-auto space-y-1">
                    {playlists.length === 0 ? (
                        <p className="text-slate-500 text-sm text-center py-4">No playlists yet</p>
                    ) : (
                        playlists.map(pl => (
                            <button
                                key={pl.id}
                                onClick={() => onAdd(pl.id)}
                                className="w-full px-3 py-2 text-left text-sm text-white bg-slate-700/50 hover:bg-slate-700 rounded transition-colors"
                            >
                                {pl.name}
                            </button>
                        ))
                    )}
                </div>
                <div className="flex gap-2 justify-end mt-3 pt-3 border-t border-slate-700">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
