import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  RAW_STATE_CONFIG, 
  type RawGpioStates, 
  type MatrixState, 
  type ShiftRegisterState 
} from '@/lib/dev-config';
import { useDisplayMode } from '@/contexts/DisplayModeContext';

/**
 * Hook for reading raw hardware pin states from the connected device
 * Only activates when displayMode is 'raw' or 'both'
 */
export function useRawPinState() {
  const [gpioStates, setGpioStates] = useState<number>(0);
  const [matrixStates, setMatrixStates] = useState<MatrixState | null>(null);
  const [shiftRegStates, setShiftRegStates] = useState<ShiftRegisterState[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get display mode from context
  const { displayMode } = useDisplayMode();

  // Track previous states for change detection
  const prevGpioStates = useRef<number>(0);

  useEffect(() => {
    // Start/stop monitoring based on display mode
    if (displayMode === 'raw' || displayMode === 'both') {
      startMonitoring();
    } else {
      stopMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [displayMode]);

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
      let lastGpioLog = 0;
      const unsubscribeGpio = await listen<RawGpioStates>('raw-gpio-changed', (event) => {
        setGpioStates(event.payload.gpio_mask);
        if (RAW_STATE_CONFIG.enableRawEventLogging) {
          const now = performance.now();
            const delta = lastGpioLog === 0 ? 0 : (now - lastGpioLog);
            lastGpioLog = now;
            // Using console.debug to reduce noise; switch to log if needed
            console.debug('[RAW_EVT][GPIO]', {
              t_ms: now.toFixed(3),
              delta_ms: delta.toFixed(3),
              mask_hex: '0x' + event.payload.gpio_mask.toString(16).padStart(8,'0')
            });
        }
      });

      let lastMatrixLog = 0;
      const unsubscribeMatrix = await listen<MatrixState>('raw-matrix-changed', (event) => {
        setMatrixStates(event.payload);
        if (RAW_STATE_CONFIG.enableRawEventLogging) {
          const now = performance.now();
          const delta = lastMatrixLog === 0 ? 0 : (now - lastMatrixLog);
          lastMatrixLog = now;
          console.debug('[RAW_EVT][MATRIX]', {
            t_ms: now.toFixed(3),
            delta_ms: delta.toFixed(3),
            connections: event.payload.connections.length
          });
        }
      });

      let lastShiftLog = 0;
      const unsubscribeShift = await listen<ShiftRegisterState[]>('raw-shift-changed', (event) => {
        // Merge incremental shift register updates (backend emits one register per event)
        setShiftRegStates(prev => {
          if (!event.payload || event.payload.length === 0) return prev;
          // Build map of existing states
          const map = new Map<number, ShiftRegisterState>();
          for (const r of prev) map.set(r.register_id, r);
          // Apply updates
            for (const upd of event.payload) {
              map.set(upd.register_id, upd);
            }
          return Array.from(map.values()).sort((a,b)=>a.register_id - b.register_id);
        });
        if (RAW_STATE_CONFIG.enableRawEventLogging) {
          const now = performance.now();
          const delta = lastShiftLog === 0 ? 0 : (now - lastShiftLog);
          lastShiftLog = now;
          console.debug('[RAW_EVT][SHIFT]', {
            t_ms: now.toFixed(3),
            delta_ms: delta.toFixed(3),
            registers: event.payload.map(r => ({ id: r.register_id, value: '0x'+r.value.toString(16).padStart(2,'0')}))
          });
        }
      });

      // Start firmware monitoring - it might already be running
      try {
        await invoke('start_raw_state_monitoring');
      } catch (startErr) {
        // If monitoring is already running, that's OK
        console.warn('Note: Monitoring might already be running:', startErr);
      }
      
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