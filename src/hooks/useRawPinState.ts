import { useState, useEffect, useRef, useCallback } from 'react';
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

  // Track previous states for change detection (event-level gating)
  const prevGpioStates = useRef<number>(0);
  const prevMatrixSigRef = useRef<string>("");
  const shiftRegMapRef = useRef<Map<number, ShiftRegisterState>>(new Map());

  // Typed window helpers to avoid `any` usage
  type CleanupFns = {
    unsubscribeGpio: () => void;
    unsubscribeMatrix: () => void;
    unsubscribeShift: () => void;
  };
  type WindowWithRawState = Window & {
    __rawStateCleanup?: CleanupFns;
    __rawState?: {
      states: { gpioStates: number; matrixStates: MatrixState | null; shiftRegStates: ShiftRegisterState[] };
      controls: {
        start: () => Promise<void> | void;
        stop: () => Promise<void> | void;
        readGpio: () => Promise<RawGpioStates>;
        readMatrix: () => Promise<MatrixState>;
        readShiftReg: () => Promise<ShiftRegisterState[]>;
        readAll: () => Promise<unknown>;
      };
      config: typeof RAW_STATE_CONFIG;
    };
  };

  const startMonitoring = useCallback(async () => {
    try {
      setError(null);
      
      // Subscribe to events first
      let lastGpioLog = 0;
      const unsubscribeGpio = await listen<RawGpioStates>('raw-gpio-changed', (event) => {
        const newMask = event.payload.gpio_mask;
        if (newMask === prevGpioStates.current) {
          // No actual change; skip state update and log
          return;
        }
        prevGpioStates.current = newMask;
        setGpioStates(newMask);
        if (RAW_STATE_CONFIG.enableRawEventLogging) {
          const now = performance.now();
          const delta = lastGpioLog === 0 ? 0 : (now - lastGpioLog);
          lastGpioLog = now;
          // Using console.debug to reduce noise; switch to log if needed
          console.debug('[RAW_EVT][GPIO]', {
            t_ms: now.toFixed(3),
            delta_ms: delta.toFixed(3),
            mask_hex: '0x' + newMask.toString(16).padStart(8,'0')
          });
        }
      });

      let lastMatrixLog = 0;
    const unsubscribeMatrix = await listen<MatrixState>('raw-matrix-changed', (event) => {
        const payload = event.payload;
        // Build a stable signature of connections to detect actual change
        const sig = payload.connections
      .map(c => `${c.row},${c.col}:${c.is_connected ? 1 : 0}`)
          .sort()
          .join('|');
        if (sig === prevMatrixSigRef.current) {
          return; // no change
        }
        prevMatrixSigRef.current = sig;
        setMatrixStates(payload);
        if (RAW_STATE_CONFIG.enableRawEventLogging) {
          const now = performance.now();
          const delta = lastMatrixLog === 0 ? 0 : (now - lastMatrixLog);
          lastMatrixLog = now;
          console.debug('[RAW_EVT][MATRIX]', {
            t_ms: now.toFixed(3),
            delta_ms: delta.toFixed(3),
            connections: payload.connections.length
          });
        }
      });

      let lastShiftLog = 0;
      const unsubscribeShift = await listen<ShiftRegisterState[]>('raw-shift-changed', (event) => {
        const updates = event.payload;
        if (!updates || updates.length === 0) return;
        // Compare against cached full map to detect actual changes
        const map = new Map(shiftRegMapRef.current);
        let changed = false;
        for (const upd of updates) {
          const prevVal = map.get(upd.register_id);
          if (!prevVal || prevVal.value !== upd.value) {
            map.set(upd.register_id, upd);
            changed = true;
          }
        }
        if (!changed) { return; }
        shiftRegMapRef.current = map;
        const nextArray: ShiftRegisterState[] = Array.from(map.values())
          .sort((a, b) => a.register_id - b.register_id);
        setShiftRegStates(nextArray);
        if (RAW_STATE_CONFIG.enableRawEventLogging) {
          const now = performance.now();
          const delta = lastShiftLog === 0 ? 0 : (now - lastShiftLog);
          lastShiftLog = now;
          console.debug('[RAW_EVT][SHIFT]', {
            t_ms: now.toFixed(3),
            delta_ms: delta.toFixed(3),
            registers: updates.map(r => ({ id: r.register_id, value: '0x'+r.value.toString(16).padStart(2,'0')}))
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
  (window as unknown as WindowWithRawState).__rawStateCleanup = {
        unsubscribeGpio,
        unsubscribeMatrix,
        unsubscribeShift,
      };

    } catch (err) {
      console.error('Failed to start monitoring:', err);
      setError(`Failed to start monitoring: ${err}`);
    }
  }, []);

  const stopMonitoring = useCallback(async () => {
    try {
      // Stop firmware monitoring
      await invoke('stop_raw_state_monitoring');
      setIsMonitoring(false);

      // Clean up event listeners
      const cleanup = (window as unknown as WindowWithRawState).__rawStateCleanup;
      if (cleanup) {
        cleanup.unsubscribeGpio();
        cleanup.unsubscribeMatrix();
        cleanup.unsubscribeShift();
        delete (window as unknown as WindowWithRawState).__rawStateCleanup;
      }
    } catch (err) {
      console.error('Failed to stop monitoring:', err);
      setError(`Failed to stop monitoring: ${err}`);
    }
  }, []);

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
  }, [displayMode, startMonitoring, stopMonitoring]);

  // Handle state changes and logging (component-level; keep quiet if event handler already gated)
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

  // Expose debug API if enabled
  useEffect(() => {
    if (RAW_STATE_CONFIG.enableConsoleAPI) {
      (window as unknown as WindowWithRawState).__rawState = {
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
        delete (window as unknown as WindowWithRawState).__rawState;
      }
    };
  }, [gpioStates, matrixStates, shiftRegStates, isMonitoring, startMonitoring, stopMonitoring]);

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