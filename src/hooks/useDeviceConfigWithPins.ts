import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ParsedAxisConfig, ParsedButtonConfig, PinFunction } from '@/lib/types';

interface DevicePinAssignments {
  [gpioPin: number]: PinFunction;
}

interface ParsedConfigurationWithPins {
  axes: ParsedAxisConfig[];
  buttons: ParsedButtonConfig[];
  pinAssignments: DevicePinAssignments;
}

export function useDeviceConfigWithPins() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  // Read and parse the device configuration including pin assignments in one call
  const readConfigurationWithPins = useCallback(async (): Promise<ParsedConfigurationWithPins | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Call the combined config command
      const result: [ParsedAxisConfig[], ParsedButtonConfig[], Record<string, string>] = 
        await invoke('read_parsed_device_config_with_pins');
      const [axes, buttons, pinAssignmentsRaw] = result;
      
      // Convert string keys to numbers and string values to PinFunction
      const pinAssignments: DevicePinAssignments = {};
      Object.entries(pinAssignmentsRaw).forEach(([gpioPin, pinFunction]) => {
        const gpioNumber = parseInt(gpioPin, 10);
        if (!isNaN(gpioNumber) && isPinFunction(pinFunction)) {
          pinAssignments[gpioNumber] = pinFunction;
        }
      });
      
      setLastLoaded(new Date());
      
      return {
        axes,
        buttons,
        pinAssignments,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to read device configuration';
      setError(errorMessage);
      console.error('Failed to read device config with pins:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if configuration is available (try a quick read)
  const checkConfiguration = useCallback(async (): Promise<boolean> => {
    try {
      await invoke('read_parsed_device_config_with_pins');
      return true;
    } catch (err) {
      console.warn('Configuration not available:', err);
      return false;
    }
  }, []);

  return {
    // State
    isLoading,
    error,
    lastLoaded,
    
    // Actions
    readConfigurationWithPins,
    checkConfiguration,
    
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