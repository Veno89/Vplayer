import React, { useState, useEffect } from 'react';
import { X, Save, Disc, Mic, Music, Calendar } from 'lucide-react';
import { TauriAPI } from '../services/TauriAPI';
import { formatDuration } from '../utils/formatters';

export function TrackInfoDialog({ track, onClose, onSave }) {
    const [formData, setFormData] = useState({
        title: '',
        artist: '',
        album: '',
        genre: '',
        year: '',
        trackNumber: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (track) {
            setFormData({
                title: track.title || '',
                artist: track.artist || '',
                album: track.album || '',
                genre: track.genre || '',
                year: track.year || '',
                trackNumber: track.trackNumber || ''
            });
        }
    }, [track]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            // Create tags object - only include changed/present values
            const tags = {
                title: formData.title,
                artist: formData.artist,
                album: formData.album,
                genre: formData.genre,
                year: formData.year ? parseInt(formData.year) : undefined,
                // trackNumber not always editable reliably depending on backend, but we send it
            };

            await TauriAPI.updateTrackTags(track.id, track.path, tags);
            if (onSave) onSave(); // Callback to refresh list
            onClose();
        } catch (err) {
            console.error('Failed to update tags:', err);
            setError('Failed to update tags. File might be read-only or in use.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!track) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10002] backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-800 rounded-xl w-full max-w-lg shadow-2xl border border-slate-700 overflow-hidden flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Music className="w-5 h-5 text-cyan-400" />
                        Track Info & Editor
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {error && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded text-red-200 text-sm">
                            {error}
                        </div>
                    )}

                    <form id="tag-form" onSubmit={handleSubmit} className="space-y-4">
                        {/* Title */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Title</label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                className="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                                placeholder="Track Title"
                            />
                        </div>

                        {/* Artist & Album */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Mic className="w-3 h-3" /> Artist
                                </label>
                                <input
                                    type="text"
                                    value={formData.artist}
                                    onChange={e => setFormData({ ...formData, artist: e.target.value })}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                                    placeholder="Artist"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Disc className="w-3 h-3" /> Album
                                </label>
                                <input
                                    type="text"
                                    value={formData.album}
                                    onChange={e => setFormData({ ...formData, album: e.target.value })}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                                    placeholder="Album"
                                />
                            </div>
                        </div>

                        {/* Genre & Year */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Genre</label>
                                <input
                                    type="text"
                                    value={formData.genre}
                                    onChange={e => setFormData({ ...formData, genre: e.target.value })}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                                    placeholder="Genre"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> Year
                                </label>
                                <input
                                    type="text"
                                    value={formData.year}
                                    onChange={e => setFormData({ ...formData, year: e.target.value })}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                                    placeholder="Year"
                                />
                            </div>
                        </div>

                        {/* Read-only File Info */}
                        <div className="mt-6 pt-4 border-t border-slate-700/50 space-y-2">
                            <h3 className="text-sm font-medium text-slate-300 mb-2">File Properties</h3>
                            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                                <span className="text-slate-500">Duration:</span>
                                <span className="text-slate-300 font-mono">{formatDuration(track.duration)}</span>

                                <span className="text-slate-500">Path:</span>
                                <span className="text-slate-300 break-all select-all text-xs" title={track.path}>{track.path}</span>

                                <span className="text-slate-500">Size:</span>
                                <span className="text-slate-300 font-mono">{(track.size / 1024 / 1024).toFixed(2)} MB</span>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-700 bg-slate-900/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-600"
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="tag-form"
                        className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-900/20 disabled:opacity-50 flex items-center gap-2"
                        disabled={isLoading}
                    >
                        {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}

function Loader({ className }) {
    return (
        <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
}
