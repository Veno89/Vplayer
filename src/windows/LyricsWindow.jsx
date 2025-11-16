import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Window } from '../components/Window';
import { useStore } from '../store/useStore';

/**
 * LyricsWindow - Display synchronized lyrics for the current track
 * 
 * Features:
 * - Auto-loads lyrics from .lrc file matching track filename
 * - Syncs lyrics with playback progress
 * - Shows current line highlighted with next line preview
 * - Displays metadata (title, artist, album)
 * - Graceful fallback when no lyrics found
 */
export default function LyricsWindow({ id, onClose }) {
  const [lyrics, setLyrics] = useState(null);
  const [currentLine, setCurrentLine] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const currentTrack = useStore((state) => state.currentTrack);
  const progress = useStore((state) => state.progress);

  // Load lyrics when track changes
  useEffect(() => {
    if (!currentTrack?.path) {
      setLyrics(null);
      setError(null);
      setCurrentLine(null);
      return;
    }

    setLoading(true);
    setError(null);

    invoke('load_lyrics', { trackPath: currentTrack.path })
      .then((lrc) => {
        setLyrics(lrc);
        setError(null);
      })
      .catch((err) => {
        setLyrics(null);
        setError(err);
      })
      .finally(() => setLoading(false));
  }, [currentTrack?.path]);

  // Update current line based on progress
  useEffect(() => {
    if (!lyrics?.lines || lyrics.lines.length === 0) {
      setCurrentLine(null);
      return;
    }

    // Find the current lyric line based on progress
    let current = null;
    for (let i = lyrics.lines.length - 1; i >= 0; i--) {
      if (progress >= lyrics.lines[i].timestamp) {
        current = i;
        break;
      }
    }
    
    setCurrentLine(current);
  }, [progress, lyrics]);

  return (
    <Window
      id={id}
      title="Lyrics"
      onClose={onClose}
      className="w-[500px] h-[600px]"
    >
      <div className="flex flex-col h-full p-6 overflow-hidden">
        {/* Metadata section */}
        {lyrics?.metadata && (
          <div className="mb-6 pb-4 border-b border-gray-700">
            {lyrics.metadata.title && (
              <h2 className="text-xl font-bold text-white mb-1">
                {lyrics.metadata.title}
              </h2>
            )}
            {lyrics.metadata.artist && (
              <p className="text-gray-400 text-sm">{lyrics.metadata.artist}</p>
            )}
            {lyrics.metadata.album && (
              <p className="text-gray-500 text-xs mt-1">{lyrics.metadata.album}</p>
            )}
          </div>
        )}

        {/* Lyrics content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading lyrics...
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-center h-full text-gray-500 text-center">
              <div>
                <p className="text-gray-400 mb-2">No lyrics available</p>
                <p className="text-xs text-gray-600">
                  Place an .lrc file with the same name as your track
                </p>
              </div>
            </div>
          )}

          {lyrics && !loading && !error && (
            <div className="space-y-4">
              {lyrics.lines.map((line, index) => {
                const isCurrent = index === currentLine;
                const isNext = index === currentLine + 1;

                return (
                  <div
                    key={index}
                    className={`transition-all duration-300 ${
                      isCurrent
                        ? 'text-white text-xl font-semibold scale-105'
                        : isNext
                        ? 'text-gray-400 text-lg'
                        : 'text-gray-600 text-base'
                    }`}
                  >
                    {line.text}
                  </div>
                );
              })}
            </div>
          )}

          {!currentTrack && !loading && (
            <div className="flex items-center justify-center h-full text-gray-500">
              No track playing
            </div>
          )}
        </div>
      </div>
    </Window>
  );
}
