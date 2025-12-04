import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { TauriAPI } from '../services/TauriAPI';
import { EVENTS } from '../utils/constants';

/**
 * Hook for managing library scan operations
 * Handles scan progress, events, and state
 */
export function useLibraryScan({ onScanComplete }) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanCurrent, setScanCurrent] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [scanCurrentFile, setScanCurrentFile] = useState('');

  // Listen for scan events
  useEffect(() => {
    const unlistenPromises = [];

    // Listen for folder changes (file watcher)
    unlistenPromises.push(
      listen('folder-changed', async (event) => {
        console.log('File system change detected:', event.payload);
        if (onScanComplete) {
          onScanComplete();
        }
      })
    );

    // Listen for total files count
    unlistenPromises.push(
      TauriAPI.onEvent(EVENTS.SCAN_TOTAL, (event) => {
        setScanTotal(event.payload);
        setScanCurrent(0);
        setScanProgress(0);
      })
    );

    // Listen for progress updates
    unlistenPromises.push(
      TauriAPI.onEvent(EVENTS.SCAN_PROGRESS, (event) => {
        const { current, total, current_file } = event.payload;
        setScanCurrent(current);
        setScanTotal(total);
        setScanCurrentFile(current_file);
        
        // Calculate percentage
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        setScanProgress(percent);
      })
    );

    // Listen for scan completion
    unlistenPromises.push(
      TauriAPI.onEvent(EVENTS.SCAN_COMPLETE, (event) => {
        console.log(`Scan complete: ${event.payload} tracks found`);
        setScanProgress(100);
        setScanCurrentFile('');
        
        // Reset scanning state after a short delay
        setTimeout(() => {
          setIsScanning(false);
          setScanProgress(0);
          setScanCurrent(0);
          setScanTotal(0);
          
          if (onScanComplete) {
            onScanComplete();
          }
        }, 1000);
      })
    );

    // Listen for scan cancellation
    unlistenPromises.push(
      TauriAPI.onEvent(EVENTS.SCAN_CANCELLED, (event) => {
        console.log(`Scan cancelled: ${event.payload} tracks processed`);
        setScanCurrentFile('Cancelled');
        
        // Reset scanning state
        setTimeout(() => {
          setIsScanning(false);
          setScanProgress(0);
          setScanCurrent(0);
          setScanTotal(0);
          setScanCurrentFile('');
        }, 1000);
      })
    );

    // Listen for scan errors
    unlistenPromises.push(
      TauriAPI.onEvent(EVENTS.SCAN_ERROR, (event) => {
        console.warn('Scan error:', event.payload);
      })
    );

    // Cleanup listeners on unmount
    return () => {
      Promise.all(unlistenPromises).then((unlistenFns) => {
        unlistenFns.forEach((fn) => fn && fn());
      }).catch(err => {
        console.warn('Failed to cleanup scan event listeners:', err);
      });
    };
  }, [onScanComplete]);

  const startScan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(0);
    setScanCurrent(0);
    setScanTotal(0);
    setScanCurrentFile('');
  }, []);

  const endScan = useCallback(() => {
    setIsScanning(false);
    setScanProgress(0);
    setScanCurrent(0);
    setScanTotal(0);
    setScanCurrentFile('');
  }, []);

  return {
    isScanning,
    scanProgress,
    scanCurrent,
    scanTotal,
    scanCurrentFile,
    startScan,
    endScan,
    setIsScanning,
  };
}

export default useLibraryScan;
