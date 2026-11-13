import { useEffect, useState } from 'react';
import { TauriAPI } from '../services/TauriAPI';
import { useToast } from './useToast';
import type { Track } from '../types';

/** Full metadata is requested only by collection-wide tools when they are opened. */
export function useCatalogTracks(revision: number) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const { showError } = useToast();
  useEffect(() => {
    let active = true;
    TauriAPI.getAllTracks().then(value => { if (active) setTracks(value); })
      .catch(error => { if (active) showError('Unable to load collection: ' + String(error)); });
    return () => { active = false; };
  }, [revision, showError]);
  return tracks;
}
