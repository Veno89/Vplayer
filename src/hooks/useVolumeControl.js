import { useCallback } from 'react';

export function useVolumeControl({ 
  audio, 
  volume,
  setVolume,
  toast
}) {
  const handleVolumeChange = useCallback((newVolume) => {
    setVolume(newVolume);
    audio.changeVolume(newVolume).catch(err => {
      console.error('Failed to change volume:', err);
      toast.showError('Failed to change volume');
    });
  }, [audio, setVolume, toast]);

  return { handleVolumeChange };
}
