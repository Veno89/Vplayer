import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * useAudioContext creates and manages a Web Audio API context
 * for advanced audio processing, EQ, and visualization.
 */
export function useAudioContext(audioElement) {
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const analyserNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const eqFiltersRef = useRef([]);
  
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Web Audio API context
  const initialize = useCallback(() => {
    if (!audioElement || isInitialized) return;

    try {
      // Create audio context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        console.warn('Web Audio API not supported');
        return;
      }

      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      // Create source from audio element
      const source = ctx.createMediaElementSource(audioElement);
      sourceNodeRef.current = source;

      // Create analyser for visualizer
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; // 128 frequency bins
      analyser.smoothingTimeConstant = 0.8;
      analyserNodeRef.current = analyser;

      // Create gain node for master volume
      const gainNode = ctx.createGain();
      gainNodeRef.current = gainNode;

      // Create EQ filters (10-band equalizer)
      const frequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
      const filters = frequencies.map((freq, index) => {
        const filter = ctx.createBiquadFilter();
        
        // Use different filter types for different frequencies
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === frequencies.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
        }
        
        filter.frequency.value = freq;
        filter.Q.value = 1.0;
        filter.gain.value = 0; // Start at neutral (0 dB)
        
        return filter;
      });
      eqFiltersRef.current = filters;

      // Connect audio graph: source -> EQ filters -> analyser -> gain -> destination
      let prevNode = source;
      
      // Chain EQ filters
      filters.forEach(filter => {
        prevNode.connect(filter);
        prevNode = filter;
      });
      
      // Connect to analyser and gain
      prevNode.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      setIsInitialized(true);
      console.log('Web Audio API initialized successfully');
    } catch (err) {
      console.error('Failed to initialize Web Audio API:', err);
    }
  }, [audioElement, isInitialized]);

  // Set EQ band gain (-12 to +12 dB)
  const setEQBand = useCallback((bandIndex, value) => {
    if (!eqFiltersRef.current[bandIndex]) return;
    
    // Convert 0-100 range to -12 to +12 dB
    const gain = ((value - 50) / 50) * 12;
    eqFiltersRef.current[bandIndex].gain.value = gain;
  }, []);

  // Reset all EQ bands to neutral
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

  // Get time domain data for waveform visualization
  const getTimeDomainData = useCallback(() => {
    if (!analyserNodeRef.current) return new Uint8Array(0);
    
    const bufferLength = analyserNodeRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNodeRef.current.getByteTimeDomainData(dataArray);
    
    return dataArray;
  }, []);

  // Resume audio context (required after user interaction)
  const resume = useCallback(async () => {
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch (err) {
        console.error('Failed to resume audio context:', err);
      }
    }
  }, []);

  // Initialize when audio element is available
  useEffect(() => {
    if (audioElement && !isInitialized) {
      initialize();
    }
  }, [audioElement, isInitialized, initialize]);

  // Resume context on user interaction (browser requirement)
  useEffect(() => {
    const handleInteraction = () => {
      resume();
    };

    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, [resume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    audioContext: audioContextRef.current,
    analyserNode: analyserNodeRef.current,
    isInitialized,
    setEQBand,
    resetEQ,
    getFrequencyData,
    getTimeDomainData,
    resume,
  };
}