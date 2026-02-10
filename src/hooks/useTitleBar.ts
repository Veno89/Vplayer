import { useEffect } from 'react';
import { useStore } from '../store/useStore';

/**
 * Updates the application title bar to show current track info.
 *
 * Reads `titleBarFormat` from settings and replaces placeholders:
 *   {title}, {artist}, {album}
 *
 * Falls back to "VPlayer" when no track is playing.
 * Mount once in VPlayer.tsx.
 */
export function useTitleBar(): void {
  const titleBarFormat = useStore(s => s.titleBarFormat);
  const currentTrack = useStore(s => s.currentTrack);
  const playing = useStore(s => s.playing);

  useEffect(() => {
    // Read fresh track data from store
    const state = useStore.getState();
    const tracks = state.activePlaybackTracks;
    const track = currentTrack !== null ? tracks?.[currentTrack] : null;

    if (!track || titleBarFormat === 'VPlayer') {
      document.title = 'VPlayer';
      return;
    }

    const formatted = titleBarFormat
      .replace(/\{title\}/g, track.title || track.name || 'Unknown')
      .replace(/\{artist\}/g, track.artist || 'Unknown Artist')
      .replace(/\{album\}/g, track.album || 'Unknown Album');

    document.title = playing ? formatted : `VPlayer`;
  }, [titleBarFormat, currentTrack, playing]);
}
