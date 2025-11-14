import { useState, useEffect } from 'react';
import TauriAPI from '../services/TauriAPI';

export default function AlbumArt({ trackId, trackPath, size = 'medium', className = '' }) {
  const [artData, setArtData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!trackId || !trackPath) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadAlbumArt = async () => {
      try {
        setLoading(true);
        setError(false);
        
        const base64Data = await TauriAPI.extractAndCacheAlbumArt(trackId, trackPath);
        
        if (mounted) {
          if (base64Data) {
            setArtData(`data:image/jpeg;base64,${base64Data}`);
          } else {
            setError(true);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load album art:', err);
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadAlbumArt();

    return () => {
      mounted = false;
    };
  }, [trackId, trackPath]);

  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-16 h-16',
    large: 'w-32 h-32',
    xlarge: 'w-48 h-48',
  };

  const sizeClass = sizeClasses[size] || sizeClasses.medium;

  if (loading) {
    return (
      <div className={`${sizeClass} ${className} bg-gray-700 rounded animate-pulse flex items-center justify-center`}>
        <svg className="w-1/2 h-1/2 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
        </svg>
      </div>
    );
  }

  if (error || !artData) {
    return (
      <div className={`${sizeClass} ${className} bg-gray-700 rounded flex items-center justify-center`}>
        <svg className="w-1/2 h-1/2 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={artData}
      alt="Album Art"
      className={`${sizeClass} ${className} rounded object-cover`}
      onError={() => setError(true)}
    />
  );
}
