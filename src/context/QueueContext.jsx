import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../utils/constants';

const QueueContext = createContext();

/**
 * QueueProvider manages the playback queue separate from playlists.
 * The queue represents the upcoming tracks to be played.
 */
export function QueueProvider({ children }) {
  // Load persisted queue
  const persistedQueue = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUEUE);
      return raw ? JSON.parse(raw) : { items: [], history: [] };
    } catch {
      return { items: [], history: [] };
    }
  })();

  const [queue, setQueue] = useState(persistedQueue.items || []);
  const [queueHistory, setQueueHistory] = useState(persistedQueue.history || []);
  const [queueIndex, setQueueIndex] = useState(0);

  // Persist queue to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify({
        items: queue,
        history: queueHistory.slice(-50), // Keep last 50 history items
      }));
    } catch (err) {
      console.warn('Failed to persist queue:', err);
    }
  }, [queue, queueHistory]);

  // Add track(s) to queue
  const addToQueue = useCallback((tracks, position = 'end') => {
    const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
    
    setQueue(prev => {
      if (position === 'end') {
        return [...prev, ...tracksArray];
      } else if (position === 'next') {
        // Insert after current position
        const newQueue = [...prev];
        newQueue.splice(queueIndex + 1, 0, ...tracksArray);
        return newQueue;
      } else if (position === 'start') {
        return [...tracksArray, ...prev];
      }
      return prev;
    });
  }, [queueIndex]);

  // Remove track from queue
  const removeFromQueue = useCallback((index) => {
    setQueue(prev => {
      const newQueue = [...prev];
      newQueue.splice(index, 1);
      return newQueue;
    });
    
    // Adjust queue index if needed
    if (index < queueIndex) {
      setQueueIndex(prev => Math.max(0, prev - 1));
    }
  }, [queueIndex]);

  // Clear entire queue
  const clearQueue = useCallback(() => {
    setQueue([]);
    setQueueIndex(0);
  }, []);

  // Move to next in queue
  const nextInQueue = useCallback(() => {
    if (queueIndex < queue.length - 1) {
      const currentTrack = queue[queueIndex];
      if (currentTrack) {
        setQueueHistory(prev => [...prev, currentTrack]);
      }
      setQueueIndex(prev => prev + 1);
      return queue[queueIndex + 1];
    }
    return null;
  }, [queue, queueIndex]);

  // Move to previous in queue
  const previousInQueue = useCallback(() => {
    if (queueIndex > 0) {
      setQueueIndex(prev => prev - 1);
      return queue[queueIndex - 1];
    } else if (queueHistory.length > 0) {
      // Go back in history
      const lastHistoryTrack = queueHistory[queueHistory.length - 1];
      setQueueHistory(prev => prev.slice(0, -1));
      return lastHistoryTrack;
    }
    return null;
  }, [queue, queueIndex, queueHistory]);

  // Get current track in queue
  const getCurrentQueueTrack = useCallback(() => {
    return queue[queueIndex] || null;
  }, [queue, queueIndex]);

  // Get next track in queue without advancing
  const peekNextInQueue = useCallback(() => {
    return queue[queueIndex + 1] || null;
  }, [queue, queueIndex]);

  // Replace entire queue
  const replaceQueue = useCallback((newTracks, startIndex = 0) => {
    setQueue(newTracks);
    setQueueIndex(startIndex);
    setQueueHistory([]);
  }, []);

  // Shuffle queue
  const shuffleQueue = useCallback(() => {
    const currentTrack = queue[queueIndex];
    const otherTracks = queue.filter((_, i) => i !== queueIndex);
    
    // Fisher-Yates shuffle
    for (let i = otherTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
    }
    
    // Put current track at the start
    const newQueue = currentTrack ? [currentTrack, ...otherTracks] : otherTracks;
    setQueue(newQueue);
    setQueueIndex(0);
  }, [queue, queueIndex]);

  // Move track within queue
  const moveInQueue = useCallback((fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    
    setQueue(prev => {
      const newQueue = [...prev];
      const [movedTrack] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, movedTrack);
      return newQueue;
    });
    
    // Adjust queue index if needed
    if (fromIndex === queueIndex) {
      setQueueIndex(toIndex);
    } else if (fromIndex < queueIndex && toIndex >= queueIndex) {
      setQueueIndex(prev => prev - 1);
    } else if (fromIndex > queueIndex && toIndex <= queueIndex) {
      setQueueIndex(prev => prev + 1);
    }
  }, [queueIndex]);

  const value = {
    queue,
    queueIndex,
    queueHistory,
    addToQueue,
    removeFromQueue,
    clearQueue,
    nextInQueue,
    previousInQueue,
    getCurrentQueueTrack,
    peekNextInQueue,
    replaceQueue,
    shuffleQueue,
    moveInQueue,
  };

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

/**
 * Hook to access queue context
 */
export function useQueue() {
  const context = useContext(QueueContext);
  
  if (!context) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  
  return context;
}
