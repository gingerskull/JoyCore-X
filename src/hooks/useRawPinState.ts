import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  RAW_STATE_CONFIG, 
  type RawGpioStates, 
  type MatrixState, 
  type ShiftRegisterState 
} from '@/lib/dev-config';

/**
 * Hook for reading raw hardware pin states from the connected device
 * Only activates when displayMode is 'raw' or 'both'
 */
export function useRawPinState() {
  const [gpioStates, setGpioStates] = useState<number>(0);
  const [matrixStates, setMatrixStates] = useState<MatrixState | null>(null);
  const [shiftRegStates, setShiftRegStates] = useState<ShiftRegisterState[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [displayMode, setDisplayMode] = useState<string>('hid');
  const [error, setError] = useState<string | null>(null);

  // Track previous states for change detection
  const prevGpioStates = useRef<number>(0);

  useEffect(() => {
    // Get display mode from backend
    invoke<string>('get_raw_state_display_mode')
      .then((mode: string) => {
        setDisplayMode(mode);
        
        // Only proceed if raw states should be displayed
        if (mode === 'hid') return;
        
        // Start monitoring if needed
        if (mode === 'raw' || mode === 'both') {
          startMonitoring();
        }
      })
      .catch((err: any) => {
        console.error('Failed to get display mode:', err);
        setError(`Failed to get display mode: ${err}`);
      });

    return () => {
      if (isMonitoring) {
        stopMonitoring();
      }
    };
  }, []);

  // Handle state changes and logging
  useEffect(() => {
    if (RAW_STATE_CONFIG.logStateChanges && gpioStates !== prevGpioStates.current) {
      console.log('GPIO states changed:', {
        previous: `0x${prevGpioStates.current.toString(16).padStart(8, '0')}`,
        current: `0x${gpioStates.toString(16).padStart(8, '0')}`,
        changed: gpioStates ^ prevGpioStates.current,
      });
      prevGpioStates.current = gpioStates;
    }
  }, [gpioStates]);

  const startMonitoring = async () => {
    try {
      setError(null);
      
      // Subscribe to events first
      const unsubscribeGpio = await listen<RawGpioStates>('raw-gpio-changed', (event) => {
        setGpioStates(event.payload.gpio_mask);
      });

      const unsubscribeMatrix = await listen<MatrixState>('raw-matrix-changed', (event) => {
        setMatrixStates(event.payload);
      });

      const unsubscribeShift = await listen<ShiftRegisterState[]>('raw-shift-changed', (event) => {
        setShiftRegStates(event.payload);
      });

      // Start firmware monitoring
      await invoke('start_raw_state_monitoring');
      setIsMonitoring(true);

      // Store unsubscribe functions for cleanup
      // Note: In a real implementation, you'd want to properly manage these
      (window as any).__rawStateCleanup = {
        unsubscribeGpio,
        unsubscribeMatrix,
        unsubscribeShift,
      };

    } catch (err) {
      console.error('Failed to start monitoring:', err);
      setError(`Failed to start monitoring: ${err}`);
    }
  };

  const stopMonitoring = async () => {
    try {
      // Stop firmware monitoring
      await invoke('stop_raw_state_monitoring');
      setIsMonitoring(false);

      // Clean up event listeners
      const cleanup = (window as any).__rawStateCleanup;
      if (cleanup) {
        cleanup.unsubscribeGpio();
        cleanup.unsubscribeMatrix();
        cleanup.unsubscribeShift();
        delete (window as any).__rawStateCleanup;
      }
    } catch (err) {
      console.error('Failed to stop monitoring:', err);
      setError(`Failed to stop monitoring: ${err}`);
    }
  };

  // Expose debug API if enabled
  useEffect(() => {
    if (RAW_STATE_CONFIG.enableConsoleAPI) {
      (window as any).__rawState = {
        states: { gpioStates, matrixStates, shiftRegStates },
        controls: {
          start: startMonitoring,
          stop: stopMonitoring,
          readGpio: () => invoke<RawGpioStates>('read_raw_gpio_states'),
          readMatrix: () => invoke<MatrixState>('read_raw_matrix_state'),
          readShiftReg: () => invoke<ShiftRegisterState[]>('read_raw_shift_reg_state'),
          readAll: () => invoke('read_all_raw_states'),
        },
        config: RAW_STATE_CONFIG,
      };
    }

    return () => {
      if (RAW_STATE_CONFIG.enableConsoleAPI) {
        delete (window as any).__rawState;
      }
    };
  }, [gpioStates, matrixStates, shiftRegStates, isMonitoring]);

  // Manual read functions for one-shot reads
  const readGpioStates = async (): Promise<RawGpioStates | null> => {
    try {
      return await invoke<RawGpioStates>('read_raw_gpio_states');
    } catch (err) {
      console.error('Failed to read GPIO states:', err);
      setError(`Failed to read GPIO states: ${err}`);
      return null;
    }
  };

  const readMatrixState = async (): Promise<MatrixState | null> => {
    try {
      return await invoke<MatrixState>('read_raw_matrix_state');
    } catch (err) {
      console.error('Failed to read matrix state:', err);
      setError(`Failed to read matrix state: ${err}`);
      return null;
    }
  };

  const readShiftRegState = async (): Promise<ShiftRegisterState[] | null> => {
    try {
      return await invoke<ShiftRegisterState[]>('read_raw_shift_reg_state');
    } catch (err) {
      console.error('Failed to read shift register state:', err);
      setError(`Failed to read shift register state: ${err}`);
      return null;
    }
  };

  return {
    // Current states
    gpioStates,
    matrixStates,
    shiftRegStates,
    
    // Status
    isMonitoring,
    displayMode,
    isEnabled: displayMode === 'raw' || displayMode === 'both',
    error,
    
    // Manual read functions
    readGpioStates,
    readMatrixState,
    readShiftRegState,
    
    // Control functions
    startMonitoring,
    stopMonitoring,
  };
}