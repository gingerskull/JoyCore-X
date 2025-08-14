import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PinFunction } from '@/lib/types';

interface DevicePinAssignments {
  [gpioPin: number]: PinFunction;
}

export function useDevicePinReader() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  // Read pin assignments from the device configuration
  const readPinAssignments = useCallback(async (): Promise<DevicePinAssignments | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Call the new pin assignments command
      const result: Record<string, string> = await invoke('read_device_pin_assignments');
      
      // Convert string keys to numbers and string values to PinFunction
      const pinAssignments: DevicePinAssignments = {};
      Object.entries(result).forEach(([gpioPin, pinFunction]) => {
        const gpioNumber = parseInt(gpioPin, 10);
        if (!isNaN(gpioNumber) && isPinFunction(pinFunction)) {
          pinAssignments[gpioNumber] = pinFunction;
        }
      });
      
      setLastLoaded(new Date());
      
      return pinAssignments;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to read device pin assignments';
      setError(errorMessage);
      console.error('Failed to read device pin assignments:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if pin assignments are available (try a quick read)
  const checkPinAssignments = useCallback(async (): Promise<boolean> => {
    try {
      await invoke('read_device_pin_assignments');
      return true;
    } catch (err) {
      console.warn('Pin assignments not available:', err);
      return false;
    }
  }, []);

  return {
    // State
    isLoading,
    error,
    lastLoaded,
    
    // Actions
    readPinAssignments,
    checkPinAssignments,
    
    // Utils
    clearError: () => setError(null),
  };
}

// Type guard to check if a string is a valid PinFunction
function isPinFunction(value: string): value is PinFunction {
  const validPinFunctions: PinFunction[] = [
    'PIN_UNUSED',
    'BTN',
    'BTN_ROW',
    'BTN_COL',
    'SHIFTREG_PL',
    'SHIFTREG_CLK',
    'SHIFTREG_QH',
    'ANALOG_AXIS',
    'SPI0_RX',
    'SPI0_CSn',
    'SPI0_SCK',
    'SPI0_TX',
    'SPI1_RX',
    'SPI1_CSn',
    'SPI1_SCK',
    'SPI1_TX',
    'I2C0_SDA',
    'I2C0_SCL',
    'I2C1_SDA',
    'I2C1_SCL',
    'UART0_TX',
    'UART0_RX',
    'UART1_TX',
    'UART1_RX',
    'PWM0_A',
    'PWM0_B',
    'PWM1_A',
    'PWM1_B',
    'PWM2_A',
    'PWM2_B',
    'PWM3_A',
    'PWM3_B',
    'PWM4_A',
    'PWM4_B',
    'PWM5_A',
    'PWM5_B',
    'PWM6_A',
    'PWM6_B',
    'PWM7_A',
    'PWM7_B',
  ];
  
  return validPinFunctions.includes(value as PinFunction);
}