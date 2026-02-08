import { useCallback } from 'react';
import { useStore } from '../store/useStore';

/**
 * Custom hook that extracts playlist action handlers from PlaylistWindow.
 * This reduces the main component size and makes the logic more testable.
 * 
 * @param {Object} params - Hook parameters
 * @param {Object} params.playlists - Playlists hook instance
 * @param {Array} params.displayTracks - Currently displayed tracks
 * @param {number|null} params.currentTrack - Current track index
 * @param {Function} params.setCurrentTrack - Set current track
 * @param {number|null} params.draggedIndex - Dragged item index
 * @param {Function} params.setDraggedIndex - Set dragged index
 * @param {Function} params.setDragOverIndex - Set drag over index
 * @param {Function} params.setIsDraggingOver - Set external drag state
 * @param {Function} params.setContextMenu - Set context menu state
 * @param {Function} params.setShowNewPlaylistDialog - Show new playlist dialog
 * @param {string} params.newPlaylistName - New playlist name input
 * @param {Function} params.setNewPlaylistName - Set new playlist name
 * @param {Function} params.setSortConfig - Set sort config
 * @param {Function} params.onActiveTracksChange - Callback when active tracks change
 */
export function usePlaylistActions({
    playlists,
    displayTracks,
    currentTrack,
    setCurrentTrack,
    draggedIndex,
    setDraggedIndex,
    setDragOverIndex,
    setIsDraggingOver,
    setContextMenu,
    setShowNewPlaylistDialog,
    newPlaylistName,
    setNewPlaylistName,
    setSortConfig,
    onActiveTracksChange,
}) {
    // Sort handler
    const handleSort = useCallback((key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    }, [setSortConfig]);

    // Drag and drop handlers for playlist reordering
    const handleDragStart = useCallback((e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    }, [setDraggedIndex]);

    const handleDragOver = useCallback((e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIndex(index);
    }, [setDragOverIndex]);

    const handleDrop = useCallback(async (e, dropIndex) => {
        e.preventDefault();

        // Only handle internal reordering
        if (draggedIndex === null || draggedIndex === dropIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }

        const newTracks = [...displayTracks];
        const draggedTrack = newTracks[draggedIndex];
        newTracks.splice(draggedIndex, 1);
        newTracks.splice(dropIndex, 0, draggedTrack);

        const trackPositions = newTracks.map((track, idx) => [track.id, idx]);

        try {
            await playlists.reorderPlaylistTracks(playlists.currentPlaylist, trackPositions);
        } catch (err) {
            console.error('Failed to reorder tracks:', err);
        }

        setDraggedIndex(null);
        setDragOverIndex(null);
    }, [draggedIndex, displayTracks, playlists, setDraggedIndex, setDragOverIndex]);

    // Remove track from playlist
    const handleRemoveFromPlaylist = useCallback(async (track) => {
        if (!playlists.currentPlaylist) return;

        try {
            await playlists.removeTrackFromPlaylist(playlists.currentPlaylist, track.id);
        } catch (err) {
            console.error('Failed to remove track from playlist:', err);
        }
    }, [playlists]);

    // Handle external track drops
    const handleExternalDrop = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);

        console.log('[PlaylistWindow] handleExternalDrop called');
        let data = e.dataTransfer.getData('application/json');
        if (!data) {
            data = e.dataTransfer.getData('text/plain');
        }
        console.log('[PlaylistWindow] drop data:', data ? `${data.substring(0, 50)}...` : 'EMPTY');
        if (!data) return;

        try {
            const tracks = JSON.parse(data);

            if (!playlists.currentPlaylist) {
                console.warn('Please select or create a playlist first');
                return;
            }

            // Limit the number of tracks to prevent freezing
            const MAX_TRACKS_PER_DROP = 10000;
            if (tracks.length > MAX_TRACKS_PER_DROP) {
                console.warn(`Too many tracks (${tracks.length}). Maximum ${MAX_TRACKS_PER_DROP} tracks per drop.`);
                return;
            }

            console.log('Adding tracks to playlist:', tracks.length);
            await playlists.addTracksToPlaylist(playlists.currentPlaylist, tracks.map(t => t.id));
        } catch (err) {
            console.error('Drop failed:', err);
            alert('Failed to add tracks to playlist');
        }
    }, [playlists, setIsDraggingOver]);

    // Close context menu
    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, [setContextMenu]);

    // Handle track removal with confirmation
    const handleRemoveTrack = useCallback((index) => {
        const track = displayTracks[index];
        if (!track || !playlists.currentPlaylist) return;

        // Remove from playlist
        if (confirm(`Remove "${track.title}" from this playlist?`)) {
            playlists.removeTrackFromPlaylist(playlists.currentPlaylist, track.id);
        }

        // Adjust current track if needed
        if (currentTrack === index) {
            setCurrentTrack(Math.min(index, displayTracks.length - 2));
        } else if (currentTrack > index) {
            setCurrentTrack(currentTrack - 1);
        }

        closeContextMenu();
    }, [displayTracks, playlists, currentTrack, setCurrentTrack, closeContextMenu]);

    // Create new playlist
    const handleCreatePlaylist = useCallback(async () => {
        if (!newPlaylistName.trim()) return;

        try {
            const newPlaylist = await playlists.createPlaylist(newPlaylistName);
            setNewPlaylistName('');
            setShowNewPlaylistDialog(false);
            // Auto-select the new playlist
            if (newPlaylist && newPlaylist.id) {
                await playlists.setCurrentPlaylist(newPlaylist.id);
            }
        } catch (err) {
            alert('Failed to create playlist');
        }
    }, [newPlaylistName, playlists, setNewPlaylistName, setShowNewPlaylistDialog]);

    // Delete playlist
    const handleDeletePlaylist = useCallback(async (playlistId) => {
        console.log('[PlaylistWindow] Deleting playlist immediately, no confirmation:', playlistId);
        try {
            await playlists.deletePlaylist(playlistId);

            // Clear saved playlist if we deleted it
            const lastPlaylistId = useStore.getState().lastPlaylistId;
            if (lastPlaylistId === playlistId) {
                useStore.getState().setLastPlaylistId(null);
            }
        } catch (err) {
            alert('Failed to delete playlist');
        }
    }, [playlists]);

    // Switch to playlist
    const handleSelectPlaylist = useCallback((playlistId) => {
        playlists.setCurrentPlaylist(playlistId);
    }, [playlists]);

    // Track selection handler
    const handleTrackSelect = useCallback((index) => {
        if (onActiveTracksChange) {
            onActiveTracksChange(displayTracks);
        }
        setCurrentTrack(index);
    }, [displayTracks, onActiveTracksChange, setCurrentTrack]);

    return {
        // Sort
        handleSort,
        // Drag & drop
        handleDragStart,
        handleDragOver,
        handleDrop,
        // Track actions
        handleRemoveFromPlaylist,
        handleExternalDrop,
        handleRemoveTrack,
        handleTrackSelect,
        // Playlist management
        handleCreatePlaylist,
        handleDeletePlaylist,
        handleSelectPlaylist,
        // Context menu
        closeContextMenu,
    };
}
