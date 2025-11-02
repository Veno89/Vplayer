import React, { createContext, useContext, useRef, useEffect, useState, useCallback } from 'react';

const AudioContextContext = createContext(null);

/**
 * AudioContextProvider creates a single Web Audio API context
 * shared by all components (Equalizer, Visualizer, etc.)
 */
export function AudioContextProvider({ children, audioElement }) {
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const analyserNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const eqFiltersRef = useRef([]);
  
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);

  // Initialize Web Audio API context (only once)
  useEffect(() => {
    if (!audioElement || isInitialized || sourceNodeRef.current) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        console.warn('Web Audio API not supported');
        setError('Web Audio API not supported');
        return;
      }

      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      // Create source from audio element - ONLY ONCE!
      const source = ctx.createMediaElementSource(audioElement);
      sourceNodeRef.current = source;

      // Create analyser for visualizer
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserNodeRef.current = analyser;

      // Create gain node
      const gainNode = ctx.createGain();
      gainNodeRef.current = gainNode;

      // Create 10-band EQ filters
      const frequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
      const filters = frequencies.map((freq, index) => {
        const filter = ctx.createBiquadFilter();
        
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === frequencies.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
        }
        
        filter.frequency.value = freq;
        filter.Q.value = 1.0;
        filter.gain.value = 0;
        
        return filter;
      });
      eqFiltersRef.current = filters;

      // Connect audio graph: source -> EQ filters -> analyser -> gain -> destination
      let prevNode = source;
      
      filters.forEach(filter => {
        prevNode.connect(filter);
        prevNode = filter;
      });
      
      prevNode.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      setIsInitialized(true);
      console.log('Web Audio API initialized successfully');

      // Resume context on user interaction
      const resume = () => {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(err => console.error('Failed to resume audio context:', err));
        }
      };
      
      document.addEventListener('click', resume, { once: true });
      document.addEventListener('keydown', resume, { once: true });

    } catch (err) {
      console.error('Failed to initialize Web Audio API:', err);
      setError(err.message);
    }

    return () => {
      // Cleanup on unmount
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(err => 
          console.error('Error closing audio context:', err)
        );
      }
    };
  }, [audioElement, isInitialized]);

  // Set EQ band gain
  const setEQBand = useCallback((bandIndex, value) => {
    if (!eqFiltersRef.current[bandIndex]) return;
    
    // Convert 0-100 range to -12 to +12 dB
    const gain = ((value - 50) / 50) * 12;
    eqFiltersRef.current[bandIndex].gain.value = gain;
  }, []);

  // Reset all EQ bands
  const resetEQ = useCallback(() => {
    eqFiltersRef.current.forEach(filter => {
      filter.gain.value = 0;
    });
  }, []);

  // Get frequency data for visualizer
  const getFrequencyData = useCallback(() => {
    if (!analyserNodeRef.current) return new Uint8Array(0);
    
    const bufferLength = analyserNodeRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNodeRef.current.getByteFrequencyData(dataArray);
    
    return dataArray;
  }, []);

  // Get time domain data for waveform
  const getTimeDomainData = useCallback(() => {
    if (!analyserNodeRef.current) return new Uint8Array(0);
    
    const bufferLength = analyserNodeRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNodeRef.current.getByteTimeDomainData(dataArray);
    
    return dataArray;
  }, []);

  const value = {
    audioContext: audioContextRef.current,
    analyserNode: analyserNodeRef.current,
    isInitialized,
    error,
    setEQBand,
    resetEQ,
    getFrequencyData,
    getTimeDomainData,
  };

  return (
    <AudioContextContext.Provider value={value}>
      {children}
    </AudioContextContext.Provider>
  );
}

export function useAudioContextAPI() {
  const context = useContext(AudioContextContext);
  if (!context) {
    // Return dummy functions if not initialized
    return {
      audioContext: null,
      analyserNode: null,
      isInitialized: false,
      error: null,
      setEQBand: () => {},
      resetEQ: () => {},
      getFrequencyData: () => new Uint8Array(0),
      getTimeDomainData: () => new Uint8Array(0),
    };
  }
  return context;
}